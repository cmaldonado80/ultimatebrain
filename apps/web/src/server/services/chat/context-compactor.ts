/**
 * Context Compactor — prevents token limit breaches in long conversations.
 *
 * Inspired by PraisonAI + DeerFlow TodoMiddleware + Hermes structured compression.
 *
 * Two modes:
 * 1. compact() — fast, drop middle messages (no LLM call)
 * 2. structuredCompact() — LLM-powered summary preserving Goal/Progress/Decisions/Files/NextSteps
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
  todoRecovered: boolean
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
      todoRecovered: false,
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
    const compactedResult = [
      ...systemMessages.map(({ role, content }) => ({ role, content })),
      {
        role: 'system',
        content: `[Context compacted: ${middleMessages.length} messages dropped to fit token limit]`,
      },
      ...recentMessages,
    ]
    // Recover any lost todo/plan state from dropped messages
    const recovery = recoverTodoState(messages, compactedResult)
    const compactedTokens = recovery.messages.reduce((sum, m) => sum + messageTokens(m), 0)
    return {
      messages: recovery.messages,
      compacted: true,
      originalCount,
      compactedCount: recovery.messages.length,
      originalTokens,
      compactedTokens,
      droppedCount: middleMessages.length,
      todoRecovered: recovery.recovered,
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

  const compactedResult: Array<{ role: string; content: string }> = [
    ...systemMessages.map(({ role, content }) => ({ role, content })),
  ]

  if (droppedCount > 0) {
    compactedResult.push({
      role: 'system',
      content: `[Context compacted: ${droppedCount} earlier messages dropped to fit token limit]`,
    })
  }

  compactedResult.push(
    ...keptMiddle.map(({ role, content }) => ({ role, content })),
    ...recentMessages,
  )

  // Recover any lost todo/plan state from dropped messages
  const recovery = recoverTodoState(messages, compactedResult)
  const compactedTokens = recovery.messages.reduce((sum, m) => sum + messageTokens(m), 0)

  return {
    messages: recovery.messages,
    compacted: true,
    originalCount,
    compactedCount: recovery.messages.length,
    originalTokens,
    compactedTokens,
    droppedCount,
    todoRecovered: recovery.recovered,
  }
}

// ── Todo/Plan State Recovery (DeerFlow-inspired) ─────────────────────

/**
 * Patterns that indicate task/plan state in messages.
 * If these existed in the original messages but are missing from compacted
 * messages, we re-inject the state to prevent agents from forgetting their plan.
 */
