/**
 * Brain REST API — Get Ticket
 *
 * POST /api/brain/orch/tickets/get
 *
 * Called by Mini Brains via Brain SDK.
 * Queries a single ticket by ID.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createDb, type Database, tickets, waitForSchema } from '@solarc/db'
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
    const { id } = body as { id: string }

    if (!id) {
      return Response.json({ error: 'Missing required field: id' }, { status: 400 })
    }

    const db = getDb()
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)

    if (!ticket) {
      return Response.json({ error: 'Ticket not found' }, { status: 404 })
    }

    return Response.json(ticket)
  } catch (err) {
    const internal = err instanceof Error ? err.message : 'Unknown error'
    logger.warn({ err: err instanceof Error ? err : undefined }, 'Ticket lookup failed')
    const status =
      internal.includes('Invalid API key') || internal.includes('Unauthorized') ? 401 : 500
    return Response.json(
      { error: status === 401 ? 'Unauthorized' : 'Ticket lookup failed' },
      { status },
    )
  }
}
