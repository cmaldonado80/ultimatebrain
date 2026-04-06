/**
 * Brain REST API — List Tickets
 *
 * POST /api/brain/orch/tickets/list
 *
 * Called by Mini Brains via Brain SDK.
 * Queries tickets with optional agent/status filters.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createDb, type Database, tickets, waitForSchema } from '@solarc/db'
import { and, eq } from 'drizzle-orm'

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
    const { agent, status } = body as {
      agent?: string
      status?: string
    }

    const db = getDb()
    const conditions = []

    if (agent) {
      conditions.push(eq(tickets.assignedAgentId, agent))
    }
    if (status) {
      conditions.push(eq(tickets.status, status as (typeof tickets.status.enumValues)[number]))
    }

    const results = await db
      .select()
      .from(tickets)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(100)

    return Response.json(results)
  } catch (err) {
    const internal = err instanceof Error ? err.message : 'Unknown error'
    logger.warn({ err: err instanceof Error ? err : undefined }, 'Ticket list failed')
    const status =
      internal.includes('Invalid API key') || internal.includes('Unauthorized') ? 401 : 500
    return Response.json(
      { error: status === 401 ? 'Unauthorized' : 'Ticket list failed' },
      { status },
    )
  }
}
