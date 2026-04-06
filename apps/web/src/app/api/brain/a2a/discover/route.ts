/**
 * Brain REST API — A2A Discover
 *
 * POST /api/brain/a2a/discover
 *
 * Called by Mini Brains via Brain SDK.
 * Queries agents table to discover available agents by capability/domain.
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
    let results = await db.query.agents.findMany({
      where: ne(agents.status, 'offline'),
    })

    // Filter by capability (check skills array)
    if (capability) {
      results = results.filter(
        (a) => a.skills && Array.isArray(a.skills) && a.skills.includes(capability),
      )
    }

    // Filter by domain (match type or workspaceId)
    if (domain) {
      results = results.filter((a) => a.type === domain || a.workspaceId === domain)
    }

    const agentInfos = results.map((a) => ({
      id: a.id,
      name: a.name,
      capabilities: a.skills ?? [],
      status: a.status,
    }))

    return Response.json(agentInfos)
  } catch (err) {
    const internal = err instanceof Error ? err.message : 'Unknown error'
    logger.warn({ err: err instanceof Error ? err : undefined }, 'A2A discover failed')
    const status =
      internal.includes('Invalid API key') || internal.includes('Unauthorized') ? 401 : 500
    return Response.json(
      { error: status === 401 ? 'Unauthorized' : 'Agent discovery failed' },
      { status },
    )
  }
}
