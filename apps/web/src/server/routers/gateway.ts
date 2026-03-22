import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { gatewayMetrics } from '@solarc/db'

export const gatewayRouter = router({
  metrics: publicProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.gatewayMetrics.findMany({
        limit: input?.limit ?? 100,
        orderBy: (m, { desc }) => [desc(m.createdAt)],
      })
    }),
  record: publicProcedure
    .input(z.object({
      provider: z.string(),
      model: z.string(),
      agentId: z.string().uuid().optional(),
      ticketId: z.string().uuid().optional(),
      tokensIn: z.number().optional(),
      tokensOut: z.number().optional(),
      latencyMs: z.number().optional(),
      costUsd: z.number().optional(),
      cached: z.boolean().optional(),
      error: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [metric] = await ctx.db.insert(gatewayMetrics).values(input).returning()
      return metric
    }),
})
