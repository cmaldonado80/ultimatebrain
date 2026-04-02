/**
 * Evolution Router — agent self-improvement, soul versioning, cross-agent learning.
 */
import { agentSoulVersions, evolutionCycles, soulFragments } from '@solarc/db'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { protectedProcedure, router } from '../trpc'

export const evolutionRouter = router({
  /** Get evolution cycles for an agent */
  cycles: protectedProcedure
    .input(z.object({ agentId: z.string().uuid(), limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(evolutionCycles)
        .where(eq(evolutionCycles.agentId, input.agentId))
        .orderBy(desc(evolutionCycles.cycleNumber))
        .limit(input.limit)
    }),

  /** Get soul versions for an agent */
  soulVersions: protectedProcedure
    .input(z.object({ agentId: z.string().uuid(), limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(agentSoulVersions)
        .where(eq(agentSoulVersions.agentId, input.agentId))
        .orderBy(desc(agentSoulVersions.version))
        .limit(input.limit)
    }),

  /** Trigger evolution for a specific agent */
  evolve: protectedProcedure
    .input(z.object({ agentId: z.string().uuid(), windowDays: z.number().default(7) }))
    .mutation(async ({ ctx, input }) => {
      const { evolveAgent } = await import('../services/evolution')
      return evolveAgent(ctx.db, input.agentId, { windowDays: input.windowDays })
    }),

  /** Rollback to a previous soul version */
  rollback: protectedProcedure
    .input(z.object({ agentId: z.string().uuid(), version: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { rollbackToVersion } = await import('../services/evolution')
      return rollbackToVersion(ctx.db, input.agentId, input.version)
    }),

  /** Analyze agent performance */
  analyze: protectedProcedure
    .input(z.object({ agentId: z.string().uuid(), windowDays: z.number().default(7) }))
    .query(async ({ ctx, input }) => {
      const { analyzeAgentPerformance } = await import('../services/evolution')
      return analyzeAgentPerformance(ctx.db, input.agentId, input.windowDays)
    }),

  /** Run auto-evolution across all agents */
  autoEvolveAll: protectedProcedure
    .input(
      z
        .object({ scoreThreshold: z.number().default(0.6), maxAgents: z.number().default(5) })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const { runAutoEvolution } = await import('../services/evolution')
      return runAutoEvolution(ctx.db, {
        scoreThreshold: input?.scoreThreshold,
        maxAgentsPerRun: input?.maxAgents,
      })
    }),

  /** Get soul fragments (cross-agent learning) */
  fragments: protectedProcedure
    .input(
      z
        .object({ workspaceId: z.string().uuid().optional(), limit: z.number().default(20) })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input?.workspaceId) conditions.push(eq(soulFragments.workspaceId, input.workspaceId))
      return ctx.db.query.soulFragments.findMany({
        where: conditions.length > 0 ? conditions[0] : undefined,
        orderBy: desc(soulFragments.adoptedByCount),
        limit: input?.limit ?? 20,
      })
    }),

  /** Run cross-agent learning cycle */
  crossLearn: protectedProcedure.mutation(async ({ ctx }) => {
    const { GatewayRouter } = await import('../services/gateway')
    const gw = new GatewayRouter(ctx.db)
    const { runCrossAgentLearning } = await import('../services/evolution')
    return runCrossAgentLearning(ctx.db, gw)
  }),

  /** Get agent capability profile */
  capabilities: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { profileAgentCapabilities } = await import('../services/intelligence/adaptive-router')
      return profileAgentCapabilities(ctx.db, input.agentId)
    }),

  /** Get model recommendation for agent */
  recommendModel: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { recommendModel } = await import('../services/intelligence/adaptive-router')
      return recommendModel(ctx.db, input.agentId)
    }),

  /** Get tool analytics */
  toolAnalytics: protectedProcedure
    .input(z.object({ workspaceId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const { getToolAnalytics } = await import('../services/chat/tool-executor')
      return getToolAnalytics(input?.workspaceId)
    }),

  /** Memory intelligence stats */
  memoryStats: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { memories } = await import('@solarc/db')
      const { sql } = await import('drizzle-orm')

      const stats = await ctx.db
        .select({
          factType: memories.factType,
          count: sql<number>`count(*)::int`,
          avgProofCount: sql<number>`avg(${memories.proofCount})::float`,
          maxProofCount: sql<number>`max(${memories.proofCount})::int`,
        })
        .from(memories)
        .where(input?.workspaceId ? eq(memories.workspaceId, input.workspaceId) : undefined)
        .groupBy(memories.factType)

      return {
        byFactType: stats,
        total: stats.reduce((sum, s) => sum + s.count, 0),
      }
    }),

  /** Consolidate memories */
  consolidate: protectedProcedure
    .input(
      z
        .object({ workspaceId: z.string().uuid().optional(), limit: z.number().default(50) })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const { GatewayRouter } = await import('../services/gateway')
      const gw = new GatewayRouter(ctx.db)
      const { consolidateMemories } = await import('../services/memory/memory-intelligence')
      return consolidateMemories(ctx.db, gw, {
        workspaceId: input?.workspaceId,
        limit: input?.limit,
      })
    }),

  /** Session summary */
  sessionSummary: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { GatewayRouter } = await import('../services/gateway')
      const gw = new GatewayRouter(ctx.db)
      const { generateSessionSummary } =
        await import('../services/intelligence/session-intelligence')
      return generateSessionSummary(ctx.db, gw, input.sessionId)
    }),

  /** Generate cross-tier learning digest */
  crossTierDigest: protectedProcedure.mutation(async ({ ctx }) => {
    const { GatewayRouter } = await import('../services/gateway')
    const gw = new GatewayRouter(ctx.db)
    const { generateCrossTierDigest, promoteFragmentsToGlobal, propagateHighProofObservations } =
      await import('../services/intelligence/cross-tier-digest')

    const promoted = await promoteFragmentsToGlobal(ctx.db)
    const propagated = await propagateHighProofObservations(ctx.db)
    const digest = await generateCrossTierDigest(ctx.db, gw)

    return {
      fragmentsPromotedToGlobal: promoted,
      observationsPropagated: propagated,
      digest,
    }
  }),

  /** Get execution trajectory for a chat run */
  trajectory: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { getTrajectory } = await import('../services/intelligence/trajectory-recorder')
      return getTrajectory(ctx.db, input.runId)
    }),

  /** Analyze an execution trajectory for patterns and failures */
  trajectoryAnalysis: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { getTrajectory, analyzeTrajectory } =
        await import('../services/intelligence/trajectory-recorder')
      const trajectory = await getTrajectory(ctx.db, input.runId)
      if (!trajectory) return null
      return analyzeTrajectory(trajectory)
    }),

  /** Compare two trajectories (original vs retry) */
  trajectoryCompare: protectedProcedure
    .input(
      z.object({
        originalRunId: z.string().uuid(),
        retryRunId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { getTrajectory, compareTrajectories } =
        await import('../services/intelligence/trajectory-recorder')
      const original = await getTrajectory(ctx.db, input.originalRunId)
      const retry = await getTrajectory(ctx.db, input.retryRunId)
      if (!original || !retry) return null
      return compareTrajectories(original, retry)
    }),

  /** Get diagnostic guardrail summary for recent violations */
  guardrailDiagnostic: protectedProcedure.query(async ({ ctx }) => {
    const { guardrailLogs } = await import('@solarc/db')
    const { desc: descOrd } = await import('drizzle-orm')
    const recentLogs = await ctx.db
      .select()
      .from(guardrailLogs)
      .orderBy(descOrd(guardrailLogs.createdAt))
      .limit(100)

    const { diagnoseViolations } = await import('../services/guardrails/rules')
    const violations = recentLogs
      .filter((log) => !log.passed)
      .map((log) => ({
        rule: log.ruleName ?? 'unknown',
        detail: log.violationDetail ?? '',
        severity: 'medium' as 'low' | 'medium' | 'high' | 'critical',
      }))

    return diagnoseViolations(violations)
  }),

  /** Recall relevant skills for a given context */
  skillRecall: protectedProcedure
    .input(
      z.object({
        message: z.string(),
        toolHistory: z.array(z.object({ toolName: z.string() })).default([]),
        workspaceId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { extractContextSignature, recallRelevantSkills } =
        await import('../services/intelligence/skill-recall')
      const context = extractContextSignature(input.message, input.toolHistory)
      return recallRelevantSkills(ctx.db, context, input.workspaceId)
    }),
})
