/**
 * Brain REST API — Memory Store
 *
 * POST /api/brain/memory/store
 *
 * Called by Mini Brains via Brain SDK.
 * Delegates to MemoryService.store().
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createDb, type Database, waitForSchema } from '@solarc/db'
import { MemoryStoreInput } from '@solarc/engine-contracts'

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
    const body = MemoryStoreInput.parse(await req.json())

    const db = getDb()
    const memoryService = new MemoryService(db)

    const result = await memoryService.store({
      key: body.key,
      content: body.content,
      tier: body.tier,
      workspaceId: body.workspaceId,
    })

    return Response.json({ stored: true, id: result?.id, entityId: entity.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Invalid API key') ? 401 : 500
    return Response.json({ error: message }, { status })
  }
}
