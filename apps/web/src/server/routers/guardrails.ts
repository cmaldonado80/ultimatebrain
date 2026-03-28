/**
 * Guardrails Router — safety enforcement and compliance monitoring.
 *
 * Runs guardrail checks against agent outputs, logs violations, and provides
 * analytics on guardrail trigger rates and compliance trends.
 */
import type { Database } from '@solarc/db'
import { guardrailLogs } from '@solarc/db'
import { GuardrailCheckInput } from '@solarc/engine-contracts'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { z } from 'zod'

import { GuardrailEngine } from '../services/guardrails'
import { protectedProcedure, router } from '../trpc'

let engineInstance: GuardrailEngine | null = null

function getEngine(db: Database): GuardrailEngine {
  if (!engineInstance) {
    engineInstance = new GuardrailEngine(db)
  }
  return engineInstance
}

export const guardrailsRouter = router({
  /** Check content against guardrails (input layer) */
  checkInput: protectedProcedure.input(GuardrailCheckInput).mutation(async ({ ctx, input }) => {
    const engine = getEngine(ctx.db)
    return engine.checkInput(input.content, { agentId: input.agentId })
  }),

  /** Check content against guardrails (output layer) */
  checkOutput: protectedProcedure.input(GuardrailCheckInput).mutation(async ({ ctx, input }) => {
    const engine = getEngine(ctx.db)
    return engine.checkOutput(input.content, { agentId: input.agentId })
  }),

  /** Check tool call JSON against guardrails */
  checkTool: protectedProcedure
    .input(
      z.object({
        content: z.string(),
        agentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const engine = getEngine(ctx.db)
      return engine.checkTool(input.content, { agentId: input.agentId })
    }),

  /** Check content against specific layer with optional policy filter */
  check: protectedProcedure
    .input(
      z.object({
        content: z.string(),
        layer: z.enum(['input', 'output', 'tool']),
        agentId: z.string().uuid().optional(),
        ticketId: z.string().uuid().optional(),
        policies: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const engine = getEngine(ctx.db)
      return engine.check(input.content, input.layer, {
        agentId: input.agentId,
        ticketId: input.ticketId,
        policies: input.policies,
      })
    }),

  /** List all registered rules */
  rules: protectedProcedure.query(async ({ ctx }) => {
    const engine = getEngine(ctx.db)
    return engine.listRules()
  }),

  /** Get recent violation logs */
  logs: protectedProcedure
    .input(
      z
        .object({
          agentId: z.string().uuid().optional(),
          limit: z.number().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input?.agentId) conditions.push(eq(guardrailLogs.agentId, input.agentId))

      return ctx.db
        .select()
        .from(guardrailLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(guardrailLogs.createdAt))
        .limit(input?.limit ?? 100)
    }),

  /** Get violation stats (counts by rule, severity breakdown) */
  stats: protectedProcedure
    .input(
      z
        .object({
          since: z.date().optional(),
          agentId: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const since = input?.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000)
      const conditions = [gte(guardrailLogs.createdAt, since)]
      if (input?.agentId) conditions.push(eq(guardrailLogs.agentId, input.agentId))

      const byRule = await ctx.db
        .select({
          ruleName: guardrailLogs.ruleName,
          count: sql<number>`count(*)`,
          blocked: sql<number>`count(*) filter (where not ${guardrailLogs.passed})`,
        })
        .from(guardrailLogs)
        .where(and(...conditions))
        .groupBy(guardrailLogs.ruleName)
        .orderBy(sql`count(*) desc`)

      return byRule
    }),
})
