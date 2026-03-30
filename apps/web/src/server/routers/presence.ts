/**
 * Presence Router — real-time user and agent presence tracking.
 * DB-backed via presence_entries table for persistence across restarts.
 */
import { z } from 'zod'

import { getPresenceManager } from '../services/presence/manager'
import { protectedProcedure, router } from '../trpc'

export const presenceRouter = router({
  /** Get all currently active entries */
  getActive: protectedProcedure.query(({ ctx }) => {
    return getPresenceManager(ctx.db).getAll()
  }),

  /** Join presence (register as active) */
  join: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        type: z.enum(['user', 'agent']),
        name: z.string(),
        location: z.string().default('/'),
        workspaceId: z.string().uuid().optional(),
        ticketId: z.string().uuid().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      getPresenceManager(ctx.db).join(input)
      return { joined: true }
    }),

  /** Leave presence */
  leave: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    getPresenceManager(ctx.db).leave(input.id)
    return { left: true }
  }),

  /** Heartbeat to stay active */
  heartbeat: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    getPresenceManager(ctx.db).heartbeat(input.id)
    return { ok: true }
  }),
})
