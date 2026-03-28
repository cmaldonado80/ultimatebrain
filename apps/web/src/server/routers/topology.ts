/**
 * Topology Router — thin orchestration layer for Swarm Observatory.
 * Business logic lives in services/topology/*.
 */
import { z } from 'zod'

import { computeBlastRadius } from '../services/topology/analysis'
import { buildTopologySnapshot } from '../services/topology/builder'
import { detectInsights } from '../services/topology/insights'
import { buildRuntimeOverlay } from '../services/topology/overlay'
import { protectedProcedure, router } from '../trpc'

export const topologyRouter = router({
  /** Full system topology graph */
  getTopology: protectedProcedure.query(async ({ ctx }) => {
    return buildTopologySnapshot(ctx.db)
  }),

  /** Runtime overlay — live agent statuses, health score */
  getRuntimeOverlay: protectedProcedure.query(async ({ ctx }) => {
    return buildRuntimeOverlay(ctx.db)
  }),

  /** Blast radius analysis — what's affected if a node fails */
  getBlastRadius: protectedProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const snapshot = await buildTopologySnapshot(ctx.db)
      return computeBlastRadius(snapshot, input.nodeId)
    }),

  /** Smart insights — detect topology issues */
  getInsights: protectedProcedure.query(async ({ ctx }) => {
    const snapshot = await buildTopologySnapshot(ctx.db)
    return detectInsights(snapshot, ctx.db)
  }),
})
