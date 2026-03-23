import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { HealingEngine } from '../services/healing'

let engine: HealingEngine | null = null
function getEngine(db: any) { return engine ??= new HealingEngine(db) }

export const healingRouter = router({
  /** Run full system diagnostic */
  diagnose: publicProcedure.query(async ({ ctx }) => {
    return getEngine(ctx.db).diagnose()
  }),

  /** Get HealthCheckOutput (contract-compatible) */
  healthCheck: publicProcedure.query(async ({ ctx }) => {
    return getEngine(ctx.db).healthCheck()
  }),

  /** Run auto-heal: diagnose + take corrective actions */
  autoHeal: publicProcedure.mutation(async ({ ctx }) => {
    return getEngine(ctx.db).autoHeal()
  }),

  /** Restart a specific agent */
  restartAgent: publicProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).restartAgent(input.agentId, input.reason)
    }),

  /** Clear expired execution leases */
  clearExpiredLeases: publicProcedure.mutation(async ({ ctx }) => {
    return getEngine(ctx.db).clearExpiredLeases()
  }),

  /** Requeue a failed ticket for retry */
  requeueTicket: publicProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).requeueTicket(input.ticketId, input.reason)
    }),

  /** Get recent healing action log */
  healingLog: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getEngine(ctx.db).getHealingLog(input?.limit)
    }),
})
