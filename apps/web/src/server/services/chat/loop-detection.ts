/**
 * Tool Loop Detection — prevents agents from getting stuck calling
 * the same tool repeatedly with identical arguments.
 *
 * Inspired by PraisonAI's loop_detection.py and OpenClaw's detectors.
 * Three detectors: generic_repeat, poll_no_progress, ping_pong.
 * Zero overhead when disabled.
 */

import { createHash } from 'crypto'

// ── Types ─────────────────────────────────────────────────────────────

export interface LoopDetectionConfig {
  enabled: boolean
  /** Sliding window size */
  historySize: number
  /** Identical calls before warning */
  warnThreshold: number
  /** Identical calls before circuit-break */
  criticalThreshold: number
  detectors: {
    genericRepeat: boolean
    pollNoProgress: boolean
    pingPong: boolean
  }
}

export interface ToolCallRecord {
  toolName: string
  argsHash: string
  resultHash: string | null
  timestamp: number
}

export interface LoopDetectionResult {
  stuck: boolean
  level?: 'warning' | 'critical'
  detector?: string
  message?: string
  count: number
}

// ── Defaults ──────────────────────────────────────────────────────────

export const DEFAULT_LOOP_CONFIG: LoopDetectionConfig = {
  enabled: true,
  historySize: 20,
  warnThreshold: 3, // DeerFlow uses 3 (was 10) — catch loops early
  criticalThreshold: 5, // DeerFlow uses 5 (was 20) — force stop quickly
  detectors: {
    genericRepeat: true,
    pollNoProgress: true,
    pingPong: true,
  },
}

const NOT_STUCK: LoopDetectionResult = { stuck: false, count: 0 }

// ── Hashing ───────────────────────────────────────────────────────────

function stableJSON(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableJSON).join(',') + ']'
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort()
    const parts = keys.map(
      (k) => JSON.stringify(k) + ':' + stableJSON((value as Record<string, unknown>)[k]),
    )
    return '{' + parts.join(',') + '}'
  }
  try {
    return JSON.stringify(String(value))
  } catch {
    return '"<unserializable>"'
  }
}

function sha256(text: string, prefixLen: number = 16): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, prefixLen)
}

export function hashToolCall(toolName: string, args: unknown): string {
  return sha256(stableJSON({ t: toolName, a: args }))
}

function hashResult(result: unknown): string | null {
  if (result === null || result === undefined) return null
  try {
    return sha256(stableJSON(result))
  } catch {
    return null
  }
}

// ── History Management ────────────────────────────────────────────────

export function recordToolCall(
  history: ToolCallRecord[],
  toolName: string,
  args: unknown,
  config: LoopDetectionConfig = DEFAULT_LOOP_CONFIG,
): void {
  history.push({
    toolName,
    argsHash: hashToolCall(toolName, args),
    resultHash: null,
    timestamp: Date.now(),
  })
  // Trim sliding window
  while (history.length > config.historySize) {
    history.shift()
  }
}

export function recordToolOutcome(
  history: ToolCallRecord[],
  toolName: string,
  args: unknown,
  result: unknown,
): void {
  const argsHash = hashToolCall(toolName, args)
  const resultH = hashResult(result)
  if (resultH === null) return

  // Update most recent matching record
  for (let i = history.length - 1; i >= 0; i--) {
    const rec = history[i]!
    if (rec.toolName === toolName && rec.argsHash === argsHash && rec.resultHash === null) {
      rec.resultHash = resultH
      return
    }
  }
}

// ── Detectors ─────────────────────────────────────────────────────────

const POLL_KEYWORDS = ['status', 'poll', 'check', 'wait', 'ping', 'health', 'monitor']

function isPollTool(toolName: string): boolean {
  const lower = toolName.toLowerCase()
  return POLL_KEYWORDS.some((kw) => lower.includes(kw))
}

function countGenericRepeat(history: ToolCallRecord[], argsHash: string, toolName: string): number {
  return history.filter((r) => r.toolName === toolName && r.argsHash === argsHash).length
}

