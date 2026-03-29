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
} from '@solarc/db'
import { desc, eq } from 'drizzle-orm'

import { auth } from '../../../../server/auth'
import { buildAtlasContext } from '../../../../server/services/atlas'
import { AGENT_TOOLS, executeTool } from '../../../../server/services/chat/tool-executor'
import { GatewayRouter } from '../../../../server/services/gateway'
import { ContextPipeline } from '../../../../server/services/memory/context-pipeline'
import { createEmbedFn } from '../../../../server/services/memory/embed-helper'
import { MemoryService } from '../../../../server/services/memory/memory-service'
import { eventBus } from '../../../../server/services/orchestration/event-bus'
import { TokenLedgerService } from '../../../../server/services/platform/token-ledger'

// ── Rate Limiting ────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_IP = 20

const ipCounts = new Map<string, { count: number; resetAt: number }>()

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
    entityDatabaseUrl,
  }
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
    entityDatabaseUrl?: string
  }> = []

  if (body.agentIds && body.agentIds.length > 0) {
    // Multi-agent mode: load each specified agent
    for (const aid of body.agentIds) {
      const config = await loadAgentConfig(db, gateway, aid)
      if (config) agentConfigs.push(config)
    }
  } else {
    // Single-agent mode: load from session
    const session = await db.query.chatSessions.findFirst({
      where: eq(chatSessions.id, body.sessionId),
    })
    if (session?.agentId) {
      const config = await loadAgentConfig(db, gateway, session.agentId)
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
  // Use mini-brain's dedicated DB for memory ops when available
  const primaryWorkspaceId = agentConfigs[0]?.workspaceId
  const entityDbUrl = agentConfigs[0]?.entityDatabaseUrl
  const memoryDb = entityDbUrl ? createMiniBrainDb(entityDbUrl) : db
  let memoryContext = ''
  try {
    const embedFn = createEmbedFn(db)
    const pipeline = new ContextPipeline({ db: memoryDb, embedFn })
    const pipelineResult = await pipeline.run(body.text, {
      evaluate: false, // Quick mode — skip LLM reranking for chat latency
      maxSources: 5,
      ...(primaryWorkspaceId ? { workspaceId: primaryWorkspaceId } : {}),
    })
    if (pipelineResult.synthesizedContext) {
      memoryContext = '\n\n' + pipelineResult.synthesizedContext
    }
  } catch {
    // Fallback: simple keyword search if pipeline fails
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

  // 3b. Track memory recall count for UI hint
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

  // 4. Load conversation history
  const msgs = await db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, body.sessionId),
    orderBy: desc(chatMessages.createdAt),
    limit: CONTEXT_WINDOW,
  })
  const history = msgs.reverse().map((m) => ({ role: m.role, content: m.text }))

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
              `data: ${JSON.stringify({ type: 'run_started', runId: runRecord.id })}\n\n`,
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
          const baseMessages = [
            { role: 'system', content: agentConfig.soul + atlasContext + memoryContext },
            ...history,
          ]

          // Tool use loop (non-streaming, max 5 iterations)
          let toolMessages = [...baseMessages]
          let usedTools = false
          for (let toolIter = 0; toolIter < 5; toolIter++) {
            const toolResult = await gateway.chat({
              model: agentConfig.model,
              messages: toolMessages,
              tools: AGENT_TOOLS,
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
            if (runRecord) {
              try {
                await db.insert(chatRunSteps).values({
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
              } catch {
                // Non-blocking
              }
            }

            // Send SSE events to client showing tool use (preview only — 500 char max)
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'tool_use', name: toolResult.toolUse.name, input: toolResult.toolUse.input })}\n\n`,
              ),
            )
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'tool_result', name: toolResult.toolUse.name, result: toolOutput.slice(0, 500) })}\n\n`,
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
                  ...(isMultiAgent ? { agentName: agentConfig.name, agentId: agentConfig.id } : {}),
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
