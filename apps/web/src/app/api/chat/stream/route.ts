export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createDb, createMiniBrainDb, type Database, waitForSchema } from '@solarc/db'
import {
  agents,
  brainEntities,
  brainEntityAgents,
  chatMessages,
  chatRuns,
  chatRunSteps,
  chatSessions,
  instincts,
} from '@solarc/db'
import { desc, eq, sql } from 'drizzle-orm'

import { auth } from '../../../../server/auth'
import { buildAtlasContext } from '../../../../server/services/atlas'
import {
  compact,
  needsCompaction,
  structuredCompact,
} from '../../../../server/services/chat/context-compactor'
import { AGENT_TOOLS, executeTool } from '../../../../server/services/chat/tool-executor'
import { GatewayRouter } from '../../../../server/services/gateway'
import { GuardrailEngine } from '../../../../server/services/guardrails'
import { sanitizeContext } from '../../../../server/services/guardrails/input-scanner'
import { InstinctInjector } from '../../../../server/services/instincts/injector'
import { observeRunCompletion } from '../../../../server/services/instincts/run-observer'
import type { Instinct } from '../../../../server/services/instincts/types'
import {
  computeRunQualityScore,
  refreshInsights,
} from '../../../../server/services/intelligence/recommendation-engine'
import { ContextPipeline } from '../../../../server/services/memory/context-pipeline'
import { createEmbedFn } from '../../../../server/services/memory/embed-helper'
import { smartMemoryAdd } from '../../../../server/services/memory/memory-intelligence'
import { MemoryService } from '../../../../server/services/memory/memory-service'
import { eventBus } from '../../../../server/services/orchestration/event-bus'
import { TokenLedgerService } from '../../../../server/services/platform/token-ledger'

// ── Tool Access Control ─────────────────────────────────────────────────

/** Filter AGENT_TOOLS based on agent's toolAccess whitelist.
 *  If toolAccess is null/undefined/empty, return all tools (backward compatible). */
function filterToolsForAgent(tools: typeof AGENT_TOOLS, toolAccess?: string[]): typeof AGENT_TOOLS {
  if (!toolAccess || toolAccess.length === 0) return tools
  return tools.filter((t) => toolAccess.includes(t.name))
}

// ── Rate Limiting ────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_IP = 20

const ipCounts = new Map<string, { count: number; resetAt: number }>()

/** Debounce map for per-session memory extraction (prevents 3 LLM calls per chat) */
const memoryDebounce = new Map<string, number>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipCounts.get(ip)
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= MAX_REQUESTS_PER_IP) return false
  entry.count++
  return true
}

let _db: Database | undefined
function getDb(): Database {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _db = createDb(url)
  }
  return _db
}

let _gateway: GatewayRouter | undefined
function getGateway(): GatewayRouter {
  return (_gateway ??= new GatewayRouter(getDb()))
}

const CONTEXT_WINDOW = 50

// Hermes-inspired frozen memory snapshot cache — preserves LLM prefix cache within a session.
// Memory writes during the session update DB but don't change the injected context until TTL expires.
const MEMORY_SNAPSHOT_TTL = 5 * 60 * 1000 // 5 minutes
const memorySnapshotCache = new Map<string, { context: string; timestamp: number }>()

/** Load agent config from DB, including mini-brain database URL if available */
async function loadAgentConfig(db: Database, gateway: GatewayRouter, agentId: string) {
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) return null

  let model = agent.model ?? undefined
  if (!model && agent.requiredModelType) {
    const resolved = await gateway.resolveModelForCapability(agent.requiredModelType)
    if (resolved) model = resolved.model
  }

  // Check if this agent belongs to a mini-brain with a dedicated database
  let entityDatabaseUrl: string | undefined
  try {
    const entityLink = await db.query.brainEntityAgents.findFirst({
      where: eq(brainEntityAgents.agentId, agentId),
    })
    if (entityLink) {
      const entity = await db.query.brainEntities.findFirst({
        where: eq(brainEntities.id, entityLink.entityId),
      })
      if (entity?.databaseUrl) {
        entityDatabaseUrl = entity.databaseUrl
      }
    }
  } catch {
    // brainEntityAgents table may not exist yet — skip
  }

  return {
    id: agent.id,
    name: agent.name,
    soul: agent.soul ?? 'You are a helpful AI assistant.',
    model,
    temperature: agent.temperature ?? undefined,
    maxTokens: agent.maxTokens ?? undefined,
    workspaceId: agent.workspaceId ?? undefined,
    agentType: agent.type ?? undefined,
    capability: agent.requiredModelType ?? undefined,
    skills: agent.skills ?? undefined,
    toolAccess: agent.toolAccess ?? undefined,
    entityDatabaseUrl,
  }
}

