import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { traces } from '@solarc/db'
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'

export const tracesRouter = router({
  /** Get spans for a specific trace */
  byTraceId: publicProcedure
    .input(z.object({ traceId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(traces)
        .where(eq(traces.traceId, input.traceId))
        .orderBy(traces.createdAt)
    }),

  /** Get recent traces (root spans only) */
  recent: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(500).optional(),
      service: z.string().optional(),
      status: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [sql`${traces.parentSpanId} IS NULL`]
      if (input?.service) conditions.push(eq(traces.service, input.service))
      if (input?.status) conditions.push(eq(traces.status, input.status))

      return ctx.db
        .select()
        .from(traces)
        .where(and(...conditions))
        .orderBy(desc(traces.createdAt))
        .limit(input?.limit ?? 50)
    }),

  /** Get traces for an agent */
  byAgent: publicProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      limit: z.number().min(1).max(500).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(traces)
        .where(eq(traces.agentId, input.agentId))
        .orderBy(desc(traces.createdAt))
        .limit(input?.limit ?? 100)
    }),

  /** Get traces for a ticket */
  byTicket: publicProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      limit: z.number().min(1).max(500).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(traces)
        .where(eq(traces.ticketId, input.ticketId))
        .orderBy(desc(traces.createdAt))
        .limit(input?.limit ?? 100)
    }),

  /** Get latency percentiles for a service/operation */
  latencyStats: publicProcedure
    .input(z.object({
      service: z.string().optional(),
      operation: z.string().optional(),
      since: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const since = input?.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000)
      const conditions = [gte(traces.createdAt, since)]
      if (input?.service) conditions.push(eq(traces.service, input.service))
      if (input?.operation) conditions.push(eq(traces.operation, input.operation))

      const [stats] = await ctx.db
        .select({
          count: sql<number>`count(*)`,
          avgMs: sql<number>`avg(${traces.durationMs})`,
          p50: sql<number>`percentile_cont(0.5) within group (order by ${traces.durationMs})`,
          p95: sql<number>`percentile_cont(0.95) within group (order by ${traces.durationMs})`,
          p99: sql<number>`percentile_cont(0.99) within group (order by ${traces.durationMs})`,
          errorRate: sql<number>`avg(case when ${traces.status} = 'error' then 1.0 else 0.0 end)`,
        })
        .from(traces)
        .where(and(...conditions))

      return {
        count: Number(stats.count),
        avgMs: Math.round(Number(stats.avgMs)),
        p50Ms: Math.round(Number(stats.p50)),
        p95Ms: Math.round(Number(stats.p95)),
        p99Ms: Math.round(Number(stats.p99)),
        errorRate: Number(stats.errorRate),
      }
    }),
})
