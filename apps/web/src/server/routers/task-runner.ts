/**
 * Task Runner Router — tiered execution mode routing.
 *
 * Routes tasks through execution pipelines (instant, standard, deep) based on
 * complexity and resource requirements via the ModeRouter service.
 */
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import type { Database } from '@solarc/db'
import { ModeRouter } from '../services/task-runner/mode-router'

let _modeRouter: ModeRouter | null = null
function getModeRouter(db: Database) { return _modeRouter ??= new ModeRouter(db) }

const planStepSchema = z.object({
  index: z.number().int().min(0),
  title: z.string(),
  description: z.string(),
  estimatedMs: z.number().optional(),
  toolsRequired: z.array(z.string()).optional(),
  status: z.enum(['pending', 'in_progress', 'done', 'skipped']),
})

const executionPlanSchema = z.object({
  ticketId: z.string().uuid(),
  steps: z.array(planStepSchema),
  totalEstimatedMs: z.number(),
  generatedAt: z.coerce.date(),
  approvedAt: z.coerce.date().optional(),
  approvedBy: z.string().optional(),
})

const modeEnum = z.enum(['quick', 'autonomous', 'deep_work'])

export const taskRunnerRouter = router({
  /** Auto-detect the best execution mode for a ticket */
  detectMode: protectedProcedure
    .input(z.object({ ticketId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const router = getModeRouter(ctx.db)
      const mode = await router.detectMode(input.ticketId)
      return { mode }
    }),

  /** Manually set execution mode on a ticket */
  setMode: protectedProcedure
    .input(z.object({ ticketId: z.string().uuid(), mode: modeEnum }))
    .mutation(async ({ ctx, input }) => {
      const router = getModeRouter(ctx.db)
      await router.setMode(input.ticketId, input.mode)
      return { success: true }
    }),

  /** Route a ticket to the correct pipeline (auto-detects mode unless forced) */
  route: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        prompt: z.string(),
        forceMode: modeEnum.optional(),
        agentId: z.string().uuid().optional(),
        traceId: z.string().optional(),
        approvedPlan: executionPlanSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const router = getModeRouter(ctx.db)
      return router.route(input.ticketId, input.prompt, {
        forceMode: input.forceMode,
        agentId: input.agentId,
        traceId: input.traceId,
        approvedPlan: input.approvedPlan
          ? {
              ...input.approvedPlan,
              generatedAt: new Date(input.approvedPlan.generatedAt),
              approvedAt: input.approvedPlan.approvedAt
                ? new Date(input.approvedPlan.approvedAt)
                : undefined,
            }
          : undefined,
      })
    }),

  /** Execute quick mode directly */
  executeQuick: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        prompt: z.string(),
        agentId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const router = getModeRouter(ctx.db)
      return router.executeQuick(input.ticketId, input.prompt, { agentId: input.agentId })
    }),

  /** Execute autonomous mode directly */
  executeAutonomous: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        agentId: z.string().uuid().optional(),
        traceId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const router = getModeRouter(ctx.db)
      return router.executeAutonomous(input.ticketId, {
        agentId: input.agentId,
        traceId: input.traceId,
      })
    }),

  /** Start deep work — generates plan and awaits approval */
  startDeepWork: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        agentId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const router = getModeRouter(ctx.db)
      return router.startDeepWork(input.ticketId, { agentId: input.agentId })
    }),

  /** Execute an approved deep work plan */
  executeDeepWork: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        plan: executionPlanSchema,
        agentId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const router = getModeRouter(ctx.db)
      return router.executeDeepWork(
        input.ticketId,
        {
          ...input.plan,
          generatedAt: new Date(input.plan.generatedAt),
          approvedAt: input.plan.approvedAt ? new Date(input.plan.approvedAt) : undefined,
        },
        { agentId: input.agentId }
      )
    }),
})
