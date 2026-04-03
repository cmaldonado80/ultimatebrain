/**
 * Truth Injection Layer
 *
 * The central grounding system. Before ANY agent responds, this layer:
 * 1. Classifies the user's intent
 * 2. Selects which runtime snapshots are relevant
 * 3. Retrieves relevant memory slices
 * 4. Assembles a structured "grounded context" block
 * 5. Injects it into the system prompt
 *
 * This is what prevents agents from "inventing topology."
 * Agents consume truth — they do not discover it.
 *
 * Architecture (from the Memory + System-Truth Injection pattern):
 *   Layer 1: Canonical runtime truth (snapshot builders)
 *   Layer 2: Operating memory (tiered, selective)
 *   Layer 3: Response-time truth injection (this file)
 */

import {
  buildHealthSnapshot,
  buildSandboxSnapshot,
  buildSubsystemSnapshot,
  buildWorkspaceSnapshot,
} from './snapshot-builders'

// ── Types ────────────────────────────────────────────────────────────────

export type Intent =
  | 'system_health' // "what's wrong with the system?"
  | 'code_review' // "review this file/subsystem"
  | 'architecture' // "explain the architecture"
  | 'file_operations' // "list files", "read file X"
  | 'task_management' // "create a ticket", "what's in progress?"
  | 'agent_management' // "who are the agents?", "agent status"
  | 'general' // anything else

export interface GroundedContext {
  intent: Intent
  truth: string // structured runtime truth block
  memoryHints: string // relevant memory context
  systemRules: string // anti-hallucination rules
}

// ── Anti-Hallucination Rules (Critical Memory) ──────────────────────────

const SYSTEM_RULES = `
## CRITICAL SYSTEM RULES — NEVER VIOLATE
- You HAVE access to tools. Use them. Do not say you cannot access files.
- When listing directories, trust the tool result completely. Do not filter or omit entries.
- If a tool returns 36 entries, report ALL 36 entries — not 12.
- Do NOT claim files or directories don't exist without first using file_system with action "read" or "list" to verify.
- Do NOT invent, guess, or assume system topology. Use ONLY the runtime truth provided below.
- Do NOT rely on prior conversation context about file structure. Always use fresh tool results.
- When reading files, the working directory is the web app root (apps/web/). Use paths relative to it: src/server/services/healing/cortex.ts (NOT apps/web/src/...)
- If a tool call fails, try the alternative path format before concluding the file doesn't exist.
`.trim()

// ── Intent Classification ────────────────────────────────────────────────

export function classifyIntent(message: string): Intent {
  const lower = message.toLowerCase()

  // Order matters: more specific patterns first
  if (
    lower.match(
      /review|audit|analyz|inspect|code quality|what.*does.*do|improve|read.*\.ts|read.*file/,
    )
  )
    return 'code_review'
  if (lower.match(/health|status|what.*wrong|diagnose|degraded|cortex/)) return 'system_health'
  if (lower.match(/architect|structure|how.*work|design|pattern|subsystem/)) return 'architecture'
  if (lower.match(/list.*file|read.*file|file_system|directory|folder|show.*code|open/))
    return 'file_operations'
  if (lower.match(/ticket|task|create.*ticket|assign|backlog|sprint|project/))
    return 'task_management'
  if (lower.match(/agent|department|role|who|team|employee|hire/)) return 'agent_management'

  return 'general'
}

// ── Truth Assembly ───────────────────────────────────────────────────────

/**
 * Build the grounded context for an agent before it responds.
 * This is the main entry point — called before every LLM request.
 */
