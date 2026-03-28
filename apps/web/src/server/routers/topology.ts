/**
 * Topology Router — thin orchestration layer for Swarm Observatory.
 * Business logic lives in services/topology/*.
 * Snapshot is cached for 30s to avoid redundant rebuilds across procedures.
 */
import type { Database } from '@solarc/db'
import { z } from 'zod'

import { computeBlastRadius } from '../services/topology/analysis'
import { buildTopologySnapshot } from '../services/topology/builder'
import { detectInsights } from '../services/topology/insights'
import { buildRuntimeOverlay } from '../services/topology/overlay'
import type { TopologySnapshot } from '../services/topology/schemas'
import { protectedProcedure, router } from '../trpc'

// ── Snapshot Cache (30s TTL) ─────────────────────────────────────────────

let _snapshotCache: { data: TopologySnapshot; expiresAt: number } | null = null

async function getCachedSnapshot(db: Database): Promise<TopologySnapshot> {
  if (_snapshotCache && Date.now() < _snapshotCache.expiresAt) {
    return _snapshotCache.data
  }
  const data = await buildTopologySnapshot(db)
  _snapshotCache = { data, expiresAt: Date.now() + 30_000 }
  return data
}

// ── Router ───────────────────────────────────────────────────────────────

export const topologyRouter = router({
  /** Full system topology graph */
  getTopology: protectedProcedure.query(async ({ ctx }) => {
    return getCachedSnapshot(ctx.db)
  }),

  /** Runtime overlay — live agent statuses, health score */
  getRuntimeOverlay: protectedProcedure.query(async ({ ctx }) => {
    return buildRuntimeOverlay(ctx.db)
  }),

  /** Blast radius analysis — what's affected if a node fails */
  getBlastRadius: protectedProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const snapshot = await getCachedSnapshot(ctx.db)
      return computeBlastRadius(snapshot, input.nodeId)
    }),

  /** Smart insights — detect topology issues */
  getInsights: protectedProcedure.query(async ({ ctx }) => {
    const snapshot = await getCachedSnapshot(ctx.db)
    return detectInsights(snapshot, ctx.db)
  }),
})
