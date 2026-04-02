/**
 * Mini Brain Live Stats — Real-time operational metrics per mini brain.
 *
 * Aggregates request throughput, active delegations, cost, and health data
 * for the live mini brain dashboard.
 */

import type { Database } from '@solarc/db'
import { brainEntities, brainEntityAgents, memories, tokenLedger } from '@solarc/db'
import { and, eq, gte, sql } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export interface ThroughputBucket {
  bucket: string // ISO timestamp for bucket start
  requests: number
  tokens: number
  costUsd: number
}

export interface MiniBrainLiveStats {
  entityId: string
  requestsLastHour: number
  tokensLastHour: number
  costLast24h: number
  agentCount: number
  memoryCount: number
  lastHeartbeat: string | null
  failCount: number
  throughputBuckets: ThroughputBucket[]
}

// ── Stats Aggregation ────────────────────────────────────────────────

export async function getMiniBrainLiveStats(
  db: Database,
  entityId: string,
): Promise<MiniBrainLiveStats> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // Get entity config for heartbeat info
  const entity = await db.query.brainEntities.findFirst({
    where: eq(brainEntities.id, entityId),
  })
  const config = (entity?.config ?? {}) as Record<string, unknown>

  // Agent count
  const [agentRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(brainEntityAgents)
    .where(eq(brainEntityAgents.entityId, entityId))
  const agentCount = agentRow?.count ?? 0

  // Memory count (scoped by workspace if available)
  let memoryCount = 0
  try {
    const [memRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(memories)
      .where(eq(memories.workspaceId, entityId))
    memoryCount = memRow?.count ?? 0
  } catch {
    // memories table may not have workspaceId column in all setups
  }

  // Last hour request stats from token ledger
  let requestsLastHour = 0
  let tokensLastHour = 0
  let costLast24h = 0
  const throughputBuckets: ThroughputBucket[] = []

  try {
    // Aggregate last hour
    const [hourRow] = await db
      .select({
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${tokenLedger.tokensIn} + ${tokenLedger.tokensOut}), 0)::int`,
      })
      .from(tokenLedger)
      .where(and(eq(tokenLedger.entityId, entityId), gte(tokenLedger.createdAt, oneHourAgo)))
    requestsLastHour = hourRow?.requests ?? 0
    tokensLastHour = hourRow?.tokens ?? 0

    // 24h cost
    const [costRow] = await db
      .select({
        cost: sql<number>`coalesce(sum(${tokenLedger.costUsd}), 0)::float`,
      })
      .from(tokenLedger)
      .where(
        and(eq(tokenLedger.entityId, entityId), gte(tokenLedger.createdAt, twentyFourHoursAgo)),
      )
    costLast24h = costRow?.cost ?? 0

    // 5-minute throughput buckets for last hour (12 buckets)
    const bucketRows = await db
      .select({
        bucket: sql<string>`to_char(date_trunc('hour', ${tokenLedger.createdAt}) + (extract(minute from ${tokenLedger.createdAt})::int / 5) * interval '5 minutes', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${tokenLedger.tokensIn} + ${tokenLedger.tokensOut}), 0)::int`,
        costUsd: sql<number>`coalesce(sum(${tokenLedger.costUsd}), 0)::float`,
      })
      .from(tokenLedger)
      .where(and(eq(tokenLedger.entityId, entityId), gte(tokenLedger.createdAt, oneHourAgo)))
      .groupBy(
        sql`date_trunc('hour', ${tokenLedger.createdAt}) + (extract(minute from ${tokenLedger.createdAt})::int / 5) * interval '5 minutes'`,
      )
      .orderBy(
        sql`date_trunc('hour', ${tokenLedger.createdAt}) + (extract(minute from ${tokenLedger.createdAt})::int / 5) * interval '5 minutes'`,
      )

    for (const row of bucketRows) {
      throughputBuckets.push({
        bucket: row.bucket,
        requests: row.requests,
        tokens: row.tokens,
        costUsd: row.costUsd,
      })
    }
  } catch {
    // Token ledger may not have data yet
  }

  return {
    entityId,
    requestsLastHour,
    tokensLastHour,
    costLast24h,
    agentCount,
    memoryCount,
    lastHeartbeat: typeof config.lastHeartbeatAt === 'string' ? config.lastHeartbeatAt : null,
    failCount: typeof config.heartbeatFailCount === 'number' ? config.heartbeatFailCount : 0,
    throughputBuckets,
  }
}
