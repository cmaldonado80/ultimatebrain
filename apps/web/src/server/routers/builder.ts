/**
 * Builder Router — Meta-Builder for domain product analysis and planning.
 *
 * Inspects system state, detects product gaps, generates blueprints
 * and prioritized roadmaps for any domain.
 */
import { improvementProposals, productEvents } from '@solarc/db'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { generateBlueprint } from '../services/builder/blueprint-generator'
import { executeAction, generateExecutionPlan } from '../services/builder/execution-engine'
import { detectGaps } from '../services/builder/gap-detector'
import { generateProposals, type ProductInsights } from '../services/builder/proposal-generator'
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

  // ── Product Usage Tracking ──────────────────────────────────────────

  /** Track a product usage event */
  trackProductEvent: protectedProcedure
    .input(
      z.object({
        domain: z.string().min(1),
        resourceType: z.string().optional(),
        action: z.string().min(1),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(productEvents).values({
        organizationId: ctx.session.organizationId || null,
        userId: ctx.session.userId,
        domain: input.domain,
        resourceType: input.resourceType,
        action: input.action,
        metadata: input.metadata,
      })
      return { tracked: true }
    }),

  /** Get aggregated product usage insights for a domain */
  getProductInsights: protectedProcedure
    .input(z.object({ domain: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const events = await ctx.db.query.productEvents.findMany({
        where: eq(productEvents.domain, input.domain),
        orderBy: desc(productEvents.createdAt),
        limit: 1000,
      })

      const actionCounts: Record<string, number> = {}
      const resourceCounts: Record<string, number> = {}
      const userSet = new Set<string>()

      for (const e of events) {
        actionCounts[e.action] = (actionCounts[e.action] ?? 0) + 1
        if (e.resourceType) {
          resourceCounts[e.resourceType] = (resourceCounts[e.resourceType] ?? 0) + 1
        }
        if (e.userId) userSet.add(e.userId)
      }

      const shareCount = (actionCounts['share'] ?? 0) + (actionCounts['copy_link'] ?? 0)
      const shareRate = events.length > 0 ? shareCount / events.length : 0

      const topResources = Object.entries(resourceCounts)
        .map(([resourceType, count]) => ({ resourceType, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      return {
        domain: input.domain,
        totalEvents: events.length,
        actionCounts,
        topResources,
        shareRate: Math.round(shareRate * 100) / 100,
        dailyActiveCount: userSet.size,
      } satisfies ProductInsights
    }),

  // ── Improvement Proposals ───────────────────────────────────────────

  /** Generate and return improvement proposals for a domain */
  getProposals: protectedProcedure
    .input(z.object({ domain: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      // Check for existing pending proposals
      const existing = await ctx.db.query.improvementProposals.findMany({
        where: and(
          eq(improvementProposals.domain, input.domain),
          eq(improvementProposals.status, 'pending'),
        ),
        orderBy: desc(improvementProposals.proposedAt),
        limit: 20,
      })

      if (existing.length > 0) return existing

      // Generate new proposals from gaps + usage
      const state = await inspectDomainState(ctx.db, input.domain)
      const gaps = detectGaps(state)

      let insights: ProductInsights | null = null
      try {
        const events = await ctx.db.query.productEvents.findMany({
          where: eq(productEvents.domain, input.domain),
          limit: 500,
        })
        if (events.length > 0) {
          const ac: Record<string, number> = {}
          const rc: Record<string, number> = {}
          const us = new Set<string>()
          for (const e of events) {
            ac[e.action] = (ac[e.action] ?? 0) + 1
            if (e.resourceType) rc[e.resourceType] = (rc[e.resourceType] ?? 0) + 1
            if (e.userId) us.add(e.userId)
          }
          const sc = (ac['share'] ?? 0) + (ac['copy_link'] ?? 0)
          insights = {
            domain: input.domain,
            totalEvents: events.length,
            actionCounts: ac,
            topResources: Object.entries(rc).map(([r, c]) => ({ resourceType: r, count: c })),
            shareRate: events.length > 0 ? sc / events.length : 0,
            dailyActiveCount: us.size,
          }
        }
      } catch {
        // Usage data unavailable
      }

      const proposals = generateProposals(input.domain, gaps, insights)

      // Persist proposals
      for (const p of proposals) {
        await ctx.db.insert(improvementProposals).values({
          domain: p.domain,
          organizationId: ctx.session.organizationId || null,
          layer: p.layer,
          title: p.title,
          description: p.description,
          expectedImpact: p.expectedImpact,
          confidence: p.confidence,
          status: 'pending',
        })
      }

      return ctx.db.query.improvementProposals.findMany({
        where: and(
          eq(improvementProposals.domain, input.domain),
          eq(improvementProposals.status, 'pending'),
        ),
        orderBy: desc(improvementProposals.proposedAt),
        limit: 20,
      })
    }),

  /** Approve a proposal */
  approveProposal: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      await ctx.db
        .update(improvementProposals)
        .set({ status: 'approved', resolvedAt: new Date(), resolvedBy: ctx.session.userId })
        .where(eq(improvementProposals.id, input.id))
      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'approve_proposal',
        'improvement_proposal',
        input.id,
      )
      return { approved: true }
    }),

  /** Reject a proposal */
  rejectProposal: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      await ctx.db
        .update(improvementProposals)
        .set({ status: 'rejected', resolvedAt: new Date(), resolvedBy: ctx.session.userId })
        .where(eq(improvementProposals.id, input.id))
      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'reject_proposal',
        'improvement_proposal',
        input.id,
      )
      return { rejected: true }
    }),

  // ── Project Builder ──────────────────────────────────────────────────

  /** Decompose a brief into a project plan (preview before building) */
  decomposeProject: protectedProcedure
    .input(
      z.object({
        brief: z.string().min(5).max(2000),
        projectType: z.enum(['landing-page', 'api', 'full-stack', 'general']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { decomposeProject } = await import('../services/orchestration/project-orchestrator')
      return decomposeProject(ctx.db, input.brief, input.projectType)
    }),

  /** Create a project from a brief — decompose + materialize + start execution */
  createProject: protectedProcedure
    .input(
      z.object({
        brief: z.string().min(5).max(2000),
        projectType: z.enum(['landing-page', 'api', 'full-stack', 'general']).optional(),
        workspaceId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { decomposeProject, materializeProject, executeNextWave } =
        await import('../services/orchestration/project-orchestrator')
      const plan = await decomposeProject(ctx.db, input.brief, input.projectType)
      const { projectId, ticketIds } = await materializeProject(ctx.db, plan, {
        workspaceId: input.workspaceId,
      })
      // Start first wave
      const wave = await executeNextWave(ctx.db, projectId)
      return { projectId, ticketIds, plan, wave }
    }),

  /** Get project status with tasks + artifacts */
  getProjectStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { getProjectStatus } = await import('../services/orchestration/project-orchestrator')
      return getProjectStatus(ctx.db, input.id)
    }),

  /** List all builder projects */
  listBuilderProjects: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.projects.findMany({
        orderBy: (p, { desc }) => [desc(p.createdAt)],
        limit: input?.limit ?? 20,
      })
      return rows
    }),

  /** Execute next wave of ready tickets for a project */
  executeNextWave: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { executeNextWave } = await import('../services/orchestration/project-orchestrator')
      return executeNextWave(ctx.db, input.projectId)
    }),

  /** Request a revision/change to a project */
  requestProjectChange: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        description: z.string().min(5).max(1000),
        targetTicketId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { requestChange } = await import('../services/orchestration/project-orchestrator')
      const ticketId = await requestChange(
        ctx.db,
        input.projectId,
        input.description,
        input.targetTicketId,
      )
      return { ticketId }
    }),

  /** Delete a builder project and all its tickets */
  deleteBuilderProject: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { deleteProject } = await import('../services/orchestration/project-orchestrator')
      return deleteProject(ctx.db, input.id)
    }),

  /** Retry a failed task */
  retryTask: protectedProcedure
    .input(z.object({ ticketId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tickets } = await import('@solarc/db')
      const { eq } = await import('drizzle-orm')
      await ctx.db
        .update(tickets)
        .set({ status: 'queued', result: null })
        .where(eq(tickets.id, input.ticketId))
      return { queued: true }
    }),
})
