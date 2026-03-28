/**
 * Healing Router — self-healing error recovery for agent workflows.
 *
 * Detects failures in agent execution and applies corrective strategies
 * (retry, fallback, prompt repair) to recover without human intervention.
 */
import type { Database } from '@solarc/db'
import { z } from 'zod'

import { HealingEngine } from '../services/healing'
import { protectedProcedure, router } from '../trpc'

let engine: HealingEngine | null = null
function getEngine(db: Database) {
  return (engine ??= new HealingEngine(db))
}

export const healingRouter = router({
  /** Run full system diagnostic */
  diagnose: protectedProcedure.query(async ({ ctx }) => {
    return getEngine(ctx.db).diagnose()
  }),

  /** Get HealthCheckOutput (contract-compatible) */
  healthCheck: protectedProcedure.query(async ({ ctx }) => {
    return getEngine(ctx.db).healthCheck()
  }),

  /** Run auto-heal: diagnose + take corrective actions */
  autoHeal: protectedProcedure.mutation(async ({ ctx }) => {
    return getEngine(ctx.db).autoHeal()
  }),

  /** Restart a specific agent */
  restartAgent: protectedProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).restartAgent(input.agentId, input.reason)
    }),

  /** Clear expired execution leases */
  clearExpiredLeases: protectedProcedure.mutation(async ({ ctx }) => {
    return getEngine(ctx.db).clearExpiredLeases()
  }),

  /** Requeue a failed ticket for retry */
  requeueTicket: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).requeueTicket(input.ticketId, input.reason)
    }),

  /** Get recent healing action log */
  healingLog: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getEngine(ctx.db).getHealingLog(input?.limit)
    }),
})
