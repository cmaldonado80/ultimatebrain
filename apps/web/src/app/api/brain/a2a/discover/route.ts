/**
 * Brain REST API — A2A Agent Discovery
 *
 * POST /api/brain/a2a/discover
 *
 * Called by Mini Brains via Brain SDK.
 * Queries agents table filtered by skills/type/domain.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { agents, createDb, type Database, waitForSchema } from '@solarc/db'
import { ne } from 'drizzle-orm'

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

    const { capability, domain } = body as {
      capability?: string
      domain?: string
    }

    const db = getDb()

    // Query all non-offline agents
    let rows = await db
      .select({
        id: agents.id,
        name: agents.name,
        type: agents.type,
        status: agents.status,
        skills: agents.skills,
        workspaceId: agents.workspaceId,
        description: agents.description,
      })
      .from(agents)
      .where(ne(agents.status, 'offline'))

    // Filter by capability (check skills array)
    if (capability) {
      rows = rows.filter(
        (r) => r.skills && Array.isArray(r.skills) && r.skills.includes(capability),
      )
    }

    // Filter by domain (match against type or workspaceId)
    if (domain) {
      rows = rows.filter((r) => r.type === domain || r.workspaceId === domain)
    }

    return Response.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        capabilities: r.skills ?? [],
        status: r.status,
        type: r.type,
        description: r.description,
      })),
    )
  } catch (err) {
    const internal = err instanceof Error ? err.message : 'Unknown error'
    logger.warn({ err: err instanceof Error ? err : undefined }, '[Brain] A2A discover failed')
    const status =
      internal.includes('Invalid API key') || internal.includes('Unauthorized') ? 401 : 500
    return Response.json(
      { error: status === 401 ? 'Unauthorized' : 'Agent discovery failed' },
      { status },
    )
  }
}