/** Load promoted instincts and build injection text for agent prompts */
async function getInstinctInjection(
  db: Database,
  domain: string,
  userText: string,
): Promise<string> {
  const promoted = await db.query.instincts.findMany({
    where: eq(instincts.status, 'promoted'),
    limit: 50,
  })
  if (promoted.length === 0) return ''

  const injector = new InstinctInjector()
  const instinctList: Instinct[] = promoted.map((i) => ({
    ...i,
    domain: i.domain ?? 'universal',
    entityId: i.entityId ?? '',
    evidenceCount: i.evidenceCount ?? 1,
    lastObservedAt: i.lastObservedAt ?? new Date(),
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  }))

  return injector.inject(instinctList, {
    domain,
    trigger: userText.slice(0, 200),
    minConfidence: 0.5,
  })
}

export async function POST(req: Request) {
  // Auth check
  const session = await auth()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Rate limit
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    return new Response('Too many requests', { status: 429, headers: { 'Retry-After': '60' } })
  }

  const body = (await req.json()) as {
    sessionId: string
    text: string
    agentIds?: string[]
    retryOfRunId?: string
    retryType?: 'manual' | 'auto' | 'suggested'
    retryScope?: 'run' | 'group' | 'step'
    retryTargetId?: string
    retryReason?: string
    workflowId?: string
    workflowName?: string
    autonomyLevel?: 'manual' | 'assist' | 'auto'
  }
  if (!body.sessionId || !body.text) {
    return new Response('Missing sessionId or text', { status: 400 })
  }

  await waitForSchema()
  const db = getDb()
  const gateway = getGateway()

  // 1. Store user message
  const [userMessage] = await db
    .insert(chatMessages)
    .values({
      sessionId: body.sessionId,
      role: 'user',
      text: body.text,
    })
    .returning()
  await db
    .update(chatSessions)
    .set({ updatedAt: new Date() })
    .where(eq(chatSessions.id, body.sessionId))

  // @mention agent delegation — parse @agentname from message
  let mentionedAgentId: string | null = null
  const userText = body.text
  const mentionMatch = userText.match(/@(\w[\w-]*\w)/)
  if (mentionMatch) {
    const mentionName = mentionMatch[1]
    const mentionedAgent = await db.query.agents.findFirst({
      where: sql`lower(name) = lower(${mentionName})`,
    })
    if (mentionedAgent) {
      mentionedAgentId = mentionedAgent.id
    }
  }

  // 2. Determine which agents to use
  const agentConfigs: Array<{
    id: string
    name: string
    soul: string
    model?: string
    temperature?: number
    maxTokens?: number
    workspaceId?: string
    agentType?: string
    capability?: string
    skills?: string[]
    toolAccess?: string[]
    entityDatabaseUrl?: string
  }> = []

  if (body.agentIds && body.agentIds.length > 0) {
    // Multi-agent mode: load each specified agent
    for (const aid of body.agentIds) {
      const config = await loadAgentConfig(db, gateway, aid)
      if (config) agentConfigs.push(config)
    }
  } else {
    // Single-agent mode: load from session (with @mention override)
    const chatSession = await db.query.chatSessions.findFirst({
      where: eq(chatSessions.id, body.sessionId),
    })
    const effectiveAgentId = mentionedAgentId ?? chatSession?.agentId
    if (effectiveAgentId) {
      const config = await loadAgentConfig(db, gateway, effectiveAgentId)
      if (config) agentConfigs.push(config)
    }
  }

  // Fallback: default assistant if no agents configured
  if (agentConfigs.length === 0) {
    agentConfigs.push({
      id: '',
      name: 'Assistant',
      soul: 'You are a helpful AI assistant. Be concise and direct.',
      model: 'qwen3.5:cloud',
    })
  }

  // 2b. Token budget check — block if entity budget exceeded
  try {
    const ledger = new TokenLedgerService(db)
    for (const agentConfig of agentConfigs) {
      if (!agentConfig.id) continue
      // Check entity-level budget via brainEntityAgents linkage
      const entityLink = await db.query.brainEntityAgents
        ?.findFirst({
          where: eq(brainEntityAgents.agentId, agentConfig.id),
        })
        .catch(() => null)
      if (entityLink) {
        const budgetStatus = await ledger.checkBudget(entityLink.entityId)
        if (budgetStatus.overBudget) {
          return new Response(JSON.stringify({ error: 'Token budget exceeded for this agent' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' },
          })
        }
      }
    }
  } catch {
    // Budget table may not exist yet — proceed without enforcement
  }

  // 3. Recall relevant context via ContextPipeline (vector search + relevance scoring)
  // Hermes-inspired frozen snapshot: cache memory per session to preserve LLM prefix cache.
  const primaryWorkspaceId = agentConfigs[0]?.workspaceId
  const entityDbUrl = agentConfigs[0]?.entityDatabaseUrl
  const memoryDb = entityDbUrl ? createMiniBrainDb(entityDbUrl) : db
  let memoryContext = ''

  const snapshotKey = `${body.sessionId}:${primaryWorkspaceId ?? 'default'}`
  const cachedSnapshot = memorySnapshotCache.get(snapshotKey)
  if (cachedSnapshot && Date.now() - cachedSnapshot.timestamp < MEMORY_SNAPSHOT_TTL) {
    memoryContext = cachedSnapshot.context
  } else {
    try {
      const embedFn = createEmbedFn(db)
      const pipeline = new ContextPipeline({ db: memoryDb, embedFn })
      const pipelineResult = await pipeline.run(body.text, {
        evaluate: false,
        maxSources: 5,
        ...(primaryWorkspaceId ? { workspaceId: primaryWorkspaceId } : {}),
      })
      if (pipelineResult.synthesizedContext) {
        memoryContext = '\n\n' + pipelineResult.synthesizedContext
      }
    } catch {
      try {
        const memoryService = new MemoryService(memoryDb)
        const recalled = await memoryService.search(body.text, {
          limit: 5,
          ...(primaryWorkspaceId ? { workspaceId: primaryWorkspaceId } : {}),
        })
        if (recalled.length > 0) {
          memoryContext =
            '\n\nRelevant memories from past interactions:\n' +
            recalled.map((m) => `- [${m.tier}] ${m.content}`).join('\n')
        }
      } catch {
        // Best-effort
      }
    }
    memorySnapshotCache.set(snapshotKey, { context: memoryContext, timestamp: Date.now() })
  }

  // 3b. Scan injected context for prompt injection (Hermes-inspired input defense)
  if (memoryContext) {
    const { sanitized, threatsRemoved } = sanitizeContext(memoryContext, 'memory')
    if (threatsRemoved > 0) memoryContext = sanitized
  }

  // 3c. Goal ancestry context (Paperclip-inspired — tasks carry WHY they exist)
  let goalContext = ''
  if (agentConfigs[0]?.workspaceId) {
    try {
      const { resolveAgentGoalContext } =
        await import('../../../../server/services/orchestration/goal-ancestry')
      goalContext = await resolveAgentGoalContext(
        db,
        agentConfigs[0].id,
        agentConfigs[0].workspaceId,
      )
    } catch {
      // Goal ancestry is best-effort
    }
  }

  // 3d. Session rotation check (Paperclip-inspired — auto-rotate bloated sessions)
  try {
    const { checkSessionHealth } = await import('../../../../server/services/chat/session-rotation')
    const health = await checkSessionHealth(db, body.sessionId)
    if (health.needsRotation) {
      // Don't auto-rotate — just inject a hint for the agent
      goalContext += `\n\n[Session Health Warning] This session is approaching limits (${health.reason}). Consider wrapping up or summarizing progress.`
    }
  } catch {
    // Best-effort
  }

  // 3e. Track memory recall count for UI hint
  const memoryRecallCount = memoryContext
    ? memoryContext.split('\n').filter((l) => l.startsWith('- [')).length
    : 0
  const memoryRecallSources = memoryContext
    ? [
        ...new Set(
          memoryContext.match(/\[(core|recall|archival)\]/g)?.map((m) => m.replace(/[[\]]/g, '')) ??
            [],
        ),
      ]
    : []

  // 4. Load conversation history (with automatic compaction for long conversations)
  const msgs = await db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, body.sessionId),
    orderBy: desc(chatMessages.createdAt),
    limit: CONTEXT_WINDOW,
  })
  let history = msgs.reverse().map((m) => ({ role: m.role, content: m.text }))

  // Auto-compact if conversation exceeds token budget
  // Use Hermes-inspired structured compression (LLM summary) with fallback to simple truncation
  if (needsCompaction(history, { maxTokens: 80000, preserveRecent: 10, preserveSystem: true })) {
    const compactionConfig = { maxTokens: 80000, preserveRecent: 10, preserveSystem: true }
    try {
      const gw = new GatewayRouter(db)
      const compacted = await structuredCompact(history, compactionConfig, async (msgs) => {
        return gw.chat({ messages: msgs, maxTokens: 1024, temperature: 0.1 })
      })
      history = compacted.messages
    } catch {
      // Fallback to simple truncation if structured compression fails
      const compacted = compact(history, compactionConfig)
      history = compacted.messages
    }
  }

  // 5. Create execution run record
  const runStartTime = Date.now()
  let runRecord: { id: string } | null = null
  try {
    const [r] = await db
      .insert(chatRuns)
      .values({
        sessionId: body.sessionId,
        userMessageId: userMessage?.id,
        agentIds: agentConfigs.map((a) => a.id).filter(Boolean),
        memoryCount: memoryRecallCount,
        retryOfRunId: body.retryOfRunId ?? undefined,
        retryType: body.retryType ?? undefined,
        retryScope: body.retryScope ?? undefined,
        retryTargetId: body.retryTargetId ?? undefined,
        retryReason: body.retryReason ?? undefined,
        workflowId: body.workflowId ?? undefined,
        workflowName: body.workflowName ?? undefined,
        autonomyLevel: body.autonomyLevel ?? 'manual',
      })
      .returning()
    runRecord = r ?? null
  } catch {
    // Non-blocking — run tracking is optional
  }
  let stepSeq = 0

  // 5b. Step-retry context extraction (when retryScope === 'step')
  let stepRetryContext: {
    targetStep: {
      id: string
      type: string
      agentId: string | null
      agentName: string | null
      toolName: string | null
      toolInput: unknown
      toolResult: string | null
      groupId: string | null
      status: string
      sequence: number
      completedAt: Date | null
      durationMs: number | null
    }
    priorSteps: Array<{
      type: string
      agentId: string | null
      agentName: string | null
      toolName: string | null
      toolInput: unknown
      toolResult: string | null
      groupId: string | null
      status: string
      completedAt: Date | null
      durationMs: number | null
    }>
    targetAgentConfig: (typeof agentConfigs)[0]
  } | null = null

  if (body.retryScope === 'step' && body.retryTargetId && body.retryOfRunId) {
    const origSteps = await db.query.chatRunSteps.findMany({
      where: eq(chatRunSteps.runId, body.retryOfRunId),
    })
    const sorted = origSteps.sort((a, b) => a.sequence - b.sequence)
    const targetIdx = sorted.findIndex((s) => s.id === body.retryTargetId)
    if (targetIdx !== -1) {
      const target = sorted[targetIdx]!
      if (target.type === 'tool' || target.type === 'agent') {
        const prior = sorted.slice(0, targetIdx)
        const matchedAgent = agentConfigs.find((a) => a.id === target.agentId) ?? agentConfigs[0]!
        stepRetryContext = {
          targetStep: target,
          priorSteps: prior,
          targetAgentConfig: matchedAgent,
        }
      }
    }
  }

  // 6. Stream responses — iterate agents sequentially
  const encoder = new TextEncoder()
  const isMultiAgent = agentConfigs.length > 1

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Emit run_started event
        if (runRecord) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'run_started', runId: runRecord.id, retryScope: body.retryScope })}\n\n`,
            ),
          )
        }

        // Emit memory context hint if memories were recalled
        if (memoryRecallCount > 0) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'memory_context', count: memoryRecallCount, sources: memoryRecallSources })}\n\n`,
            ),
          )
        }

        if (stepRetryContext && runRecord) {
          // ═══ STEP RETRY MODE ═══════════════════════════════════════════
          const { targetStep, priorSteps, targetAgentConfig } = stepRetryContext
          const currentGroupId = `group-${targetAgentConfig.id || 'default'}-${stepSeq}`

          // 1. Persist replayed prior steps (context, not re-executed)
          for (const ps of priorSteps) {
            try {
              await db.insert(chatRunSteps).values({
                runId: runRecord.id,
                sequence: stepSeq++,
                type: ps.type as 'agent' | 'tool' | 'synthesis',
                agentId: ps.agentId,
                agentName: ps.agentName,
                toolName: ps.toolName,
                toolInput: ps.toolInput as Record<string, unknown> | null,
                toolResult: ps.toolResult,
                groupId: ps.groupId,
                status: ps.status as 'running' | 'completed' | 'failed',
                completedAt: ps.completedAt,
                durationMs: ps.durationMs,
              })
            } catch {
              // Non-blocking
            }
          }

          // 2. Build message context from prior tool results
          const priorToolMessages: Array<{ role: string; content: string }> = []
          for (const ps of priorSteps) {
            if (ps.type === 'tool' && ps.toolName && ps.toolResult) {
              priorToolMessages.push(
                { role: 'assistant', content: `[Tool call: ${ps.toolName}]` },
                { role: 'user', content: `Tool result for ${ps.toolName}: ${ps.toolResult}` },
              )
            }
          }

          // 3. Signal agent start
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ agentStart: targetAgentConfig.name, agentId: targetAgentConfig.id, groupId: currentGroupId })}\n\n`,
            ),
          )

          // 4. Create agent step record
          try {
            await db.insert(chatRunSteps).values({
              runId: runRecord.id,
              sequence: stepSeq++,
              type: 'agent',
              agentId: targetAgentConfig.id || null,
              agentName: targetAgentConfig.name,
              groupId: currentGroupId,
            })
          } catch {
            // Non-blocking
          }

          // 5. Build messages with prior context injected
          const atlasCtx = buildAtlasContext({
            agentType: targetAgentConfig.agentType,
            capability: targetAgentConfig.capability,
            skills: targetAgentConfig.skills,
          })
          const stepInstinctCtx = await getInstinctInjection(
            db,
            targetAgentConfig.workspaceId ?? 'universal',
            body.text,
          ).catch(() => '')
          const stepBaseMessages = [
            {
              role: 'system',
              content:
                targetAgentConfig.soul + atlasCtx + memoryContext + goalContext + stepInstinctCtx,
            },
            ...history,
            ...priorToolMessages,
          ]

          // 6. Re-execute the target step (tool or agent) + downstream recomputation
          let toolMessages = [...stepBaseMessages]

          if (targetStep.type === 'tool' && targetStep.toolName) {
            // Re-execute the target tool
            const toolExecStart = Date.now()
            const toolOutput = await executeTool(
              targetStep.toolName,
              targetStep.toolInput as Record<string, unknown>,
              db,
              targetAgentConfig.workspaceId,
            )
            const toolDurationMs = Date.now() - toolExecStart

            let retryStepId: string | undefined
            try {
              const [rec] = await db
                .insert(chatRunSteps)
                .values({
                  runId: runRecord.id,
                  sequence: stepSeq++,
                  type: 'tool',
                  toolName: targetStep.toolName,
                  toolInput: targetStep.toolInput as Record<string, unknown> | null,
                  toolResult: toolOutput,
                  groupId: currentGroupId,
                  status: 'completed',
                  completedAt: new Date(),
                  durationMs: toolDurationMs,
                })
                .returning({ id: chatRunSteps.id })
              retryStepId = rec?.id
            } catch {
              // Non-blocking
            }

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'tool_use', name: targetStep.toolName, input: targetStep.toolInput, stepId: retryStepId })}\n\n`,
              ),
            )
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'tool_result', name: targetStep.toolName, result: toolOutput.slice(0, 500), stepId: retryStepId })}\n\n`,
              ),
            )

            toolMessages = [
              ...toolMessages,
              { role: 'assistant', content: `[Tool call: ${targetStep.toolName}]` },
              { role: 'user', content: `Tool result for ${targetStep.toolName}: ${toolOutput}` },
            ]
          }

          // 7. Downstream recomputation — agent continues with tool loop
          let fullContent = ''
          let usedTools = false
          for (let toolIter = 0; toolIter < 5; toolIter++) {
            const toolResult = await gateway.chat({
              model: targetAgentConfig.model,
              messages: toolMessages,
              tools: filterToolsForAgent(AGENT_TOOLS, targetAgentConfig.toolAccess),
              temperature: targetAgentConfig.temperature,
              maxTokens: targetAgentConfig.maxTokens,
            })

            if (!toolResult.toolUse) {
              fullContent = toolResult.content
              usedTools = true
              break
            }

            const toolExecStart = Date.now()
            const toolOutput = await executeTool(
              toolResult.toolUse.name,
              toolResult.toolUse.input,
              db,
              targetAgentConfig.workspaceId,
            )
            const toolDurationMs = Date.now() - toolExecStart

            let downstreamStepId: string | undefined
            try {
              const [rec] = await db
                .insert(chatRunSteps)
                .values({
                  runId: runRecord.id,
                  sequence: stepSeq++,
                  type: 'tool',
                  toolName: toolResult.toolUse.name,
                  toolInput: toolResult.toolUse.input as Record<string, unknown>,
                  toolResult: toolOutput,
                  groupId: currentGroupId,
                  status: 'completed',
                  completedAt: new Date(),
                  durationMs: toolDurationMs,
                })
                .returning({ id: chatRunSteps.id })
              downstreamStepId = rec?.id
            } catch {
              // Non-blocking
            }

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'tool_use', name: toolResult.toolUse.name, input: toolResult.toolUse.input, stepId: downstreamStepId })}\n\n`,
              ),
            )
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'tool_result', name: toolResult.toolUse.name, result: toolOutput.slice(0, 500), stepId: downstreamStepId })}\n\n`,
              ),
            )

            toolMessages = [
              ...toolMessages,
              {
                role: 'assistant',
                content: toolResult.content || `[Tool call: ${toolResult.toolUse.name}]`,
              },
              {
                role: 'user',
                content: `Tool result for ${toolResult.toolUse.name}: ${toolOutput}`,
              },
            ]
          }

          // 8. Stream final text
          if (usedTools && fullContent) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ text: fullContent, agentName: targetAgentConfig.name, agentId: targetAgentConfig.id })}\n\n`,
              ),
            )
          } else if (!usedTools) {
            const gen = gateway.chatStream({
              model: targetAgentConfig.model,
              messages: toolMessages,
              temperature: targetAgentConfig.temperature,
              maxTokens: targetAgentConfig.maxTokens,
            })
            for await (const chunk of gen) {
              fullContent += chunk
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ text: chunk, agentName: targetAgentConfig.name, agentId: targetAgentConfig.id })}\n\n`,
                ),
              )
            }
          }

          // Store response
          await db.insert(chatMessages).values({
            sessionId: body.sessionId,
            role: 'assistant',
            text: fullContent,
            sourceAgentId: targetAgentConfig.id || null,
          })
        } else {
          // ═══ NORMAL EXECUTION ══════════════════════════════════════════

          for (const agentConfig of agentConfigs) {
            // Signal which agent is responding (for multi-agent UI)
            if (isMultiAgent) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ agentStart: agentConfig.name, agentId: agentConfig.id, groupId: `group-${agentConfig.id || 'default'}-${stepSeq}` })}\n\n`,
                ),
              )
            }

            let fullContent = ''
            const currentGroupId = runRecord
              ? `group-${agentConfig.id || 'default'}-${stepSeq}`
              : undefined

            // Create agent step record
            if (runRecord) {
              try {
                await db.insert(chatRunSteps).values({
                  runId: runRecord.id,
                  sequence: stepSeq++,
                  type: 'agent',
                  agentId: agentConfig.id || null,
                  agentName: agentConfig.name,
                  groupId: currentGroupId,
                })
              } catch {
                // Non-blocking
              }
            }

            // Build the base messages for this agent
            const atlasContext = buildAtlasContext({
              agentType: agentConfig.agentType,
              capability: agentConfig.capability,
              skills: agentConfig.skills,
            })
            // Inject promoted instincts as behavioral guidance (fire-and-forget safe)
            const instinctContext = await getInstinctInjection(
              db,
              agentConfig.workspaceId ?? 'universal',
              body.text,
            ).catch(() => '')
            const baseMessages = [
              {
                role: 'system',
                content:
                  agentConfig.soul + atlasContext + memoryContext + goalContext + instinctContext,
              },
              ...history,
            ]

            // Tool use loop (non-streaming, max 5 iterations)
            // Loop detection is now handled inside executeTool() via loop-detection.ts
            let toolMessages = [...baseMessages]
            let usedTools = false
            for (let toolIter = 0; toolIter < 5; toolIter++) {
              const toolResult = await gateway.chat({
                model: agentConfig.model,
                messages: toolMessages,
                tools: filterToolsForAgent(AGENT_TOOLS, agentConfig.toolAccess),
                temperature: agentConfig.temperature,
                maxTokens: agentConfig.maxTokens,
              })

              if (!toolResult.toolUse) {
                // No tool call — use this as the final content
                fullContent = toolResult.content
                usedTools = true
                break
              }

              // Execute the tool
              const toolExecStart = Date.now()
              const toolOutput = await executeTool(
                toolResult.toolUse.name,
                toolResult.toolUse.input,
                db,
                agentConfig.workspaceId,
              )
              const toolDurationMs = Date.now() - toolExecStart

              // Persist tool step with FULL result (not truncated)
              let toolStepId: string | undefined
              if (runRecord) {
                try {
                  const [rec] = await db
                    .insert(chatRunSteps)
                    .values({
                      runId: runRecord.id,
                      sequence: stepSeq++,
                      type: 'tool',
                      toolName: toolResult.toolUse.name,
                      toolInput: toolResult.toolUse.input as Record<string, unknown>,
                      toolResult: toolOutput,
                      groupId: currentGroupId,
                      status: 'completed',
                      completedAt: new Date(),
                      durationMs: toolDurationMs,
                    })
                    .returning({ id: chatRunSteps.id })
                  toolStepId = rec?.id
                } catch {
                  // Non-blocking
                }
              }

              // Send SSE events to client showing tool use (preview only — 500 char max)
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'tool_use', name: toolResult.toolUse.name, input: toolResult.toolUse.input, stepId: toolStepId })}\n\n`,
                ),
              )
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'tool_result', name: toolResult.toolUse.name, result: toolOutput.slice(0, 500), stepId: toolStepId })}\n\n`,
                ),
              )

              // Add tool call and result to messages for next iteration
              toolMessages = [
                ...toolMessages,
                {
                  role: 'assistant',
                  content: toolResult.content || `[Tool call: ${toolResult.toolUse.name}]`,
                },
                {
                  role: 'user',
                  content: `Tool result for ${toolResult.toolUse.name}: ${toolOutput}`,
                },
              ]
            }

            // If tool loop produced final content, stream it as a single chunk
            if (usedTools && fullContent) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    text: fullContent,
                    ...(isMultiAgent
                      ? { agentName: agentConfig.name, agentId: agentConfig.id }
                      : {}),
                  })}\n\n`,
                ),
              )
            } else if (!usedTools) {
              // No tools were invoked — fall back to streaming
              const gen = gateway.chatStream({
                model: agentConfig.model,
                messages: baseMessages,
                temperature: agentConfig.temperature,
                maxTokens: agentConfig.maxTokens,
              })

              for await (const chunk of gen) {
                fullContent += chunk
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      text: chunk,
                      ...(isMultiAgent
                        ? { agentName: agentConfig.name, agentId: agentConfig.id }
                        : {}),
                    })}\n\n`,
                  ),
                )
              }
            }

            // Output guardrail check — flag PII, rationalization, safety issues
            try {
              const guardrailEngine = new GuardrailEngine(db)
              const guardrailResult = await guardrailEngine.check(fullContent, 'output' as const, {
                agentId: agentConfig.id || undefined,
              })
              if (guardrailResult.violations.length > 0) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'guardrail_warning',
                      violations: guardrailResult.violations.map((v) => ({
                        rule: v.rule,
                        detail: v.detail,
                        severity: v.severity,
                      })),
                    })}\n\n`,
                  ),
                )
              }
            } catch {
              // Guardrails are best-effort — never block responses
            }

            // Store this agent's response
            await db.insert(chatMessages).values({
              sessionId: body.sessionId,
              role: 'assistant',
              text: fullContent,
              sourceAgentId: agentConfig.id || null,
            })

            // Add this agent's response to history for the next agent
            history.push({ role: 'assistant', content: fullContent })
          }
        } // end normal execution

        await db
          .update(chatSessions)
          .set({ updatedAt: new Date() })
          .where(eq(chatSessions.id, body.sessionId))

        // Complete run record
        if (runRecord) {
          const runDurationMs = Date.now() - runStartTime
          try {
            await db
              .update(chatRuns)
              .set({
                status: 'completed',
                completedAt: new Date(),
                stepCount: stepSeq,
                durationMs: runDurationMs,
              })
              .where(eq(chatRuns.id, runRecord.id))
          } catch {
            // Non-blocking
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'run_completed', runId: runRecord.id, durationMs: Date.now() - runStartTime })}\n\n`,
            ),
          )

          // Fire-and-forget: compute quality + refresh insights + observe for instincts
          computeRunQualityScore(db, runRecord.id).catch(() => {})
          refreshInsights(db, runRecord.id ? undefined : undefined).catch(() => {})
          observeRunCompletion(db, runRecord.id).catch(() => {})

          // Fire-and-forget: smart memory extraction with cost throttling
          // Skip trivial conversations, debounce per-session, batch consolidation separately
          const userMsgs = history.filter((m) => m.role === 'user')
          const lastUserMsg = userMsgs[userMsgs.length - 1]?.content ?? ''
          const isTrivial =
            lastUserMsg.length < 20 ||
            /^(hi|hello|hey|thanks|thank you|ok|bye|yes|no|sure)\b/i.test(lastUserMsg.trim())

          if (!isTrivial && userMsgs.length >= 2) {
            // Debounce: skip if this session had memory extracted recently
            const sessionKey = `mem:${body.sessionId}`
            const lastExtract = memoryDebounce.get(sessionKey)
            const now = Date.now()
            if (!lastExtract || now - lastExtract > 300_000) {
              // 5 min debounce
              memoryDebounce.set(sessionKey, now)
              const autoMemoryMessages = history
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .slice(-10)
              smartMemoryAdd(db, gateway, autoMemoryMessages, {
                workspaceId: primaryWorkspaceId ?? undefined,
                sourceAgentId: agentConfigs[0]?.id || undefined,
              }).catch(() => {})
              // Consolidation runs separately via cron (not inline) to save cost
            }
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
        controller.close()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        // Mark run as failed
        if (runRecord) {
          try {
            await db
              .update(chatRuns)
              .set({
                status: 'failed',
                completedAt: new Date(),
                durationMs: Date.now() - runStartTime,
              })
              .where(eq(chatRuns.id, runRecord.id))
          } catch {
            // Non-blocking
          }
          // Fire-and-forget: compute quality for failed run + observe for instincts
          computeRunQualityScore(db, runRecord.id).catch(() => {})
          observeRunCompletion(db, runRecord.id).catch(() => {})
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`))
        controller.close()
        // Emit agent error event (non-blocking)
        eventBus
          .emit('agent.error', { agentId: agentConfigs[0]?.id, error: message })
          .catch(() => {})
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
