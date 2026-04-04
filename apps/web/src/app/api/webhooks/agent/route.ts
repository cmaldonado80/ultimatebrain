/**
 * POST /api/webhooks/agent — Webhook-triggered agent execution.
 *
 * Accepts external webhook POST, creates a chat session, runs one agent turn,
 * and returns the response. Optionally validates a shared secret.
 */
import {
  agents,
  chatMessages,
  chatSessions,
  createDb,
  type Database,
  waitForSchema,
} from '@solarc/db'
import { eq } from 'drizzle-orm'

import { logger } from '../../../../lib/logger'
import { GatewayRouter } from '../../../../server/services/gateway'

let _db: Database | undefined
function getDb(): Database {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL not set')
    _db = createDb(url)
  }
  return _db
}

export async function POST(req: Request) {
  try {
    // Validate webhook secret (optional)
    const secret = process.env.WEBHOOK_AGENT_SECRET
    if (secret) {
      const authHeader = req.headers.get('authorization')
      if (authHeader !== `Bearer ${secret}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    await waitForSchema()
    const db = getDb()
    const body = (await req.json()) as {
      agentId: string
      message: string
      workspaceId?: string
    }

    if (!body.agentId || !body.message) {
      return Response.json({ error: 'agentId and message are required' }, { status: 400 })
    }

    // Get agent
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, body.agentId),
    })
    if (!agent) {
      return Response.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Create session
    const [session] = await db
      .insert(chatSessions)
      .values({
        agentId: agent.id,
        workspaceId: body.workspaceId ?? agent.workspaceId,
      })
      .returning()

    // Run one chat turn
    const gateway = new GatewayRouter(db)
    const result = await gateway.chat({
      model: agent.model ?? undefined,
      messages: [
        ...(agent.soul ? [{ role: 'system' as const, content: agent.soul }] : []),
        { role: 'user', content: body.message },
      ],
      agentId: agent.id,
    })

    // Persist messages
    if (session) {
      await db.insert(chatMessages).values([
        { sessionId: session.id, role: 'user', text: body.message },
        { sessionId: session.id, role: 'assistant', text: result.content },
      ])
    }

    return Response.json({
      sessionId: session?.id,
      agentId: agent.id,
      agentName: agent.name,
      response: result.content,
      model: agent.model,
      tokensUsed: (result.tokensIn ?? 0) + (result.tokensOut ?? 0),
    })
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'webhook agent execution failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
