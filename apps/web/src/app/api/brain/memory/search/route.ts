/**
 * Brain REST API — Memory Search
 *
 * POST /api/brain/memory/search
 *
 * Called by Mini Brains via Brain SDK.
 * Delegates to MemoryService.search().
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createDb, type Database, waitForSchema } from '@solarc/db'
import { MemorySearchInput } from '@solarc/engine-contracts'

import { MemoryService } from '../../../../../server/services/memory/memory-service'
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
    const body = MemorySearchInput.parse(await req.json())

    const db = getDb()
    const memoryService = new MemoryService(db)

    const results = await memoryService.search(body.query, {
      tier: body.tier,
      workspaceId: body.appId,
      limit: body.limit,
    })

    return Response.json({ results, entityId: entity.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Invalid API key') ? 401 : 500
    return Response.json({ error: message }, { status })
  }
}
