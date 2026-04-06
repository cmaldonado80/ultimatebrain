/**
 * Brain REST API — A2A Task Status
 *
 * POST /api/brain/a2a/tasks/status
 *
 * Called by Mini Brains via Brain SDK.
 * Queries a2aDelegations by task ID.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { a2aDelegations, createDb, type Database, waitForSchema } from '@solarc/db'
import { eq } from 'drizzle-orm'

import { logger } from '../../../../../../lib/logger'
import { authenticateEntity } from '../../../../../../server/services/platform/entity-auth'

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
    await authenticateEntity(req)
    await waitForSchema()
    const body = await req.json()

    const { taskId } = body as { taskId: string }

    if (!taskId) {
      return Response.json({ error: 'Missing required field: taskId' }, { status: 400 })
    }

    const db = getDb()
    const [delegation] = await db
      .select()
      .from(a2aDelegations)
      .where(eq(a2aDelegations.id, taskId))
      .limit(1)

    if (!delegation) {
      return Response.json({ error: 'Task not found' }, { status: 404 })
    }

    return Response.json({
      taskId: delegation.id,
      status: delegation.status,
      result: delegation.result ?? null,
      error: delegation.error ?? null,
    })
  } catch (err) {
    const internal = err instanceof Error ? err.message : 'Unknown error'
    logger.warn({ err: err instanceof Error ? err : undefined }, '[Brain] A2A task status failed')
    const status =
      internal.includes('Invalid API key') || internal.includes('Unauthorized') ? 401 : 500
    return Response.json(
      { error: status === 401 ? 'Unauthorized' : 'Task status query failed' },
      { status },
    )
  }
}
