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

import type { Span, Tracer } from '../platform/tracer'
import { EvidenceMemoryPipeline, type MemoryInfluence } from './evidence-memory'
import {
  buildDelegationSnapshot,
  buildHealthSnapshot,
  buildModelGovernanceSnapshot,
  buildSandboxSnapshot,
  buildSubsystemSnapshot,
  buildTaskTriageSnapshot,
  buildWorkspaceSnapshot,
} from './snapshot-builders'

// ── Types ────────────────────────────────────────────────────────────────

export type Mode = 'operations' | 'engineering' | 'research' | 'design' | 'governance'

export type Intent =
  | 'system_health' // "what's wrong with the system?"
  | 'code_review' // "review this file/subsystem"
  | 'architecture' // "explain the architecture"
  | 'file_operations' // "list files", "read file X"
  | 'task_management' // "create a ticket", "what's in progress?"
  | 'agent_management' // "who are the agents?", "agent status"
  | 'general' // anything else

export interface GroundedContext {
  mode: Mode
  intent: Intent
  truth: string // structured runtime truth block
  memoryHints: string // relevant memory context
  systemRules: string // anti-hallucination rules
  influence: MemoryInfluence // what informed this context
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

// ── Mode Classification ──────────────────────────────────────────────────

export function classifyMode(message: string, agentRole?: string): Mode {
  // Agent role takes priority
  if (agentRole) {
    const role = agentRole.toLowerCase()
    if (role.includes('design') || role.includes('ui') || role.includes('ux')) return 'design'
    if (role.includes('security') || role.includes('soc') || role.includes('ops'))
      return 'operations'
    if (role.includes('engineer') || role.includes('dev') || role.includes('code'))
      return 'engineering'
    if (role.includes('research') || role.includes('analyst')) return 'research'
    if (role.includes('ceo') || role.includes('head') || role.includes('govern'))
      return 'governance'
  }

  // Fall back to message content
  const lower = message.toLowerCase()
  if (lower.match(/design|ui|ux|layout|color|style|component|css/)) return 'design'
  if (lower.match(/status|health|incident|alert|deploy|runtime|monitor/)) return 'operations'
  if (lower.match(/code|file|function|class|module|refactor|bug|test|build/)) return 'engineering'
  if (lower.match(/research|investigate|explore|analyze|compare|benchmark/)) return 'research'
  if (lower.match(/policy|governance|permission|role|scope|budget|okr/)) return 'governance'

  return 'engineering' // default for a coding system
}

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
  tracer?: Tracer,
  parentSpan?: Span,
): GroundedContext {
  const span = tracer?.start('truth.inject', {
    traceId: parentSpan?.traceId,
    parentSpanId: parentSpan?.spanId,
  })

  try {
    const mode = classifyMode(userMessage, agentRole)
    const intent = classifyIntent(userMessage)
    const truthBlocks: string[] = []
    const snapshotsUsed: string[] = []

    // Always inject workspace truth (so agents know the file structure)
    const workspace = buildWorkspaceSnapshot()
    truthBlocks.push(formatWorkspaceTruth(workspace))
    snapshotsUsed.push('workspace')

    // Mode-based snapshot selection (each mode gets different defaults)
    switch (mode) {
      case 'operations': {
        const health = buildHealthSnapshot()
        const sandbox = buildSandboxSnapshot()
        const delegation = buildDelegationSnapshot()
        truthBlocks.push(formatHealthTruth(health))
        truthBlocks.push(formatSandboxTruth(sandbox))
        truthBlocks.push(formatDelegationTruth(delegation))
        snapshotsUsed.push('health', 'sandbox', 'delegation')
        break
      }
      case 'engineering': {
        const model = buildModelGovernanceSnapshot()
        truthBlocks.push(formatModelTruth(model))
        snapshotsUsed.push('model_governance')
        // Plus subsystem detail if mentioned
        const subsystem = extractSubsystemName(userMessage, workspace.serviceDirectories)
        if (subsystem) {
          const sub = buildSubsystemSnapshot(subsystem)
          truthBlocks.push(formatSubsystemTruth(subsystem, sub))
          snapshotsUsed.push(`subsystem:${subsystem}`)
        }
        break
      }
      case 'governance': {
        const health = buildHealthSnapshot()
        const delegation = buildDelegationSnapshot()
        truthBlocks.push(formatHealthTruth(health))
        truthBlocks.push(formatDelegationTruth(delegation))
        snapshotsUsed.push('health', 'delegation')
        break
      }
      default:
        break
    }

    // Intent-specific refinement (adds to mode defaults)
    switch (intent) {
      case 'system_health': {
        if (!snapshotsUsed.includes('health')) {
          truthBlocks.push(formatHealthTruth(buildHealthSnapshot()))
          snapshotsUsed.push('health')
        }
        if (!snapshotsUsed.includes('sandbox')) {
          truthBlocks.push(formatSandboxTruth(buildSandboxSnapshot()))
          snapshotsUsed.push('sandbox')
        }
        break
      }
      case 'code_review':
      case 'file_operations': {
        const subsystem = extractSubsystemName(userMessage, workspace.serviceDirectories)
        if (subsystem && !snapshotsUsed.includes(`subsystem:${subsystem}`)) {
          const sub = buildSubsystemSnapshot(subsystem)
          truthBlocks.push(formatSubsystemTruth(subsystem, sub))
          snapshotsUsed.push(`subsystem:${subsystem}`)
        }
        break
      }
      case 'agent_management': {
        if (!snapshotsUsed.includes('delegation')) {
          truthBlocks.push(formatDelegationTruth(buildDelegationSnapshot()))
          snapshotsUsed.push('delegation')
        }
        break
      }
      case 'task_management': {
        const triage = buildTaskTriageSnapshot()
        truthBlocks.push(formatTaskTriageTruth(triage))
        snapshotsUsed.push('task_triage')
        break
      }
      default:
        break
    }

    // Memory hints (role-based)
    const memoryHints = agentRole
      ? `\n## Your Role\nYou are ${agentName ?? 'an agent'}, mode: ${mode}, role: ${agentRole}. Act within your role's expertise.`
      : ''

    // Build memory influence tracking
    const influence = EvidenceMemoryPipeline.buildInfluence([], snapshotsUsed)

    span?.setAttribute('mode', mode)
    span?.setAttribute('snapshotCount', snapshotsUsed.length)

    return {
      mode,
      intent,
      truth: truthBlocks.join('\n\n'),
      memoryHints,
      systemRules: SYSTEM_RULES,
      influence,
    }
  } catch (err) {
    span?.recordError(err)
    throw err
  } finally {
    span?.end()
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

function formatDelegationTruth(d: ReturnType<typeof buildDelegationSnapshot>): string {
  if (d.totalAgents === 0) return `## RUNTIME TRUTH: Delegation\nNo agents tracked yet.`
  return `## RUNTIME TRUTH: Delegation
Total agents: ${d.totalAgents}
Idle: ${d.idleAgents}
Busy: ${d.busyAgents}
${d.activeAgents
  .slice(0, 10)
  .map((a) => `- ${a.name}: ${a.status}`)
  .join('\n')}`
}

function formatModelTruth(m: ReturnType<typeof buildModelGovernanceSnapshot>): string {
  return `## RUNTIME TRUTH: Model Governance
Default model: ${m.defaultModel}
Primary route: ${m.primaryRoute}
Providers configured: ${m.providersConfigured.join(', ') || 'none'}`
}

function formatTaskTriageTruth(t: ReturnType<typeof buildTaskTriageSnapshot>): string {
  if (t.totalTickets === 0) return `## RUNTIME TRUTH: Task Triage\nNo tickets in system.`
  const statusLines = Object.entries(t.byStatus)
    .map(([s, n]) => `  ${s}: ${n}`)
    .join('\n')
  const priorityLines = Object.entries(t.byPriority)
    .map(([p, n]) => `  ${p}: ${n}`)
    .join('\n')
  return `## RUNTIME TRUTH: Task Triage
Total tickets: ${t.totalTickets}
Blocked: ${t.blockedCount}
By status:\n${statusLines || '  (none)'}
By priority:\n${priorityLines || '  (none)'}
Oldest unassigned: ${t.oldestUnassigned ?? 'none'}`
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