function noProgressStreak(history: ToolCallRecord[], argsHash: string, toolName: string): number {
  let streak = 0
  let firstResultHash: string | null = null

  for (let i = history.length - 1; i >= 0; i--) {
    const rec = history[i]!
    if (rec.toolName !== toolName || rec.argsHash !== argsHash) continue
    if (rec.resultHash === null) continue
    if (firstResultHash === null) {
      firstResultHash = rec.resultHash
      streak = 1
    } else if (rec.resultHash === firstResultHash) {
      streak++
    } else {
      break
    }
  }
  return streak
}

function pingPongStreak(history: ToolCallRecord[], currentHash: string): number {
  if (history.length < 2) return 0

  const last = history[history.length - 1]!
  let otherHash: string | null = null
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i]!.argsHash !== last.argsHash) {
      otherHash = history[i]!.argsHash
      break
    }
  }
  if (otherHash === null) return 0

  let count = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const expected = (history.length - 1 - i) % 2 === 0 ? last.argsHash : otherHash
    if (history[i]!.argsHash !== expected) break
    count++
  }

  // Current call must continue the pattern
  const nextExpected = count % 2 === 0 ? last.argsHash : otherHash
  if (currentHash !== nextExpected) return 0

  return count + 1
}

// ── Main Detection ────────────────────────────────────────────────────

/**
 * Detect if an agent is stuck in a tool call loop.
 * Call BEFORE executing the tool. Returns stuck=true with level and message
 * if a loop is detected.
 */
export function detectToolLoop(
  history: ToolCallRecord[],
  toolName: string,
  args: unknown,
  config: LoopDetectionConfig = DEFAULT_LOOP_CONFIG,
): LoopDetectionResult {
  if (!config.enabled) return NOT_STUCK

  const argsHash = hashToolCall(toolName, args)
  const { warnThreshold: warn, criticalThreshold: critical, detectors } = config

  // Detector 1: Poll no progress (stuck polling with same result)
  if (detectors.pollNoProgress && isPollTool(toolName)) {
    const streak = noProgressStreak(history, argsHash, toolName)
    if (streak >= critical) {
      return {
        stuck: true,
        level: 'critical',
        detector: 'poll_no_progress',
        message: `CRITICAL: '${toolName}' called ${streak} times with identical args and result. Stuck polling loop — stop and report failure.`,
        count: streak,
      }
    }
    if (streak >= warn) {
      return {
        stuck: true,
        level: 'warning',
        detector: 'poll_no_progress',
        message: `WARNING: '${toolName}' returned identical results ${streak} times. Likely stuck poll — try a different approach.`,
        count: streak,
      }
    }
  }

  // Detector 2: Ping-pong (alternating A→B→A→B)
  if (detectors.pingPong) {
    const ppCount = pingPongStreak(history, argsHash)
    if (ppCount >= critical) {
      return {
        stuck: true,
        level: 'critical',
        detector: 'ping_pong',
        message: `CRITICAL: Ping-pong loop detected (${ppCount} alternating calls). Agent oscillating between two tool states — stop and report failure.`,
        count: ppCount,
      }
    }
    if (ppCount >= warn) {
      return {
        stuck: true,
        level: 'warning',
        detector: 'ping_pong',
        message: `WARNING: Alternating tool pattern detected (${ppCount} calls). Stop ping-pong and try a different approach.`,
        count: ppCount,
      }
    }
  }

  // Detector 3: Generic repeat (same tool + same args N times)
  if (detectors.genericRepeat && !isPollTool(toolName)) {
    const count = countGenericRepeat(history, argsHash, toolName)
    if (count >= critical) {
      return {
        stuck: true,
        level: 'critical',
        detector: 'generic_repeat',
        message: `CRITICAL: '${toolName}' called ${count} times with identical args. Agent is stuck — execution blocked.`,
        count,
      }
    }
    if (count >= warn) {
      return {
        stuck: true,
        level: 'warning',
        detector: 'generic_repeat',
        message: `WARNING: '${toolName}' called ${count} times with identical args. If not making progress, stop and report failure.`,
        count,
      }
    }
  }

  return NOT_STUCK
}
