/**
 * Topology Router — thin orchestration layer for Swarm Observatory.
 * Snapshot cached 30s with in-flight deduplication.
 */
import type { Database } from '@solarc/db'
import { z } from 'zod'

import { computeBlastRadius } from '../services/topology/analysis'
import { buildTopologySnapshot } from '../services/topology/builder'
import { detectInsights } from '../services/topology/insights'
import { buildRuntimeOverlay } from '../services/topology/overlay'
import type { TopologySnapshot } from '../services/topology/schemas'
import { protectedProcedure, router } from '../trpc'

// ── Snapshot Cache (30s TTL + in-flight dedup) ───────────────────────────

let _cache: { data: TopologySnapshot; expiresAt: number } | null = null
let _inFlight: Promise<TopologySnapshot> | null = null

async function getCachedSnapshot(db: Database): Promise<TopologySnapshot> {
  // Return cached if valid
  if (_cache && Date.now() < _cache.expiresAt) return _cache.data
  // Deduplicate concurrent requests
  if (_inFlight) return _inFlight
  // Build, cache, and return
  _inFlight = buildTopologySnapshot(db).then((data) => {
    _cache = { data, expiresAt: Date.now() + 30_000 }
    _inFlight = null
    return data
  })
  return _inFlight
}

// ── Router ───────────────────────────────────────────────────────────────

export const topologyRouter = router({
  getTopology: protectedProcedure.query(async ({ ctx }) => {
    return getCachedSnapshot(ctx.db)
  }),

  getRuntimeOverlay: protectedProcedure.query(async ({ ctx }) => {
    return buildRuntimeOverlay(ctx.db)
  }),

  getBlastRadius: protectedProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const snapshot = await getCachedSnapshot(ctx.db)
      return computeBlastRadius(snapshot, input.nodeId)
    }),

  getInsights: protectedProcedure.query(async ({ ctx }) => {
    const snapshot = await getCachedSnapshot(ctx.db)
    return detectInsights(snapshot, ctx.db)
  }),
})
