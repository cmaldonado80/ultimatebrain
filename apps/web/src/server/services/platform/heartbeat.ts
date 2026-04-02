/**
 * Mini Brain Heartbeat — Active health monitoring for all mini brains.
 *
 * Periodically pings each mini brain's health endpoint to detect failures.
 * Auto-degrades entities after 3 consecutive failures, auto-recovers when healthy.
 */

import type { Database } from '@solarc/db'
import { brainEntities } from '@solarc/db'
import { and, eq, inArray } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export interface HeartbeatResult {
  checked: number
  healthy: number
  degraded: number
  recovered: number
  errors: string[]
}

export interface HeartbeatStatus {
  entityId: string
  name: string
  domain: string | null
  status: string
  endpoint: string | null
  healthEndpoint: string | null
  lastHealthCheck: Date | null
  failCount: number
}

const FAIL_THRESHOLD = 3
const HEALTH_TIMEOUT_MS = 5_000

// ── Heartbeat Sweep ──────────────────────────────────────────────────

/**
 * Ping all active/degraded mini brains and update their health status.
 * Call this from a cron job or manual trigger.
 */
export async function runHeartbeatSweep(db: Database): Promise<HeartbeatResult> {
  const result: HeartbeatResult = {
    checked: 0,
    healthy: 0,
    degraded: 0,
    recovered: 0,
    errors: [],
  }

  // Get all mini brains that should be monitored
  const entities = await db
    .select({
      id: brainEntities.id,
      name: brainEntities.name,
      status: brainEntities.status,
      endpoint: brainEntities.endpoint,
      healthEndpoint: brainEntities.healthEndpoint,
      config: brainEntities.config,
    })
    .from(brainEntities)
    .where(
      and(
        eq(brainEntities.tier, 'mini_brain'),
        inArray(brainEntities.status, ['active', 'degraded']),
      ),
    )

  for (const entity of entities) {
    const healthUrl =
      entity.healthEndpoint ?? (entity.endpoint ? `${entity.endpoint}/health` : null)
    if (!healthUrl) {
      // No endpoint configured — skip but don't fail
      continue
    }

    result.checked++
    const config = (entity.config ?? {}) as Record<string, unknown>
    const failCount = typeof config.heartbeatFailCount === 'number' ? config.heartbeatFailCount : 0

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)

      // Use Promise.race as backup timeout in case AbortController doesn't catch DNS/connect failures
      const fetchPromise = fetch(healthUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), HEALTH_TIMEOUT_MS + 1000),
      )
      const response = await Promise.race([fetchPromise, timeoutPromise])
      clearTimeout(timeout)

      if (response.ok) {
        // Healthy
        result.healthy++

        if (entity.status === 'degraded') {
          // Auto-recover
          await db
            .update(brainEntities)
            .set({
              status: 'active',
              lastHealthCheck: new Date(),
              config: {
                ...config,
                heartbeatFailCount: 0,
                lastHeartbeatAt: new Date().toISOString(),
              },
              updatedAt: new Date(),
            })
            .where(eq(brainEntities.id, entity.id))
          result.recovered++
        } else {
          // Just update health check timestamp
          await db
            .update(brainEntities)
            .set({
              lastHealthCheck: new Date(),
              config: {
                ...config,
                heartbeatFailCount: 0,
                lastHeartbeatAt: new Date().toISOString(),
              },
              updatedAt: new Date(),
            })
            .where(eq(brainEntities.id, entity.id))
        }
      } else {
        // Non-OK response
        await handleUnhealthy(db, entity.id, config, failCount, result, `HTTP ${response.status}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error'
      await handleUnhealthy(db, entity.id, config, failCount, result, msg)
    }
  }

  return result
}

async function handleUnhealthy(
  db: Database,
  entityId: string,
  config: Record<string, unknown>,
  currentFailCount: number,
  result: HeartbeatResult,
  reason: string,
): Promise<void> {
  const newFailCount = currentFailCount + 1
  const shouldDegrade = newFailCount >= FAIL_THRESHOLD

  await db
    .update(brainEntities)
    .set({
      status: shouldDegrade ? 'degraded' : undefined,
      lastHealthCheck: new Date(),
      config: {
        ...config,
        heartbeatFailCount: newFailCount,
        lastHeartbeatAt: new Date().toISOString(),
        lastHeartbeatError: reason,
      },
      updatedAt: new Date(),
    })
    .where(eq(brainEntities.id, entityId))

  if (shouldDegrade) {
    result.degraded++
    result.errors.push(`${entityId}: degraded after ${newFailCount} failures (${reason})`)
  }
}

/**
 * Get heartbeat status for all mini brains.
 */
export async function getHeartbeatStatus(db: Database): Promise<HeartbeatStatus[]> {
  const entities = await db
    .select({
      id: brainEntities.id,
      name: brainEntities.name,
      domain: brainEntities.domain,
      status: brainEntities.status,
      endpoint: brainEntities.endpoint,
      healthEndpoint: brainEntities.healthEndpoint,
      lastHealthCheck: brainEntities.lastHealthCheck,
      config: brainEntities.config,
    })
    .from(brainEntities)
    .where(eq(brainEntities.tier, 'mini_brain'))

  return entities.map((e) => ({
    entityId: e.id,
    name: e.name,
    domain: e.domain,
    status: e.status,
    endpoint: e.endpoint,
    healthEndpoint: e.healthEndpoint,
    lastHealthCheck: e.lastHealthCheck,
    failCount:
      typeof (e.config as Record<string, unknown>)?.heartbeatFailCount === 'number'
        ? ((e.config as Record<string, unknown>).heartbeatFailCount as number)
        : 0,
  }))
}
