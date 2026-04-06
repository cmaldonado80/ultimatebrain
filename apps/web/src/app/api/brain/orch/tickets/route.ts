/**
 * Brain REST API — Create Ticket
 *
 * POST /api/brain/orch/tickets
 *
 * Called by Mini Brains via Brain SDK.
 * Creates a new ticket in the tickets table.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createDb, type Database, tickets, waitForSchema } from '@solarc/db'

import { logger } from '../../../../../lib/logger'
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
    await authenticateEntity(req)
    await waitForSchema()
    const body = await req.json()

    const { title, description, priority, agent } = body as {
      title: string
      description?: string
      priority?: 'low' | 'medium' | 'high' | 'critical'
      agent?: string
    }

    if (!title) {
      return Response.json({ error: 'Missing required field: title' }, { status: 400 })
    }

    const db = getDb()
    const [ticket] = await db
      .insert(tickets)
      .values({
        title,
        description: description ?? null,
        priority: priority ?? 'medium',
        status: 'queued',
        assignedAgentId: agent ?? null,
      })
      .returning({ id: tickets.id, title: tickets.title, status: tickets.status })

    return Response.json({
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
    })
  } catch (err) {
    const internal = err instanceof Error ? err.message : 'Unknown error'
    logger.warn({ err: err instanceof Error ? err : undefined }, '[Brain] Ticket creation failed')
    const status =
      internal.includes('Invalid API key') || internal.includes('Unauthorized') ? 401 : 500
    return Response.json(
      { error: status === 401 ? 'Unauthorized' : 'Ticket creation failed' },
      { status },
    )
  }
}