const TODO_PATTERNS = [
  /(?:todo|task|plan|step)\s*(?:list|items?|tracker)?\s*[:：]\s*/i,
  /(?:\d+\.\s+\[[ x✓✗]\])/i, // Checkbox-style task lists
  /(?:remaining tasks|next steps|pending|in progress)/i,
  /(?:## Plan|## Tasks|## TODO|## Steps)/i,
]

interface TodoRecovery {
  messages: Array<{ role: string; content: string }>
  recovered: boolean
}

/**
 * Extract the last task/plan state from the original messages and re-inject
 * it into the compacted messages if it was lost during compaction.
 *
 * Inspired by DeerFlow's TodoMiddleware context-loss detection.
 */
function recoverTodoState(
  original: Array<{ role: string; content: string }>,
  compacted: Array<{ role: string; content: string }>,
): TodoRecovery {
  // Check if compacted messages already contain todo/plan state
  const compactedText = compacted.map((m) => m.content).join('\n')
  const hasTodoInCompacted = TODO_PATTERNS.some((p) => p.test(compactedText))
  if (hasTodoInCompacted) {
    return { messages: compacted, recovered: false }
  }

  // Find the last message in original that contained todo/plan state
  let lastTodoContent: string | null = null
  for (let i = original.length - 1; i >= 0; i--) {
    const msg = original[i]!
    if (msg.role !== 'assistant') continue
    const hasTodo = TODO_PATTERNS.some((p) => p.test(msg.content))
    if (hasTodo) {
      // Extract just the plan/todo section, not the entire message
      lastTodoContent = extractPlanSection(msg.content)
      break
    }
  }

  if (!lastTodoContent) {
    return { messages: compacted, recovered: false }
  }

  // Inject the recovered plan state after the compaction marker
  const recoveryMessage: { role: string; content: string } = {
    role: 'system',
    content: `[Task state recovered after context compaction — your active plan from earlier is still valid]\n\n${lastTodoContent}`,
  }

  // Insert right after the compaction marker (or after system messages)
  const insertIdx = compacted.findIndex((m) => m.content.includes('[Context compacted'))
  const idx = insertIdx >= 0 ? insertIdx + 1 : 1

  const result = [...compacted]
  result.splice(idx, 0, recoveryMessage)

  return { messages: result, recovered: true }
}

/**
 * Extract the plan/task section from a message, trimming surrounding prose.
 * Keeps numbered lists, checkbox items, and section headers.
 */
function extractPlanSection(content: string): string {
  const lines = content.split('\n')
  const planLines: string[] = []
  let inPlan = false

  for (const line of lines) {
    const trimmed = line.trim()
    // Start capturing at plan headers or numbered/checkbox items
    if (/^##\s*(Plan|Tasks|TODO|Steps|Next)/i.test(trimmed)) {
      inPlan = true
      planLines.push(trimmed)
      continue
    }
    if (/^\d+\.\s/.test(trimmed) || /^[-*]\s*\[/.test(trimmed)) {
      inPlan = true
      planLines.push(trimmed)
      continue
    }
    if (inPlan) {
      // Keep indented continuation lines
      if (/^\s+/.test(line) || trimmed === '') {
        planLines.push(trimmed)
      } else {
        // End of plan section
        break
      }
    }
  }

  return planLines.length > 0 ? planLines.join('\n') : content.slice(0, 500)
}

// ── Structured LLM Compression (Hermes-inspired) ────────────────────

/**
 * The prompt template for structured summarization of dropped messages.
 * Hermes uses Goal/Progress/Decisions/Files/NextSteps — we adopt the same.
 */
const STRUCTURED_SUMMARY_PROMPT = `Summarize the following conversation excerpt into a structured context block. Be specific and include concrete details (file names, function names, decisions made, error messages).

## Conversation to Summarize
{conversation}

## Output Format
Respond with ONLY this structured format:

**Goal:** [What the user is trying to accomplish]
**Progress:**
- Done: [completed steps]
- In Progress: [current work]
- Blocked: [any blockers or issues]
**Key Decisions:** [decisions made and why]
**Relevant Files:** [specific file paths mentioned]
**Next Steps:** [what comes next]
**Critical Context:** [anything that must not be forgotten — error messages, constraints, preferences]`

export interface StructuredSummary {
  raw: string
  tokenEstimate: number
}

/**
 * Generate a structured summary of dropped messages using an LLM.
 * Falls back gracefully to a simple "[Context compacted]" marker if LLM fails.
 *
 * @param droppedMessages - Messages that were removed during compaction
 * @param chatFn - LLM chat function (injected to avoid circular dependency)
 */
export async function generateStructuredSummary(
  droppedMessages: Array<{ role: string; content: string }>,
  chatFn: (messages: Array<{ role: string; content: string }>) => Promise<{ content: string }>,
): Promise<StructuredSummary | null> {
  if (droppedMessages.length === 0) return null

  // Serialize dropped messages, capping at 8000 chars to keep summarizer input manageable
  const maxChars = 8000
  let conversationText = ''
  for (const msg of droppedMessages) {
    const line = `[${msg.role}]: ${msg.content}\n\n`
    if (conversationText.length + line.length > maxChars) {
      conversationText += `\n... (${droppedMessages.length - droppedMessages.indexOf(msg)} more messages truncated)`
      break
    }
    conversationText += line
  }

  const prompt = STRUCTURED_SUMMARY_PROMPT.replace('{conversation}', conversationText)

  try {
    const response = await chatFn([{ role: 'user', content: prompt }])
    return {
      raw: response.content,
      tokenEstimate: estimateTokens(response.content),
    }
  } catch {
    return null
  }
}

/**
 * Enhanced compaction that uses LLM-powered structured summarization
 * instead of simply dropping messages. Falls back to regular compact() on failure.
 *
 * @param messages - Full message history
 * @param config - Compaction configuration
 * @param chatFn - LLM chat function for summarization
 */
export async function structuredCompact(
  messages: Array<{ role: string; content: string }>,
  config: CompactionConfig = DEFAULT_COMPACTION,
  chatFn: (messages: Array<{ role: string; content: string }>) => Promise<{ content: string }>,
): Promise<CompactionResult> {
  const originalTokens = messages.reduce((sum, m) => sum + messageTokens(m), 0)
  if (originalTokens <= config.maxTokens) {
    return {
      messages,
      compacted: false,
      originalCount: messages.length,
      compactedCount: messages.length,
      originalTokens,
      compactedTokens: originalTokens,
      droppedCount: 0,
      todoRecovered: false,
    }
  }

  // Identify which messages would be dropped
  const recentStart = Math.max(0, messages.length - config.preserveRecent)
  const systemMessages = messages.filter((m) => m.role === 'system')
  const droppedMessages = messages.filter((m, i) => m.role !== 'system' && i < recentStart)
  const recentMessages = messages.slice(recentStart)

  // Generate structured summary of dropped messages
  const summary = await generateStructuredSummary(droppedMessages, chatFn)

  if (!summary) {
    // Fallback to regular compaction
    return compact(messages, config)
  }

  // Build result: system + structured summary + recent
  const result: Array<{ role: string; content: string }> = [
    ...systemMessages,
    {
      role: 'system',
      content: `[Structured context summary — ${droppedMessages.length} earlier messages compressed]\n\n${summary.raw}`,
    },
    ...recentMessages,
  ]

  const compactedTokens = result.reduce((sum, m) => sum + messageTokens(m), 0)

  return {
    messages: result,
    compacted: true,
    originalCount: messages.length,
    compactedCount: result.length,
    originalTokens,
    compactedTokens,
    droppedCount: droppedMessages.length,
    todoRecovered: false, // Structured summary inherently preserves task state
  }
}
