/**
 * Runtime Status Router — unified health aggregation across all tiers.
 *
 * Queries Brain, Mini Brains, and Development entities to produce
 * a single operator-facing view of platform health.
 *
 * Uses existing infrastructure:
 * - brainEntities table for service discovery
 * - /health endpoints on Brain + Mini Brains
 * - traces table for error rates
 */

import { traces } from '@solarc/db'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { z } from 'zod'

import { protectedProcedure, router } from '../trpc'

// ── Types ─────────────────────────────────────────────────────────────

interface DependencyStatus {
  name: string
  status: 'ok' | 'degraded' | 'down' | 'unknown'
  latencyMs?: number
}

interface ServiceStatus {
  serviceId: string
  serviceType: 'brain' | 'mini_brain' | 'development'
  name: string
  domain: string | null
  status: 'ok' | 'degraded' | 'down' | 'unknown'
  checkedAt: string
  latencyMs: number | null
  uptimeSeconds: number | null
  dependencies: DependencyStatus[]
  message: string | null
  endpoint: string | null
}

// ── Health Check Cache (30s TTL) ──────────────────────────────────────

const healthCache = new Map<string, { result: ServiceStatus; fetchedAt: number }>()
const CACHE_TTL_MS = 30_000

// ── Router ────────────────────────────────────────────────────────────

export const runtimeStatusRouter = router({
  /** Get aggregated runtime status for all services */
  getRuntimeStatus: protectedProcedure.query(async ({ ctx }) => {
    const entities = await ctx.db.query.brainEntities.findMany({ limit: 200 })
    const statuses: ServiceStatus[] = []

    // Brain self-check (always available — it's the current service)
    const brainStart = Date.now()
    let brainOk = false
    try {
      await ctx.db.execute(sql`SELECT 1`)
      brainOk = true
    } catch {
      brainOk = false
    }

    statuses.push({
      serviceId: 'brain-core',
      serviceType: 'brain',
      name: 'Solarc Brain',
      domain: null,
      status: brainOk ? 'ok' : 'down',
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - brainStart,
      uptimeSeconds: Math.round(process.uptime()),
      dependencies: [],
      message: brainOk ? null : 'Database unreachable',
      endpoint: null,
    })

    // Check Mini Brains + Developments
    for (const entity of entities) {
      const cacheKey = entity.id
      const cached = healthCache.get(cacheKey)
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        statuses.push(cached.result)
        continue
      }

      const serviceStatus = await checkEntityHealth(entity)
      healthCache.set(cacheKey, { result: serviceStatus, fetchedAt: Date.now() })
      statuses.push(serviceStatus)
    }

    // Summary counts
    const total = statuses.length
    const ok = statuses.filter((s) => s.status === 'ok').length
    const degraded = statuses.filter((s) => s.status === 'degraded').length
    const down = statuses.filter((s) => s.status === 'down').length
    const unknown = statuses.filter((s) => s.status === 'unknown').length

    return { services: statuses, summary: { total, ok, degraded, down, unknown } }
  }),

  /** Get recent issues from traces (errors in last hour) */
  getRecentIssues: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }).optional())
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - 60 * 60 * 1000)
      const errorTraces = await ctx.db.query.traces.findMany({
        where: and(eq(traces.status, 'error'), gte(traces.createdAt, since)),
        orderBy: desc(traces.createdAt),
        limit: input?.limit ?? 10,
      })

      return errorTraces.map((t) => ({
        id: t.spanId,
        service: t.service ?? 'unknown',
        operation: t.operation,
        error: ((t.attributes as Record<string, unknown>)?.['error.message'] as string) ?? null,
        timestamp: t.createdAt.toISOString(),
        durationMs: t.durationMs,
      }))
    }),
})

// ── Health Check Helper ───────────────────────────────────────────────

async function checkEntityHealth(entity: {
  id: string
  name: string
  tier: string
  domain: string | null
  endpoint: string | null
  healthEndpoint: string | null
  status: string
}): Promise<ServiceStatus> {
  const base: ServiceStatus = {
    serviceId: entity.id,
    serviceType: entity.tier as 'brain' | 'mini_brain' | 'development',
    name: entity.name,
    domain: entity.domain,
    status: 'unknown',
    checkedAt: new Date().toISOString(),
    latencyMs: null,
    uptimeSeconds: null,
    dependencies: [],
    message: null,
    endpoint: entity.endpoint,
  }

  // No endpoint = unknown
  const healthUrl = entity.healthEndpoint ?? (entity.endpoint ? `${entity.endpoint}/health` : null)
  if (!healthUrl) {
    base.message = 'No endpoint configured'
    return base
  }

  // Suspended entity
  if (entity.status === 'suspended') {
    base.status = 'down'
    base.message = 'Entity is suspended'
    return base
  }

  // Fetch health endpoint
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const res = await fetch(healthUrl, { signal: controller.signal })
    clearTimeout(timeout)
    base.latencyMs = Date.now() - start

    if (!res.ok) {
      base.status = 'down'
      base.message = `Health check returned ${res.status}`
      return base
    }

    const data = (await res.json()) as {
      status?: string
      uptime?: number
      dependencies?: Record<string, { status?: string; latencyMs?: number }>
    }

    base.status = data.status === 'degraded' ? 'degraded' : data.status === 'ok' ? 'ok' : 'down'
    base.uptimeSeconds = typeof data.uptime === 'number' ? data.uptime : null

    // Parse dependencies
    if (data.dependencies) {
      for (const [name, dep] of Object.entries(data.dependencies)) {
        base.dependencies.push({
          name,
          status: (dep.status as DependencyStatus['status']) ?? 'unknown',
          latencyMs: dep.latencyMs ?? undefined,
        })
      }
    }

    // Latency-based degradation
    if (base.status === 'ok' && base.latencyMs > 5000) {
      base.status = 'degraded'
      base.message = `High latency: ${base.latencyMs}ms`
    }
  } catch (err) {
    base.latencyMs = Date.now() - start
    base.status = 'down'
    base.message = err instanceof Error ? err.message : 'Health check failed'
  }

  return base
}
