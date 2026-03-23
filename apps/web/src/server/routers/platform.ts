import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { DebateEngine, TokenLedgerService, EntityManager } from '../services/platform'

let debate: DebateEngine | null = null
let ledger: TokenLedgerService | null = null
let entities: EntityManager | null = null

function getDebate(db: any) { return debate ??= new DebateEngine(db) }
function getLedger(db: any) { return ledger ??= new TokenLedgerService(db) }
function getEntities(db: any) { return entities ??= new EntityManager(db) }

export const platformRouter = router({
  // === Debate Engine ===

  createDebate: publicProcedure
    .input(z.object({
      projectId: z.string().uuid().optional(),
      rules: z.array(z.object({
        name: z.string(),
        description: z.string(),
        weight: z.number().min(0).max(1),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getDebate(ctx.db).createSession(input.projectId, input.rules)
    }),

  submitArgument: publicProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      agentId: z.string().uuid(),
      text: z.string().min(1),
      parentId: z.string().uuid().optional(),
      isAxiom: z.boolean().optional(),
      validity: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getDebate(ctx.db).submitArgument(input.sessionId, input.agentId, input.text, {
        parentId: input.parentId,
        isAxiom: input.isAxiom,
        validity: input.validity,
      })
    }),

  addDebateEdge: publicProcedure
    .input(z.object({
      fromNodeId: z.string().uuid(),
      toNodeId: z.string().uuid(),
      type: z.enum(['support', 'attack', 'rebuttal']),
    }))
    .mutation(async ({ ctx, input }) => {
      return getDebate(ctx.db).addEdge(input.fromNodeId, input.toNodeId, input.type)
    }),

  scoreArgument: publicProcedure
    .input(z.object({ nodeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getDebate(ctx.db).scoreArgument(input.nodeId)
    }),

  scoreDebateSession: publicProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const scores = await getDebate(ctx.db).scoreSession(input.sessionId)
      return Object.fromEntries(scores)
    }),

  debateSession: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getDebate(ctx.db).getSession(input.id)
    }),

  completeDebate: publicProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      winnerId: z.string().uuid().optional(),
      loserId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getDebate(ctx.db).completeSession(input.sessionId, input.winnerId, input.loserId)
    }),

  cancelDebate: publicProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getDebate(ctx.db).cancelSession(input.sessionId)
    }),

  debateElo: publicProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getDebate(ctx.db).getElo(input.agentId)
    }),

  debateLeaderboard: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getDebate(ctx.db).leaderboard(input?.limit)
    }),

  // === Token Ledger ===

  recordUsage: publicProcedure
    .input(z.object({
      entityId: z.string().uuid().optional(),
      agentId: z.string().uuid().optional(),
      model: z.string().optional(),
      provider: z.string().optional(),
      tokensIn: z.number().min(0),
      tokensOut: z.number().min(0),
      costUsd: z.number().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      return getLedger(ctx.db).record(input)
    }),

  checkBudget: publicProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getLedger(ctx.db).checkBudget(input.entityId)
    }),

  setBudget: publicProcedure
    .input(z.object({
      entityId: z.string().uuid(),
      dailyLimitUsd: z.number().min(0).optional(),
      monthlyLimitUsd: z.number().min(0).optional(),
      alertThreshold: z.number().min(0).max(1).optional(),
      enforce: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { entityId, ...limits } = input
      return getLedger(ctx.db).setBudget(entityId, limits)
    }),

  usageSummary: publicProcedure
    .input(z.object({
      entityId: z.string().uuid(),
      since: z.date().optional(),
      until: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return getLedger(ctx.db).usageSummary(input.entityId, input.since, input.until)
    }),

  agentUsage: publicProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      since: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return getLedger(ctx.db).agentUsage(input.agentId, input.since)
    }),

  dailyCostTrend: publicProcedure
    .input(z.object({
      entityId: z.string().uuid(),
      days: z.number().min(1).max(365).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return getLedger(ctx.db).dailyCostTrend(input.entityId, input.days)
    }),

  // === Brain Entities ===

  createEntity: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      domain: z.string().optional(),
      tier: z.enum(['brain', 'mini_brain', 'development']),
      parentId: z.string().uuid().optional(),
      enginesEnabled: z.array(z.string()).optional(),
      config: z.record(z.unknown()).optional(),
      endpoint: z.string().optional(),
      healthEndpoint: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).create(input)
    }),

  activateEntity: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).activate(input.id)
    }),

  suspendEntity: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).suspend(input.id)
    }),

  entity: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getEntities(ctx.db).get(input.id)
    }),

  entitiesByTier: publicProcedure
    .input(z.object({ tier: z.enum(['brain', 'mini_brain', 'development']).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getEntities(ctx.db).listByTier(input?.tier)
    }),

  entityHierarchy: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getEntities(ctx.db).getHierarchy(input.id)
    }),

  assignEntityAgent: publicProcedure
    .input(z.object({
      entityId: z.string().uuid(),
      agentId: z.string().uuid(),
      role: z.enum(['primary', 'monitor', 'healer', 'specialist']),
    }))
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).assignAgent(input.entityId, input.agentId, input.role)
    }),

  removeEntityAgent: publicProcedure
    .input(z.object({
      entityId: z.string().uuid(),
      agentId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).removeAgent(input.entityId, input.agentId)
    }),

  entityAgents: publicProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getEntities(ctx.db).getEntityAgents(input.entityId)
    }),

  entityHealth: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getEntities(ctx.db).getHealth(input.id)
    }),

  recordHealthCheck: publicProcedure
    .input(z.object({
      entityId: z.string().uuid(),
      status: z.enum(['active', 'suspended', 'degraded', 'provisioning']),
    }))
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).recordHealthCheck(input.entityId, input.status)
    }),

  // === Strategy Runs ===

  createStrategy: publicProcedure
    .input(z.object({
      plan: z.string().min(1),
      workspaceId: z.string().uuid().optional(),
      agentId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).createStrategyRun(input.plan, input.workspaceId, input.agentId)
    }),

  startStrategy: publicProcedure
    .input(z.object({
      runId: z.string().uuid(),
      ticketIds: z.array(z.string().uuid()),
    }))
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).startStrategyRun(input.runId, input.ticketIds)
    }),

  completeStrategy: publicProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).completeStrategyRun(input.runId)
    }),

  strategyRuns: publicProcedure
    .input(z.object({ workspaceId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getEntities(ctx.db).getStrategyRuns(input?.workspaceId)
    }),

  // === Cross-Workspace Routing ===

  addRoute: publicProcedure
    .input(z.object({
      fromWorkspace: z.string().uuid(),
      toWorkspace: z.string().uuid(),
      rule: z.string().min(1),
      priority: z.number().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).addRoute(input.fromWorkspace, input.toWorkspace, input.rule, input.priority)
    }),

  routes: publicProcedure
    .input(z.object({ fromWorkspace: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getEntities(ctx.db).getRoutes(input?.fromWorkspace)
    }),

  deleteRoute: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getEntities(ctx.db).deleteRoute(input.id)
    }),
})
