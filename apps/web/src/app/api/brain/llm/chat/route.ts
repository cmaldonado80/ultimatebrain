/**
 * Brain REST API — LLM Chat
 *
 * POST /api/brain/llm/chat
 *
 * Called by Mini Brains via Brain SDK.
 * Delegates to the gateway router (same as chat stream uses).
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createDb, type Database, waitForSchema } from '@solarc/db'
import { LlmChatInput } from '@solarc/engine-contracts'

import { GatewayRouter } from '../../../../../server/services/gateway'
import { authenticateEntity } from '../../../../../server/services/platform/entity-auth'
import { TokenLedgerService } from '../../../../../server/services/platform/token-ledger'

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

export async function POST(req: Request) {
  try {
    // 1. Authenticate entity
    const entity = await authenticateEntity(req)

    // 2. Parse + validate input
    await waitForSchema()
    const body = LlmChatInput.parse(await req.json())

    // 3. Budget check
    const db = getDb()
    const ledger = new TokenLedgerService(db)
    if (entity.id) {
      const allowed = await ledger.checkBudget(entity.id)
      if (!allowed) {
        return Response.json({ error: 'Token budget exceeded' }, { status: 429 })
      }
    }

    // 4. Route through gateway
    const gateway = getGateway()
    const result = await gateway.chat({
      model: body.model,
      messages: body.messages,
      tools: body.tools as Parameters<typeof gateway.chat>[0]['tools'],
      temperature: body.temperature,
      maxTokens: body.maxTokens,
    })

    return Response.json({
      content: result.content,
      model: body.model ?? 'default',
      toolUse: result.toolUse ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status =
      message.includes('Unauthorized') || message.includes('Invalid API key')
        ? 401
        : message.includes('suspended')
          ? 403
          : message.includes('budget')
            ? 429
            : 500
    return Response.json({ error: message }, { status })
  }
}
