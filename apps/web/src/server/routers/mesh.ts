/**
 * Mesh Router — Mini brain peer-to-peer discovery and delegation.
 */

import { z } from 'zod'

import {
  discoverPeers,
  registerPeer,
  routePeerDelegation,
} from '../services/platform/mesh-registry'
import { protectedProcedure, router } from '../trpc'

export const meshRouter = router({
  /** List all active mini brain peers, optionally filtered by domain */
  peers: protectedProcedure
    .input(z.object({ domain: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return discoverPeers(ctx.db, input?.domain)
    }),

  /** Register or update a mini brain's mesh endpoint and capabilities */
  register: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        endpoint: z.string().url(),
        capabilities: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await registerPeer(ctx.db, input)
      return { registered: true }
    }),

  /** Route a delegation to the best matching peer */
  route: protectedProcedure
    .input(
      z.object({
        fromEntityId: z.string().uuid(),
        task: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      return routePeerDelegation(ctx.db, input.fromEntityId, input.task)
    }),
})
