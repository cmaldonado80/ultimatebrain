/**
 * Mini Brain Mesh Registry — Peer discovery and direct delegation tracking.
 *
 * Maintains a registry of active mini brains with their endpoints and capabilities.
 * Enables peer-to-peer delegation between mini brains without routing through Brain A2A.
 */

import type { Database } from '@solarc/db'
import { brainEntities } from '@solarc/db'
import { and, eq } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export interface MeshPeer {
  entityId: string
  name: string
  domain: string | null
  endpoint: string | null
  healthEndpoint: string | null
  capabilities: string[]
  status: string
  lastHeartbeat: string | null
}

export interface MeshRegistration {
  entityId: string
  endpoint: string
  capabilities: string[]
}

export interface MeshDelegation {
  fromEntity: string
  toEntity: string
  task: string
  targetEndpoint: string
}

// ── Peer Discovery ──────────────────────────────────────────────────

/**
 * List all active mini brains that can receive peer delegations.
 * Optionally filter by domain.
 */
export async function discoverPeers(db: Database, domain?: string): Promise<MeshPeer[]> {
  const conditions = [eq(brainEntities.tier, 'mini_brain'), eq(brainEntities.status, 'active')]

  if (domain) {
    conditions.push(eq(brainEntities.domain, domain))
  }

  const entities = await db
    .select({
      id: brainEntities.id,
      name: brainEntities.name,
      domain: brainEntities.domain,
      endpoint: brainEntities.endpoint,
      healthEndpoint: brainEntities.healthEndpoint,
      status: brainEntities.status,
      config: brainEntities.config,
    })
    .from(brainEntities)
    .where(and(...conditions))

  return entities.map((e) => {
    const config = (e.config ?? {}) as Record<string, unknown>
    return {
      entityId: e.id,
      name: e.name,
      domain: e.domain,
      endpoint: e.endpoint,
      healthEndpoint: e.healthEndpoint,
      capabilities: Array.isArray(config.meshCapabilities)
        ? (config.meshCapabilities as string[])
        : [],
      status: e.status,
      lastHeartbeat: typeof config.lastHeartbeatAt === 'string' ? config.lastHeartbeatAt : null,
    }
  })
}

/**
 * Register or update a mini brain's mesh capabilities.
 * Stores capabilities in the entity config JSON.
 */
export async function registerPeer(db: Database, registration: MeshRegistration): Promise<void> {
  const entity = await db.query.brainEntities.findFirst({
    where: eq(brainEntities.id, registration.entityId),
  })
  if (!entity) throw new Error(`Entity ${registration.entityId} not found`)

  const config = (entity.config ?? {}) as Record<string, unknown>

  await db
    .update(brainEntities)
    .set({
      endpoint: registration.endpoint,
      config: {
        ...config,
        meshCapabilities: registration.capabilities,
        meshRegisteredAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(brainEntities.id, registration.entityId))
}

/**
 * Resolve a peer delegation target — find the best peer for a given task.
 * Returns the target's endpoint for direct HTTP delegation.
 */
export async function routePeerDelegation(
  db: Database,
  fromEntityId: string,
  task: string,
): Promise<MeshDelegation | null> {
  // Find peers with matching capabilities (simple keyword match on task)
  const peers = await discoverPeers(db)

  // Exclude self
  const candidates = peers.filter((p) => p.entityId !== fromEntityId && p.endpoint)

  if (candidates.length === 0) return null

  // Score by capability match (how many capabilities contain words from the task)
  const taskWords = task.toLowerCase().split(/\s+/)
  let bestPeer: MeshPeer | null = null
  let bestScore = 0

  for (const peer of candidates) {
    const capText = [...peer.capabilities, peer.domain ?? ''].join(' ').toLowerCase()
    const score = taskWords.filter((w) => capText.includes(w)).length
    if (score > bestScore) {
      bestScore = score
      bestPeer = peer
    }
  }

  // Fallback to first available peer if no capability match
  const target = bestPeer ?? candidates[0]
  if (!target?.endpoint) return null

  return {
    fromEntity: fromEntityId,
    toEntity: target.entityId,
    task,
    targetEndpoint: target.endpoint,
  }
}
