import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { evalDatasets, evalCases, evalRuns } from '@solarc/db'
import { eq } from 'drizzle-orm'

export const evalsRouter = router({
  datasets: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.evalDatasets.findMany()
  }),
  cases: publicProcedure
    .input(z.object({ datasetId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.evalCases.findMany({ where: eq(evalCases.datasetId, input.datasetId) })
    }),
  runs: publicProcedure
    .input(z.object({ datasetId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.evalRuns.findMany({ where: eq(evalRuns.datasetId, input.datasetId) })
    }),
  createDataset: publicProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [ds] = await ctx.db.insert(evalDatasets).values(input).returning()
      return ds
    }),
})
