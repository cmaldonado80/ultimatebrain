/**
 * Brain REST API — Eval
 *
 * POST /api/brain/eval
 *
 * Called by Mini Brains via Brain SDK.
 * Two operations:
 *   - 'run': Create a new eval run
 *   - 'results': Get eval run results
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createDb, type Database, evalRuns, waitForSchema } from '@solarc/db'
import { eq } from 'drizzle-orm'

import { logger } from '../../../../lib/logger'
import { authenticateEntity } from '../../../../server/services/platform/entity-auth'

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
    const { operation } = body as { operation: string }

    if (!operation || (operation !== 'run' && operation !== 'results')) {
      return Response.json(
        { error: 'Invalid operation. Must be "run" or "results"' },
        { status: 400 },
      )
    }

    const db = getDb()

    if (operation === 'run') {
      const { agentId, suiteId } = body as {
        agentId: string
        suiteId?: string
      }

      if (!agentId) {
        return Response.json({ error: 'Missing required field: agentId' }, { status: 400 })
      }

      const [run] = await db
        .insert(evalRuns)
        .values({
          datasetId: suiteId ?? agentId,
          version: 'pending',
          scores: { agentId, status: 'pending', startedAt: new Date().toISOString() },
        })
        .returning({ id: evalRuns.id })

      return Response.json({
        runId: run.id,
        status: 'pending',
      })
    }

    // operation === 'results'
    const { runId } = body as { runId: string }

    if (!runId) {
      return Response.json({ error: 'Missing required field: runId' }, { status: 400 })
    }

    const [run] = await db.select().from(evalRuns).where(eq(evalRuns.id, runId)).limit(1)

    if (!run) {
      return Response.json({ error: 'Eval run not found' }, { status: 404 })
    }

    return Response.json({
      runId: run.id,
      datasetId: run.datasetId,
      version: run.version,
      scores: run.scores,
      createdAt: run.createdAt,
    })
  } catch (err) {
    const internal = err instanceof Error ? err.message : 'Unknown error'
    logger.warn({ err: err instanceof Error ? err : undefined }, 'Eval operation failed')
    const status =
      internal.includes('Invalid API key') || internal.includes('Unauthorized') ? 401 : 500
    return Response.json(
      { error: status === 401 ? 'Unauthorized' : 'Eval operation failed' },
      { status },
    )
  }
}
