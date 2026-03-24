/**
 * Presence Router — real-time user and agent presence tracking.
 */
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { PresenceManager } from '../services/presence/manager'

let _manager: PresenceManager | null = null
function getManager() {
  return (_manager ??= new PresenceManager())
}

export const presenceRouter = router({
  /** Get all currently active entries */
  getActive: protectedProcedure.query(() => {
    return getManager().getAll()
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
    .mutation(({ input }) => {
      getManager().join(input)
      return { joined: true }
    }),

  /** Leave presence */
  leave: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    getManager().leave(input.id)
    return { left: true }
  }),

  /** Heartbeat to stay active */
  heartbeat: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    getManager().heartbeat(input.id)
    return { ok: true }
  }),
})
