import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { evalDatasets, evalCases, evalRuns } from '@solarc/db'
import { eq, desc } from 'drizzle-orm'
import { EvalCaseInput, EvalScores } from '@solarc/engine-contracts'
import { EvalRunner } from '../services/evals'

let runnerInstance: EvalRunner | null = null

function getRunner(db: any): EvalRunner {
  if (!runnerInstance) {
    runnerInstance = new EvalRunner(db)
  }
  return runnerInstance
}

export const evalsRouter = router({
  // === Dataset CRUD ===

  datasets: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.evalDatasets.findMany()
  }),

  createDataset: publicProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [ds] = await ctx.db.insert(evalDatasets).values(input).returning()
      return ds
    }),

  // === Case CRUD ===

  cases: publicProcedure
    .input(z.object({ datasetId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.evalCases.findMany({ where: eq(evalCases.datasetId, input.datasetId) })
    }),

  addCase: publicProcedure
    .input(z.object({
      datasetId: z.string().uuid(),
      input: z.unknown(),
      expectedOutput: z.unknown().optional(),
      traceId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [c] = await ctx.db.insert(evalCases).values({
        datasetId: input.datasetId,
        input: input.input,
        expectedOutput: input.expectedOutput,
        traceId: input.traceId,
      }).returning()
      return c
    }),

  addCasesBatch: publicProcedure
    .input(z.object({
      datasetId: z.string().uuid(),
      cases: z.array(z.object({
        input: z.unknown(),
        expectedOutput: z.unknown().optional(),
        traceId: z.string().optional(),
      })).min(1).max(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      const rows = input.cases.map((c) => ({
        datasetId: input.datasetId,
        input: c.input,
        expectedOutput: c.expectedOutput,
        traceId: c.traceId,
      }))
      return ctx.db.insert(evalCases).values(rows).returning()
    }),

  // === Run Management ===

  runs: publicProcedure
    .input(z.object({ datasetId: z.string().uuid(), limit: z.number().min(1).max(100).optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.evalRuns.findMany({
        where: eq(evalRuns.datasetId, input.datasetId),
        orderBy: desc(evalRuns.createdAt),
        limit: input.limit ?? 20,
      })
    }),

  run: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.evalRuns.findFirst({ where: eq(evalRuns.id, input.id) })
    }),

  // === Scoring ===

  /** Score a single case (no persistence, just returns scores) */
  scoreCase: publicProcedure
    .input(z.object({
      input: z.unknown(),
      expectedOutput: z.unknown().optional(),
      actualOutput: z.unknown(),
      trace: z.object({
        toolCalls: z.array(z.object({
          name: z.string(),
          args: z.unknown(),
          result: z.unknown(),
        })).optional(),
        tokensUsed: z.number().optional(),
        costUsd: z.number().optional(),
        durationMs: z.number().optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const runner = getRunner(ctx.db)
      return runner.scoreCase(
        'ad-hoc',
        input.input,
        input.expectedOutput,
        input.actualOutput,
        input.trace,
      )
    }),

  /** Run eval on a dataset with pre-computed outputs */
  runDataset: publicProcedure
    .input(z.object({
      datasetId: z.string().uuid(),
      version: z.string().optional(),
      passThreshold: z.number().min(0).max(1).optional(),
      outputs: z.array(z.object({
        caseId: z.string().uuid(),
        output: z.unknown(),
        trace: z.object({
          toolCalls: z.array(z.object({
            name: z.string(),
            args: z.unknown(),
            result: z.unknown(),
          })).optional(),
          tokensUsed: z.number().optional(),
          costUsd: z.number().optional(),
          durationMs: z.number().optional(),
        }).optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const runner = getRunner(ctx.db)
      const outputMap = new Map(
        input.outputs.map((o) => [o.caseId, { output: o.output, trace: o.trace }]),
      )

      return runner.runDataset(input.datasetId, {
        version: input.version,
        passThreshold: input.passThreshold,
        outputs: outputMap,
      })
    }),

  /** Compare two runs */
  compareRuns: publicProcedure
    .input(z.object({
      runIdA: z.string().uuid(),
      runIdB: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      const runner = getRunner(ctx.db)
      return runner.compareRuns(input.runIdA, input.runIdB)
    }),
})
