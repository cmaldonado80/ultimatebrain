import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { evalDatasets, evalCases, evalRuns } from '@solarc/db'
import type { Database } from '@solarc/db'
import { eq, desc } from 'drizzle-orm'
import { EvalRunner, DatasetBuilder, DriftDetector } from '../services/evals'
import type { ScorerInput } from '../services/evals/scorers'

let runnerInstance: EvalRunner | null = null

function getRunner(db: Database): EvalRunner {
  if (!runnerInstance) {
    runnerInstance = new EvalRunner(db)
  }
  return runnerInstance
}

export const evalsRouter = router({
  // === Dataset CRUD ===

  datasets: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.evalDatasets.findMany()
  }),

  createDataset: protectedProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [ds] = await ctx.db.insert(evalDatasets).values(input).returning()
      return ds
    }),

  // === Case CRUD ===

  cases: protectedProcedure
    .input(z.object({ datasetId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.evalCases.findMany({ where: eq(evalCases.datasetId, input.datasetId) })
    }),

  addCase: protectedProcedure
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

  addCasesBatch: protectedProcedure
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

  runs: protectedProcedure
    .input(z.object({ datasetId: z.string().uuid(), limit: z.number().min(1).max(100).optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.evalRuns.findMany({
        where: eq(evalRuns.datasetId, input.datasetId),
        orderBy: desc(evalRuns.createdAt),
        limit: input.limit ?? 20,
      })
    }),

  run: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.evalRuns.findFirst({ where: eq(evalRuns.id, input.id) })
    }),

  // === Scoring ===

  /** Score a single case (no persistence, just returns scores) */
  scoreCase: protectedProcedure
    .input(z.object({
      input: z.unknown(),
      expectedOutput: z.unknown().optional(),
      actualOutput: z.unknown(),
      trace: z.object({
        toolCalls: z.array(z.object({
          name: z.string(),
          args: z.any(),
          result: z.any(),
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
        input.trace as ScorerInput['trace'],
      )
    }),

  /** Run eval on a dataset with pre-computed outputs */
  runDataset: protectedProcedure
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
        input.outputs.map((o) => [o.caseId, { output: o.output, trace: o.trace as ScorerInput['trace'] }]),
      )

      return runner.runDataset(input.datasetId, {
        version: input.version,
        passThreshold: input.passThreshold,
        outputs: outputMap as Map<string, { output: unknown; trace?: ScorerInput['trace'] }>,
      })
    }),

  /** Compare two runs */
  compareRuns: protectedProcedure
    .input(z.object({
      runIdA: z.string().uuid(),
      runIdB: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      const runner = getRunner(ctx.db)
      return runner.compareRuns(input.runIdA, input.runIdB)
    }),

  // === Dataset Builder (Phase 7) ===

  /** List all datasets with case counts */
  datasetsWithCounts: protectedProcedure.query(async ({ ctx }) => {
    const builder = new DatasetBuilder(ctx.db)
    return builder.listDatasets()
  }),

  /** Save a production trace as an eval case */
  saveFromTrace: protectedProcedure
    .input(z.object({
      traceId: z.string(),
      datasetName: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const builder = new DatasetBuilder(ctx.db)
      const caseId = await builder.saveFromTrace(input.traceId, input.datasetName)
      return { caseId }
    }),

  /** Auto-generate cases from failed tickets */
  autoGenerateFromFailures: protectedProcedure
    .input(z.object({
      datasetName: z.string().optional(),
      limit: z.number().min(1).max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const builder = new DatasetBuilder(ctx.db)
      const added = await builder.autoGenerateFromFailedTickets(input.datasetName, input.limit)
      return { added }
    }),

  /** Auto-generate cases from successful traces */
  autoGenerateFromSuccesses: protectedProcedure
    .input(z.object({
      datasetName: z.string().optional(),
      limit: z.number().min(1).max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const builder = new DatasetBuilder(ctx.db)
      const added = await builder.autoGenerateFromSuccessfulTraces(input.datasetName, input.limit)
      return { added }
    }),

  // === Drift Detector (Phase 7) ===

  /** Check a dataset for score regression vs. previous run */
  detectDrift: protectedProcedure
    .input(z.object({
      datasetId: z.string().uuid(),
      threshold: z.number().min(0).max(1).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const detector = new DriftDetector(ctx.db, input.threshold)
      return detector.detectForDataset(input.datasetId)
    }),

  /** Check all datasets for regression */
  detectDriftAll: protectedProcedure.query(async ({ ctx }) => {
    const detector = new DriftDetector(ctx.db)
    return detector.detectAll()
  }),

  /** Get score trend history for a dataset */
  scoreHistory: protectedProcedure
    .input(z.object({
      datasetId: z.string().uuid(),
      limit: z.number().min(1).max(100).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const detector = new DriftDetector(ctx.db)
      return detector.getHistory(input.datasetId, input.limit)
    }),
})
