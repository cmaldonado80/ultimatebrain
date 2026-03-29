/**
 * Entity Authentication — validates Brain SDK requests from Mini Brains.
 *
 * Reads `Authorization: Bearer <apiKey>` header, hashes it,
 * looks up the brainEntity by apiKeyHash. Returns entity or throws 401.
 */

import type { Database } from '@solarc/db'
import { createDb, waitForSchema } from '@solarc/db'
import { brainEntities } from '@solarc/db'
import { createHash } from 'crypto'
import { eq } from 'drizzle-orm'

let _db: Database | undefined

function getDb(): Database {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _db = createDb(url)
  }
  return _db
}

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export interface AuthenticatedEntity {
  id: string
  name: string
  tier: string
  domain: string | null
  status: string
}

/**
 * Authenticate a Brain SDK request.
 * Extracts Bearer token, hashes it, looks up entity.
 * Returns the entity record or throws an error.
 */
export async function authenticateEntity(req: Request): Promise<AuthenticatedEntity> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header')
  }

  const apiKey = authHeader.slice(7)
  if (!apiKey) {
    throw new Error('Empty API key')
  }

  const hash = hashApiKey(apiKey)
  await waitForSchema()
  const db = getDb()

  const entity = await db.query.brainEntities.findFirst({
    where: eq(brainEntities.apiKeyHash, hash),
  })

  if (!entity) {
    throw new Error('Invalid API key')
  }

  if (entity.status === 'suspended') {
    throw new Error('Entity is suspended')
  }

  return {
    id: entity.id,
    name: entity.name,
    tier: entity.tier,
    domain: entity.domain,
    status: entity.status,
  }
}

/**
 * Generate an API key and its hash for entity provisioning.
 */
export function generateEntityApiKey(): { apiKey: string; apiKeyHash: string } {
  const apiKey = `sb_${crypto.randomUUID().replace(/-/g, '')}`
  const apiKeyHash = hashApiKey(apiKey)
  return { apiKey, apiKeyHash }
}
