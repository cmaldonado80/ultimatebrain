/**
 * Brain REST API — A2A Delegate
 *
 * POST /api/brain/a2a/delegate
 *
 * Called by Mini Brains via Brain SDK.
 * Delegates a task to another agent via A2AEngine.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createDb, type Database, waitForSchema } from '@solarc/db'

import { logger } from '../../../../../lib/logger'
import { A2AEngine } from '../../../../../server/services/a2a/a2a-engine'
import { authenticateEntity } from '../../../../../server/services/platform/entity-auth'

let _db: Database | undefined
function getDb(): Database {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _db = createDb(url)
  }
  return _db
}

export async function POST(req: Request) {
  try {
    const entity = await authenticateEntity(req)
    await waitForSchema()
    const body = await req.json()

    const { agent_id, task, context } = body as {
      agent_id: string
      task: string
      context?: Record<string, unknown>
      timeout?: number
    }

    if (!agent_id || !task) {
      return Response.json({ error: 'Missing required fields: agent_id, task' }, { status: 400 })
    }

    const db = getDb()
    const engine = new A2AEngine(db)

    const delegationId = await engine.delegate({
      agentId: agent_id,
      task,
      context,
      fromAgentId: entity.id,
    })

    return Response.json({
      taskId: delegationId,
      status: 'pending',
    })
  } catch (err) {
    const internal = err instanceof Error ? err.message : 'Unknown error'
    logger.warn({ err: err instanceof Error ? err : undefined }, '[Brain] A2A delegate failed')
    const status =
      internal.includes('Invalid API key') || internal.includes('Unauthorized') ? 401 : 500
    return Response.json(
      { error: status === 401 ? 'Unauthorized' : 'Delegation failed' },
      { status },
    )
  }
}