export function buildGroundedContext(
  userMessage: string,
  agentName?: string,
  agentRole?: string,
): GroundedContext {
  const intent = classifyIntent(userMessage)
  const truthBlocks: string[] = []

  // Always inject workspace truth (so agents know the file structure)
  const workspace = buildWorkspaceSnapshot()
  truthBlocks.push(formatWorkspaceTruth(workspace))

  // Intent-specific truth
  switch (intent) {
    case 'system_health': {
      const health = buildHealthSnapshot()
      const sandbox = buildSandboxSnapshot()
      truthBlocks.push(formatHealthTruth(health))
      truthBlocks.push(formatSandboxTruth(sandbox))
      break
    }
    case 'code_review':
    case 'file_operations': {
      // Extract subsystem name from message if mentioned
      const subsystem = extractSubsystemName(userMessage, workspace.serviceDirectories)
      if (subsystem) {
        const sub = buildSubsystemSnapshot(subsystem)
        truthBlocks.push(formatSubsystemTruth(subsystem, sub))
      }
      break
    }
    case 'architecture': {
      const health = buildHealthSnapshot()
      truthBlocks.push(formatHealthTruth(health))
      break
    }
    case 'agent_management': {
      const health = buildHealthSnapshot()
      truthBlocks.push(formatAgentTruth(health))
      break
    }
    default:
      break
  }

  // Memory hints (role-based)
  const memoryHints = agentRole
    ? `\n## Your Role\nYou are ${agentName ?? 'an agent'}, role: ${agentRole}. Act within your role's expertise.`
    : ''

  return {
    intent,
    truth: truthBlocks.join('\n\n'),
    memoryHints,
    systemRules: SYSTEM_RULES,
  }
}

// ── Formatters (structured data → readable truth blocks) ─────────────────

function formatWorkspaceTruth(ws: ReturnType<typeof buildWorkspaceSnapshot>): string {
  if (!ws.servicesExist) return ''
  return `## RUNTIME TRUTH: Project Structure
Working directory: ${ws.cwd}
Services path: ${ws.servicesPath}
Total service subsystems: ${ws.totalServiceDirs}
Service directories: ${ws.serviceDirectories.join(', ')}
NOTE: This is the COMPLETE list. There are exactly ${ws.totalServiceDirs} directories. Do not omit any.`
}

function formatHealthTruth(h: ReturnType<typeof buildHealthSnapshot>): string {
  return `## RUNTIME TRUTH: System Health
Status: ${h.status}
Risk level: ${h.riskLevel}
Cortex cycles run: ${h.cortexCycles}
Healing actions taken: ${h.totalHealingActions}
Recoveries completed: ${h.totalRecoveries}
Agent degradations: ${h.totalDegradations}
${h.agentProfiles.length > 0 ? `Agent profiles: ${h.agentProfiles.map((a) => `${a.agentName}(${a.level}, pressure:${(a.pressure * 100).toFixed(0)}%)`).join(', ')}` : 'No agent degradation profiles yet.'}`
}

function formatSandboxTruth(s: ReturnType<typeof buildSandboxSnapshot>): string {
  return `## RUNTIME TRUTH: Sandbox
Total executions: ${s.totalExecutions}
Blocked by policy: ${s.blockedByPolicy}
Timeouts: ${s.timeouts}
Crashes: ${s.crashes}
Pool size: ${s.poolSize}
Success rate: ${(s.successRate * 100).toFixed(1)}%`
}

function formatSubsystemTruth(
  name: string,
  sub: ReturnType<typeof buildSubsystemSnapshot>,
): string {
  if (sub.subsystems.length === 0)
    return `## RUNTIME TRUTH: Subsystem "${name}"\nThis subsystem exists but has no entries (or path is wrong).`
  const files = sub.subsystems.filter((e) => e.type === 'file').map((e) => e.name)
  const dirs = sub.subsystems.filter((e) => e.type === 'directory').map((e) => e.name)
  return `## RUNTIME TRUTH: Subsystem "${name}"
Files: ${files.join(', ')}
Subdirectories: ${dirs.join(', ') || 'none'}
Total files: ${sub.totalFiles}
Path: src/server/services/${name}/`
}

function formatAgentTruth(h: ReturnType<typeof buildHealthSnapshot>): string {
  if (h.agentProfiles.length === 0)
    return `## RUNTIME TRUTH: Agents\nNo agent profiles tracked yet.`
  return `## RUNTIME TRUTH: Agent Status
${h.agentProfiles.map((a) => `- ${a.agentName}: level=${a.level}, pressure=${(a.pressure * 100).toFixed(0)}%`).join('\n')}`
}

// ── Helpers ──────────────────────────────────────────────────────────────

function extractSubsystemName(message: string, knownSubsystems: string[]): string | null {
  const lower = message.toLowerCase()
  // Check if any known subsystem name appears in the message
  for (const sub of knownSubsystems) {
    if (lower.includes(sub.toLowerCase())) return sub
  }
  // Check for path-based mentions
  const pathMatch = message.match(/services\/(\w+)/)
  if (pathMatch && knownSubsystems.includes(pathMatch[1]!)) return pathMatch[1]!
  return null
}
