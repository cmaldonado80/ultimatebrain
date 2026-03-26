export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createDb, waitForSchema, type Database } from '@solarc/db'
import { chatSessions, chatMessages, agents } from '@solarc/db'
import { eq, desc } from 'drizzle-orm'
import { GatewayRouter } from '../../../../server/services/gateway'
import { MemoryService } from '../../../../server/services/memory/memory-service'
import { createEmbedFn } from '../../../../server/services/memory/embed-helper'
import { ContextPipeline } from '../../../../server/services/memory/context-pipeline'
import { AGENT_TOOLS, executeTool } from '../../../../server/services/chat/tool-executor'
import { auth } from '../../../../server/auth'
import { eventBus } from '../../../../server/services/orchestration/event-bus'

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

/** Load agent config from DB */
async function loadAgentConfig(db: Database, gateway: GatewayRouter, agentId: string) {
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) return null

  let model = agent.model ?? undefined
  if (!model && agent.requiredModelType) {
    const resolved = await gateway.resolveModelForCapability(agent.requiredModelType)
    if (resolved) model = resolved.model
  }

  return {
    id: agent.id,
    name: agent.name,
    soul: agent.soul ?? 'You are a helpful AI assistant.',
    model,
    temperature: agent.temperature ?? undefined,
    maxTokens: agent.maxTokens ?? undefined,
    workspaceId: agent.workspaceId ?? undefined,
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

  const body = (await req.json()) as { sessionId: string; text: string; agentIds?: string[] }
  if (!body.sessionId || !body.text) {
    return new Response('Missing sessionId or text', { status: 400 })
  }

  await waitForSchema()
  const db = getDb()
  const gateway = getGateway()

  // 1. Store user message
  await db.insert(chatMessages).values({
    sessionId: body.sessionId,
    role: 'user',
    text: body.text,
  })
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
    })
  }

  // 3. Recall relevant context via ContextPipeline (vector search + relevance scoring)
  const primaryWorkspaceId = agentConfigs[0]?.workspaceId
  let memoryContext = ''
  try {
    const embedFn = createEmbedFn(db)
    const pipeline = new ContextPipeline({ db, embedFn })
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
      const memoryService = new MemoryService(db)
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

  // 4. Load conversation history
  const msgs = await db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, body.sessionId),
    orderBy: desc(chatMessages.createdAt),
    limit: CONTEXT_WINDOW,
  })
  const history = msgs.reverse().map((m) => ({ role: m.role, content: m.text }))

  // 5. Stream responses — iterate agents sequentially
  const encoder = new TextEncoder()
  const isMultiAgent = agentConfigs.length > 1

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (const agentConfig of agentConfigs) {
          // Signal which agent is responding (for multi-agent UI)
          if (isMultiAgent) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ agentStart: agentConfig.name, agentId: agentConfig.id })}\n\n`,
              ),
            )
          }

          let fullContent = ''

          // Build the base messages for this agent
          const baseMessages = [
            { role: 'system', content: agentConfig.soul + memoryContext },
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
            const toolOutput = await executeTool(
              toolResult.toolUse.name,
              toolResult.toolUse.input,
              db,
              agentConfig.workspaceId,
            )

            // Send SSE events to client showing tool use
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

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
        controller.close()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
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
