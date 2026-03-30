/**
 * Builder Router — Meta-Builder for domain product analysis and planning.
 *
 * Inspects system state, detects product gaps, generates blueprints
 * and prioritized roadmaps for any domain.
 */
import { z } from 'zod'

import { generateBlueprint } from '../services/builder/blueprint-generator'
import { executeAction, generateExecutionPlan } from '../services/builder/execution-engine'
import { detectGaps } from '../services/builder/gap-detector'
import { inspectDomainState } from '../services/builder/system-inspector'
import { auditEvent } from '../services/platform/audit'
import { assertPermission } from '../services/platform/permissions'
import { protectedProcedure, router } from '../trpc'

export const builderRouter = router({
  /** Generate a product blueprint for a domain */
  generateBlueprint: protectedProcedure
    .input(z.object({ domain: z.string().min(1), objective: z.string().optional() }))
    .query(({ input }) => {
      return generateBlueprint(input.domain, input.objective)
    }),

  /** Inspect current system state for a domain */
  inspectDomain: protectedProcedure
    .input(z.object({ domain: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return inspectDomainState(ctx.db, input.domain)
    }),

  /** Get gap report comparing current state to ideal product */
  getGapReport: protectedProcedure
    .input(z.object({ domain: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const state = await inspectDomainState(ctx.db, input.domain)
      return detectGaps(state)
    }),

  /** Get prioritized roadmap (extracted from gap report) */
  getRoadmap: protectedProcedure
    .input(z.object({ domain: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const state = await inspectDomainState(ctx.db, input.domain)
      const gaps = detectGaps(state)
      return {
        domain: input.domain,
        completionPercent: gaps.completionPercent,
        steps: gaps.nextSteps,
      }
    }),

  /** Generate execution plan with concrete typed actions */
  getExecutionPlan: protectedProcedure
    .input(z.object({ domain: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const state = await inspectDomainState(ctx.db, input.domain)
      const gaps = detectGaps(state)
      const blueprint = generateBlueprint(input.domain)
      return generateExecutionPlan(input.domain, blueprint, gaps)
    }),

  /** Execute a single action from an execution plan (admin only) */
  executeStep: protectedProcedure
    .input(
      z.object({
        domain: z.string().min(1),
        action: z.object({
          id: z.string(),
          type: z.string(),
          layer: z.string(),
          description: z.string(),
          payload: z.record(z.unknown()),
          status: z.string(),
          autoExecutable: z.boolean(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')

      const result = await executeAction(ctx.db, {
        id: input.action.id,
        type: input.action.type as Parameters<typeof executeAction>[1]['type'],
        layer: input.action.layer,
        description: input.action.description,
        payload: input.action.payload,
        status: 'pending',
        autoExecutable: input.action.autoExecutable,
      })

      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'builder_execute_step',
        'builder',
        input.domain,
        { actionType: input.action.type, layer: input.action.layer, status: result.status },
      )

      return result
    }),
})
