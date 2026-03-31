/**
 * Context Compactor — prevents token limit breaches in long conversations.
 *
 * Inspired by PraisonAI's compaction module.
 * Truncates middle messages while preserving system prompt + recent messages.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface CompactionConfig {
  /** Maximum tokens before compaction triggers */
  maxTokens: number
  /** Target token count after compaction (default: 75% of max) */
  targetTokens?: number
  /** Number of recent messages to always preserve */
  preserveRecent: number
  /** Keep system messages */
  preserveSystem: boolean
}

export interface CompactionResult {
  messages: Array<{ role: string; content: string }>
  compacted: boolean
  originalCount: number
  compactedCount: number
  originalTokens: number
  compactedTokens: number
  droppedCount: number
}

// ── Defaults ──────────────────────────────────────────────────────────

export const DEFAULT_COMPACTION: CompactionConfig = {
  maxTokens: 100000,
  preserveRecent: 10,
  preserveSystem: true,
}

// ── Token Estimation ──────────────────────────────────────────────────

/** Estimate token count (~4 chars per token, rough but fast) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function messageTokens(msg: { role: string; content: string }): number {
  return estimateTokens(msg.content) + 4 // overhead for role + formatting
}

// ── Compaction ────────────────────────────────────────────────────────

/**
 * Check if a message list needs compaction.
 */
export function needsCompaction(
  messages: Array<{ role: string; content: string }>,
  config: CompactionConfig = DEFAULT_COMPACTION,
): boolean {
  const total = messages.reduce((sum, m) => sum + messageTokens(m), 0)
  return total > config.maxTokens
}

/**
 * Compact messages by dropping middle messages while preserving:
 * - System messages (if preserveSystem=true)
 * - Last N messages (preserveRecent)
 *
 * Inserts a "[context compacted]" marker where messages were dropped.
 */
export function compact(
  messages: Array<{ role: string; content: string }>,
  config: CompactionConfig = DEFAULT_COMPACTION,
): CompactionResult {
  const originalCount = messages.length
  const originalTokens = messages.reduce((sum, m) => sum + messageTokens(m), 0)
  const targetTokens = config.targetTokens ?? Math.floor(config.maxTokens * 0.75)

  if (originalTokens <= config.maxTokens) {
    return {
      messages,
      compacted: false,
      originalCount,
      compactedCount: originalCount,
      originalTokens,
      compactedTokens: originalTokens,
      droppedCount: 0,
    }
  }

  // Separate protected messages
  const systemMessages: Array<{ role: string; content: string; idx: number }> = []
  const recentStart = Math.max(0, messages.length - config.preserveRecent)
  const recentMessages = messages.slice(recentStart)
  const middleMessages: Array<{ role: string; content: string; idx: number }> = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!
    if (config.preserveSystem && msg.role === 'system') {
      systemMessages.push({ ...msg, idx: i })
    } else if (i < recentStart) {
      middleMessages.push({ ...msg, idx: i })
    }
  }

  // Calculate protected tokens
  const systemTokens = systemMessages.reduce((sum, m) => sum + messageTokens(m), 0)
  const recentTokens = recentMessages.reduce((sum, m) => sum + messageTokens(m), 0)
  const protectedTokens = systemTokens + recentTokens

  // If protected alone exceeds target, just keep system + recent
  if (protectedTokens >= targetTokens) {
    const result = [
      ...systemMessages.map(({ role, content }) => ({ role, content })),
      {
        role: 'system',
        content: `[Context compacted: ${middleMessages.length} messages dropped to fit token limit]`,
      },
      ...recentMessages,
    ]
    const compactedTokens = result.reduce((sum, m) => sum + messageTokens(m), 0)
    return {
      messages: result,
      compacted: true,
      originalCount,
      compactedCount: result.length,
      originalTokens,
      compactedTokens,
      droppedCount: middleMessages.length,
    }
  }

  // Keep as many middle messages as fit (from most recent backward)
  const budgetForMiddle = targetTokens - protectedTokens
  let middleTokens = 0
  let keepFrom = middleMessages.length

  for (let i = middleMessages.length - 1; i >= 0; i--) {
    const tokens = messageTokens(middleMessages[i]!)
    if (middleTokens + tokens > budgetForMiddle) break
    middleTokens += tokens
    keepFrom = i
  }

  const keptMiddle = middleMessages.slice(keepFrom)
  const droppedCount = keepFrom

  const result: Array<{ role: string; content: string }> = [
    ...systemMessages.map(({ role, content }) => ({ role, content })),
  ]

  if (droppedCount > 0) {
    result.push({
      role: 'system',
      content: `[Context compacted: ${droppedCount} earlier messages dropped to fit token limit]`,
    })
  }

  result.push(...keptMiddle.map(({ role, content }) => ({ role, content })), ...recentMessages)

  const compactedTokens = result.reduce((sum, m) => sum + messageTokens(m), 0)

  return {
    messages: result,
    compacted: true,
    originalCount,
    compactedCount: result.length,
    originalTokens,
    compactedTokens,
    droppedCount,
  }
}
