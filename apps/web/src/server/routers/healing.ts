/**
 * Healing Router — self-healing error recovery for agent workflows.
 *
 * Exposes the full Self-Healing Cortex: predictive analysis, recovery state
 * machine, adaptive tuning, instinct execution, and agent degradation.
 */
import type { Database } from '@solarc/db'
import { z } from 'zod'

import { getOrCreateCortex } from '../services/healing/index'
import { protectedProcedure, router } from '../trpc'

function getCortex(db: Database) {
  return getOrCreateCortex(db)
}

function getEngine(db: Database) {
  return getCortex(db).healer
}

export const healingRouter = router({
  // ── Legacy + Core ────────────────────────────────────────────────────

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
    .input(z.object({ agentId: z.string().uuid(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).restartAgent(input.agentId, input.reason)
    }),

  /** Clear expired execution leases */
  clearExpiredLeases: protectedProcedure.mutation(async ({ ctx }) => {
    return getEngine(ctx.db).clearExpiredLeases()
  }),

  /** Requeue a failed ticket for retry */
  requeueTicket: protectedProcedure
    .input(z.object({ ticketId: z.string().uuid(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).requeueTicket(input.ticketId, input.reason)
    }),

  /** Get recent healing action log */
  healingLog: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getEngine(ctx.db).getHealingLog(input?.limit)
    }),

  // ── Cortex (OODA Loop) ──────────────────────────────────────────────

  /** Run one full Cortex OODA cycle */
  cortexCycle: protectedProcedure.mutation(async ({ ctx }) => {
    return getCortex(ctx.db).runCycle()
  }),

  /** Get cortex status */
  cortexStatus: protectedProcedure.query(async ({ ctx }) => {
    return getCortex(ctx.db).getStatus()
  }),

  /** Get detailed subsystem states */
  subsystemStates: protectedProcedure.query(async ({ ctx }) => {
    return getCortex(ctx.db).getSubsystemStates()
  }),

  // ── Predictive ──────────────────────────────────────────────────────

  /** Get predictive report */
  predictiveReport: protectedProcedure.query(async ({ ctx }) => {
    return getCortex(ctx.db).predictor.predict()
  }),

  /** Get raw metric snapshots */
  metricSnapshot: protectedProcedure.query(async ({ ctx }) => {
    return getCortex(ctx.db).predictor.getMetricSnapshot()
  }),

  // ── Adaptive Tuning ─────────────────────────────────────────────────

  /** Get all tuning states */
  tuningStates: protectedProcedure.query(async ({ ctx }) => {
    return getCortex(ctx.db).tuner.getAllStates()
  }),

  /** Get tuning action history */
  tuningActions: protectedProcedure.query(async ({ ctx }) => {
    return getCortex(ctx.db).tuner.getActionHistory()
  }),

  /** Run adaptive tuning cycle manually */
  runTuning: protectedProcedure.mutation(async ({ ctx }) => {
    return getCortex(ctx.db).tuner.tune()
  }),

  // ── Recovery ────────────────────────────────────────────────────────

  /** Get recovery execution history */
  recoveryHistory: protectedProcedure.query(async ({ ctx }) => {
    return getCortex(ctx.db).recovery.getHistory()
  }),

  // ── Agent Degradation ───────────────────────────────────────────────

  /** Get all agent degradation profiles */
  degradationProfiles: protectedProcedure.query(async ({ ctx }) => {
    return getCortex(ctx.db).degradation.getAllProfiles()
  }),

  /** Get recent degradation events */
  degradationEvents: protectedProcedure.query(async ({ ctx }) => {
    return getCortex(ctx.db).degradation.getRecentEvents()
  }),

  /** Force an agent to a specific capability level */
  forceAgentLevel: protectedProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        agentName: z.string(),
        level: z.enum(['full', 'reduced', 'minimal', 'suspended']),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getCortex(ctx.db).degradation.forceLevel(
        input.agentId,
        input.agentName,
        input.level,
        input.reason,
      )
    }),

  // ── Instinct Executor ───────────────────────────────────────────────

  /** Get instinct executor stats */
  instinctExecutorStats: protectedProcedure.query(async ({ ctx }) => {
    return getCortex(ctx.db).instinctExecutor.getStats()
  }),

  // ── Unified: Record Outcome ─────────────────────────────────────────

  /** Record an agent task outcome (feeds all subsystems) */
  recordOutcome: protectedProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        agentName: z.string(),
        success: z.boolean(),
        latencyMs: z.number(),
        tokensUsed: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getCortex(ctx.db).recordAgentOutcome(
        input.agentId,
        input.agentName,
        input.success,
        input.latencyMs,
        input.tokensUsed ?? 0,
      )
    }),
})
