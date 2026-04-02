/**
 * Platform Router — cross-cutting platform services.
 *
 * Provides debate engine for multi-perspective reasoning, token ledger for
 * usage accounting, and entity management for platform-wide resources.
 */
import type { Database } from '@solarc/db'
import { brainEntities, brainEntityAgents } from '@solarc/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { DebateEngine, EntityManager, TokenLedgerService } from '../services/platform'
import { getHeartbeatStatus, runHeartbeatSweep } from '../services/platform/heartbeat'
import { getMiniBrainLiveStats } from '../services/platform/mini-brain-stats'
import { protectedProcedure, router } from '../trpc'

let debate: DebateEngine | null = null
let ledger: TokenLedgerService | null = null
let entities: EntityManager | null = null

function getDebate(db: Database) {
  return (debate ??= new DebateEngine(db))
}
function getLedger(db: Database) {
  return (ledger ??= new TokenLedgerService(db))
}
function getEntities(db: Database) {
  return (entities ??= new EntityManager(db))
}

export const platformRouter = router({
  // === Debate Engine ===

  createDebate: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid().optional(),
        rules: z
          .array(
            z.object({
              name: z.string(),
              description: z.string(),
              weight: z.number().min(0).max(1),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getDebate(ctx.db).createSession(input.projectId, input.rules)
    }),

  submitArgument: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        agentId: z.string().uuid(),
        text: z.string().min(1),
        parentId: z.string().uuid().optional(),
        isAxiom: z.boolean().optional(),
        validity: z.number().min(0).max(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getDebate(ctx.db).submitArgument(input.sessionId, input.agentId, input.text, {
        parentId: input.parentId,
        isAxiom: input.isAxiom,
        validity: input.validity,
      })
    }),

  addDebateEdge: protectedProcedure
    .input(
      z.object({
        fromNodeId: z.string().uuid(),
        toNodeId: z.string().uuid(),
        type: z.enum(['support', 'attack', 'rebuttal']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getDebate(ctx.db).addEdge(input.fromNodeId, input.toNodeId, input.type)
    }),

  scoreArgument: protectedProcedure
    .input(z.object({ nodeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getDebate(ctx.db).scoreArgument(input.nodeId)
    }),

  scoreDebateSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const scores = await getDebate(ctx.db).scoreSession(input.sessionId)
      return Object.fromEntries(scores)
    }),

  debateSession: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getDebate(ctx.db).getSession(input.id)
    }),

  completeDebate: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        winnerId: z.string().uuid().optional(),
        loserId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getDebate(ctx.db).completeSession(input.sessionId, input.winnerId, input.loserId)
    }),

  cancelDebate: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getDebate(ctx.db).cancelSession(input.sessionId)
    }),

  debateElo: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getDebate(ctx.db).getElo(input.agentId)
    }),

  debateLeaderboard: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getDebate(ctx.db).leaderboard(input?.limit)
    }),

  // === Token Ledger ===

  recordUsage: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid().optional(),
        agentId: z.string().uuid().optional(),
        model: z.string().optional(),
        provider: z.string().optional(),
        tokensIn: z.number().min(0),
        tokensOut: z.number().min(0),
        costUsd: z.number().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getLedger(ctx.db).record(input)
    }),

  checkBudget: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getLedger(ctx.db).checkBudget(input.entityId)
    }),

  setBudget: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        dailyLimitUsd: z.number().min(0).optional(),
        monthlyLimitUsd: z.number().min(0).optional(),
        alertThreshold: z.number().min(0).max(1).optional(),
        enforce: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { entityId, ...limits } = input
      return getLedger(ctx.db).setBudget(entityId, limits)
    }),

  usageSummary: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        since: z.date().optional(),
        until: z.date().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return getLedger(ctx.db).usageSummary(input.entityId, input.since, input.until)
    }),

  agentUsage: protectedProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        since: z.date().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return getLedger(ctx.db).agentUsage(input.agentId, input.since)
    }),

  dailyCostTrend: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        days: z.number().min(1).max(365).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return getLedger(ctx.db).dailyCostTrend(input.entityId, input.days)
    }),

  // === Brain Entities ===

  createEntity: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        domain: z.string().optional(),
        tier: z.enum(['brain', 'mini_brain', 'development']),
        parentId: z.string().uuid().optional(),
        enginesEnabled: z.array(z.string()).optional(),
        config: z.record(z.unknown()).optional(),
        endpoint: z.string().optional(),
        healthEndpoint: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).create(input)
    }),

  activateEntity: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).activate(input.id)
    }),

  suspendEntity: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).suspend(input.id)
    }),

  deleteEntity: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Delete agent links, then entity (children get parentId set to null via FK)
      await ctx.db.delete(brainEntityAgents).where(eq(brainEntityAgents.entityId, input.id))
      const [deleted] = await ctx.db
        .delete(brainEntities)
        .where(eq(brainEntities.id, input.id))
        .returning()
      if (!deleted) throw new Error('Entity not found')
      return { id: deleted.id }
    }),

  entity: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getEntities(ctx.db).get(input.id)
    }),

  entitiesByTier: protectedProcedure
    .input(z.object({ tier: z.enum(['brain', 'mini_brain', 'development']).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getEntities(ctx.db).listByTier(input?.tier)
    }),

  entityHierarchy: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getEntities(ctx.db).getHierarchy(input.id)
    }),

  assignEntityAgent: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        agentId: z.string().uuid(),
        role: z.enum(['primary', 'monitor', 'healer', 'specialist']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).assignAgent(input.entityId, input.agentId, input.role)
    }),

  removeEntityAgent: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        agentId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).removeAgent(input.entityId, input.agentId)
    }),

  entityAgents: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getEntities(ctx.db).getEntityAgents(input.entityId)
    }),

  entityHealth: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getEntities(ctx.db).getHealth(input.id)
    }),

  recordHealthCheck: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        status: z.enum(['active', 'suspended', 'degraded', 'provisioning']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).recordHealthCheck(input.entityId, input.status)
    }),

  // === Strategy Runs ===

  createStrategy: protectedProcedure
    .input(
      z.object({
        plan: z.string().min(1),
        workspaceId: z.string().uuid().optional(),
        agentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).createStrategyRun(input.plan, input.workspaceId, input.agentId)
    }),

  startStrategy: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        ticketIds: z.array(z.string().uuid()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).startStrategyRun(input.runId, input.ticketIds)
    }),

  completeStrategy: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).completeStrategyRun(input.runId)
    }),

  strategyRuns: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getEntities(ctx.db).getStrategyRuns(input?.workspaceId)
    }),

  /** Execute a strategy — decompose goal into tickets via AI */
  executeStrategy: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { GatewayRouter } = await import('../services/gateway')
      const gateway = new GatewayRouter(ctx.db)
      const { executeStrategy: exec } = await import('../services/platform/strategy-executor')
      return exec(ctx.db, gateway, input.runId)
    }),

  // === Cross-Workspace Routing ===

  addRoute: protectedProcedure
    .input(
      z.object({
        fromWorkspace: z.string().uuid(),
        toWorkspace: z.string().uuid(),
        rule: z.string().min(1),
        priority: z.number().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).addRoute(
        input.fromWorkspace,
        input.toWorkspace,
        input.rule,
        input.priority,
      )
    }),

  routes: protectedProcedure
    .input(z.object({ fromWorkspace: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getEntities(ctx.db).getRoutes(input?.fromWorkspace)
    }),

  deleteRoute: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).deleteRoute(input.id)
    }),

  // === Heartbeat ===

  heartbeatSweep: protectedProcedure.mutation(async ({ ctx }) => {
    const heartbeat = await runHeartbeatSweep(ctx.db)
    // After health check, dispatch pending work to idle agents
    const { dispatchPendingWork } = await import('../services/platform/work-dispatcher')
    const dispatch = await dispatchPendingWork(ctx.db)
    return { heartbeat, dispatch }
  }),

  /** Dispatch pending work without running heartbeat (manual trigger) */
  dispatchWork: protectedProcedure.mutation(async ({ ctx }) => {
    const { dispatchPendingWork } = await import('../services/platform/work-dispatcher')
    return dispatchPendingWork(ctx.db)
  }),

  heartbeatStatus: protectedProcedure.query(async ({ ctx }) => {
    return getHeartbeatStatus(ctx.db)
  }),

  // === Live Stats ===

  miniBrainLiveStats: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getMiniBrainLiveStats(ctx.db, input.entityId)
    }),

  // === Atomic Task Checkout (Paperclip-inspired) ===

  checkoutTask: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        agentId: z.string().uuid(),
        entityId: z.string().uuid().optional(),
        estimatedCostUsd: z.number().min(0).optional(),
        leaseSeconds: z.number().min(30).max(3600).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { atomicCheckout } = await import('../services/platform/atomic-checkout')
      return atomicCheckout(
        ctx.db,
        input.ticketId,
        input.agentId,
        input.entityId ?? null,
        input.estimatedCostUsd,
        input.leaseSeconds,
      )
    }),

  releaseTask: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        agentId: z.string().uuid(),
        status: z.enum(['done', 'backlog']).default('done'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { releaseCheckout } = await import('../services/platform/atomic-checkout')
      await releaseCheckout(ctx.db, input.ticketId, input.agentId, input.status)
      return { released: true }
    }),

  // === Goal Ancestry (Paperclip-inspired) ===

  goalAncestry: protectedProcedure
    .input(z.object({ ticketId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { resolveGoalAncestry } = await import('../services/orchestration/goal-ancestry')
      return resolveGoalAncestry(ctx.db, input.ticketId)
    }),

  // === Session Health & Rotation (Paperclip-inspired) ===

  sessionHealth: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { checkSessionHealth } = await import('../services/chat/session-rotation')
      return checkSessionHealth(ctx.db, input.sessionId)
    }),

  rotateSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { rotateSession } = await import('../services/chat/session-rotation')
      const { GatewayRouter } = await import('../services/gateway')
      const gw = new GatewayRouter(ctx.db)
      return rotateSession(ctx.db, input.sessionId, async (msgs) => {
        const result = await gw.chat({
          messages: [
            {
              role: 'system',
              content:
                'Summarize this conversation into a brief handoff note (3-5 sentences). Focus on: what was being worked on, key decisions made, and what comes next.',
            },
            ...msgs,
          ],
          maxTokens: 512,
          temperature: 0.1,
        })
        return result.content
      })
    }),

  // === Notifications ===

  notifications: protectedProcedure
    .input(
      z
        .object({
          unreadOnly: z.boolean().default(false),
          priority: z.enum(['info', 'warning', 'urgent', 'critical']).optional(),
          limit: z.number().min(1).max(100).default(50),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const { getNotifications } = await import('../services/platform/notification-service')
      return getNotifications(input)
    }),

  notificationUnreadCount: protectedProcedure.query(async () => {
    const { getUnreadCount } = await import('../services/platform/notification-service')
    return { count: getUnreadCount() }
  }),

  notificationMarkRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const { markRead } = await import('../services/platform/notification-service')
      markRead(input.id)
      return { read: true }
    }),

  notificationMarkAllRead: protectedProcedure.mutation(async () => {
    const { markAllRead } = await import('../services/platform/notification-service')
    markAllRead()
    return { done: true }
  }),

  // === Financial Reports ===

  financialReport: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const { generateFinancialReport } = await import('../services/platform/financial-reports')
      return generateFinancialReport(ctx.db, input?.days ?? 30)
    }),
})
