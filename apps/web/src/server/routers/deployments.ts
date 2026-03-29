/**
 * Deployments Router — operator control plane for deployment workflows.
 *
 * Manages the lifecycle: create → provision → configure → deploy → register → verify → activate.
 */
import { deploymentWorkflows } from '@solarc/db'
import { TRPCError } from '@trpc/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import {
  advanceWorkflow,
  cancelWorkflow,
  confirmManualStep,
  getWorkflowWithEntity,
  retryStep,
} from '../services/platform/deployment-workflow'
import { assertPermission } from '../services/platform/permissions'
import { protectedProcedure, router } from '../trpc'

export const deploymentsRouter = router({
  /** List deployment workflows with optional status filter */
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.session.organizationId
      const conditions = [eq(deploymentWorkflows.organizationId, orgId)]
      if (input.status) conditions.push(eq(deploymentWorkflows.status, input.status))

      const workflows = await ctx.db.query.deploymentWorkflows.findMany({
        where: conditions.length > 1 ? and(...conditions) : conditions[0],
        orderBy: desc(deploymentWorkflows.createdAt),
        limit: input.limit,
      })

      // Enrich with entity names
      const enriched = await Promise.all(
        workflows.map((wf) => getWorkflowWithEntity(ctx.db, wf.id)),
      )

      return enriched.filter((w): w is NonNullable<typeof w> => w !== null)
    }),

  /** Get single workflow with entity info and progress */
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const wf = await getWorkflowWithEntity(ctx.db, input.id)
      if (!wf) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workflow not found' })
      return wf
    }),

  /** Advance to the next auto-executable step */
  advance: protectedProcedure
    .input(z.object({ workflowId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      const result = await advanceWorkflow(ctx.db, input.workflowId, ctx.session.userId)
      return result
    }),

  /** Confirm a manual step (operator provides deploy result / endpoint) */
  confirmStep: protectedProcedure
    .input(
      z.object({
        workflowId: z.string().uuid(),
        stepName: z.string(),
        endpoint: z.string().optional(),
        healthEndpoint: z.string().optional(),
        deploymentRef: z.string().optional(),
        deploymentProvider: z.string().optional(),
        version: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      const { workflowId, stepName, ...data } = input
      return confirmManualStep(ctx.db, workflowId, stepName, data, ctx.session.userId)
    }),

  /** Retry a failed step */
  retry: protectedProcedure
    .input(
      z.object({
        workflowId: z.string().uuid(),
        stepName: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      return retryStep(ctx.db, input.workflowId, input.stepName, ctx.session.userId)
    }),

  /** Cancel a workflow */
  cancel: protectedProcedure
    .input(z.object({ workflowId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      await cancelWorkflow(ctx.db, input.workflowId, ctx.session.userId)
      return { cancelled: true }
    }),
})
