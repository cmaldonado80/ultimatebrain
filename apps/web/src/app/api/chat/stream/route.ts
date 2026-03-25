export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createDb, waitForSchema, type Database } from '@solarc/db'
import { chatSessions, chatMessages, agents } from '@solarc/db'
import { eq, desc } from 'drizzle-orm'
import { GatewayRouter } from '../../../../server/services/gateway'

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

export async function POST(req: Request) {
  const body = (await req.json()) as { sessionId: string; text: string }
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

  // 2. Load session's agent (if assigned)
  const session = await db.query.chatSessions.findFirst({
    where: eq(chatSessions.id, body.sessionId),
  })
  let agentSoul = 'You are a helpful AI assistant. Be concise and direct.'
  let agentModel: string | undefined
  if (session?.agentId) {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, session.agentId),
    })
    if (agent?.soul) agentSoul = agent.soul
    if (agent?.model) agentModel = agent.model
  }

  // 3. Load conversation history
  const msgs = await db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, body.sessionId),
    orderBy: desc(chatMessages.createdAt),
    limit: CONTEXT_WINDOW,
  })
  const history = msgs.reverse().map((m) => ({ role: m.role, content: m.text }))

  // 4. Stream response via SSE
  const encoder = new TextEncoder()
  let fullContent = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Pre-check: ensure an API key is available for the target provider
        const targetModel = agentModel ?? 'claude-sonnet-4-6'
        const providerName = targetModel.startsWith('claude')
          ? 'anthropic'
          : targetModel.startsWith('gpt') || targetModel.startsWith('o')
            ? 'openai'
            : targetModel.startsWith('ollama/') || targetModel.includes(':')
              ? 'ollama'
              : 'anthropic'
        const hasKey = await gateway.keyVault.getKey(providerName)
        const hasEnvKey =
          providerName === 'anthropic'
            ? !!process.env.ANTHROPIC_API_KEY
            : providerName === 'openai'
              ? !!process.env.OPENAI_API_KEY
              : providerName === 'ollama'
                ? !!process.env.OLLAMA_API_KEY
                : false
        if (!hasKey && !hasEnvKey) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: `No API key configured for ${providerName}. Add one in Settings → LLM Providers.`,
              })}\n\n`,
            ),
          )
          controller.close()
          return
        }

        const gen = gateway.chatStream({
          model: agentModel,
          messages: [{ role: 'system', content: agentSoul }, ...history],
        })

        for await (const chunk of gen) {
          fullContent += chunk
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`))
        }

        // 4. Store complete assistant message
        await db.insert(chatMessages).values({
          sessionId: body.sessionId,
          role: 'assistant',
          text: fullContent,
        })
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
