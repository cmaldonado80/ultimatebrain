/**
 * Organization Router — Corporate structure, lifecycle, and org chart endpoints.
 *
 * The Brain is a corporation. Mini Brains are departments. Agents are employees.
 * This router exposes the organizational model for the dashboard.
 */

import { z } from 'zod'

import { protectedProcedure, router } from '../trpc'

export const orgRouter = router({
  // === Org Chart ===

  /** Full organizational chart: corporation → departments → employees → products */
  chart: protectedProcedure.query(async ({ ctx }) => {
    const { buildOrgChart } = await import('../services/orchestration/org-model')
    return buildOrgChart(ctx.db)
  }),

  /** Department profile with team roster, head, products */
  department: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { getDepartmentProfile } = await import('../services/orchestration/org-model')
      return getDepartmentProfile(ctx.db, input.entityId)
    }),

  /** Org context for a specific agent (what the agent sees about its position) */
  agentContext: protectedProcedure
    .input(z.object({ agentId: z.string().uuid(), workspaceId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const { buildOrgContext } = await import('../services/orchestration/mission-context')
      return buildOrgContext(ctx.db, input.agentId, input.workspaceId)
    }),

  // === Employee Lifecycle ===

  /** Onboard a new agent into the corporation */
  onboard: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        departmentEntityId: z.string().uuid(),
        role: z.enum(['primary', 'monitor', 'healer', 'specialist']),
        workspaceId: z.string().uuid(),
        type: z.string().optional(),
        soul: z.string().optional(),
        model: z.string().optional(),
        skills: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { onboardAgent } = await import('../services/orchestration/agent-lifecycle')
      return onboardAgent(ctx.db, input)
    }),

  /** Transfer agent to a different department */
  transfer: protectedProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        newDepartmentId: z.string().uuid(),
        role: z.enum(['primary', 'monitor', 'healer', 'specialist']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { assignToDepartment } = await import('../services/orchestration/agent-lifecycle')
      await assignToDepartment(ctx.db, input.agentId, input.newDepartmentId, input.role)
      return { transferred: true }
    }),

  /** Performance review for an agent */
  performanceReview: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { reviewPerformance } = await import('../services/orchestration/agent-lifecycle')
      return reviewPerformance(ctx.db, input.agentId)
    }),

  /** Terminate (fire) an agent */
  terminate: protectedProcedure
    .input(z.object({ agentId: z.string().uuid(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { terminateAgent } = await import('../services/orchestration/agent-lifecycle')
      await terminateAgent(ctx.db, input.agentId, input.reason)
      return { terminated: true }
    }),

  /** Reactivate a terminated agent */
  reactivate: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { reactivateAgent } = await import('../services/orchestration/agent-lifecycle')
      await reactivateAgent(ctx.db, input.agentId)
      return { reactivated: true }
    }),

  /** Get lifecycle event log */
  lifecycleLog: protectedProcedure
    .input(z.object({ agentId: z.string().uuid().optional() }).optional())
    .query(async ({ input }) => {
      const { getLifecycleLog } = await import('../services/orchestration/agent-lifecycle')
      return getLifecycleLog(input?.agentId)
    }),
})
