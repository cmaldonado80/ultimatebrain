/**
 * Orchestration Router — ticket execution, cron jobs, swarms, and receipts.
 *
 * Coordinates the full execution lifecycle: lease acquisition, status transitions,
 * cron scheduling, multi-agent swarm management, and execution receipt generation.
 */
import type { Database } from '@solarc/db'
import { instinctObservations } from '@solarc/db'
import { z } from 'zod'

import { logger } from '../../lib/logger'
import {
  CronEngine,
  ReceiptManager,
  SwarmEngine,
  TicketExecutionEngine,
} from '../services/orchestration'
import { protectedProcedure, router } from '../trpc'

// Lazy singletons
let ticketEngine: TicketExecutionEngine | null = null
let cronEngine: CronEngine | null = null
let swarmEngine: SwarmEngine | null = null
let receiptManager: ReceiptManager | null = null

function getTicketEngine(db: Database) {
  return (ticketEngine ??= new TicketExecutionEngine(db))
}
function getCronEngine(db: Database) {
  return (cronEngine ??= new CronEngine(db))
}
function getSwarmEngine(db: Database) {
  return (swarmEngine ??= new SwarmEngine(db))
}
function getReceiptManager(db: Database) {
  return (receiptManager ??= new ReceiptManager(db))
}

export const orchestrationRouter = router({
  // === Ticket Execution ===

  readyTickets: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).getReadyTickets(input?.workspaceId)
    }),

  acquireLock: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        agentId: z.string().uuid(),
        leaseSeconds: z.number().min(30).max(3600).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).acquireLock(input.ticketId, input.agentId, input.leaseSeconds)
    }),

  releaseLock: protectedProcedure
    .input(z.object({ ticketId: z.string().uuid(), agentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).releaseLock(input.ticketId, input.agentId)
    }),

  renewLease: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        agentId: z.string().uuid(),
        leaseSeconds: z.number().min(30).max(3600).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).renewLease(input.ticketId, input.agentId, input.leaseSeconds)
    }),

  transition: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        status: z.enum([
          'backlog',
          'queued',
          'in_progress',
          'review',
          'done',
          'failed',
          'cancelled',
        ]),
        agentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).transition(input.ticketId, input.status, input.agentId)
    }),

  assignAgent: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        strategy: z.enum(['round_robin', 'least_loaded', 'skill_match', 'affinity']).optional(),
        workspaceId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).assignAgent(
        input.ticketId,
        { type: input.strategy ?? 'least_loaded' },
        input.workspaceId,
      )
    }),

  addDependency: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        blockedByTicketId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).addDependency(input.ticketId, input.blockedByTicketId)
    }),

  completeTicket: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        result: z.string(),
        agentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).complete(input.ticketId, input.result, input.agentId)
    }),

  failTicket: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        reason: z.string(),
        agentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).fail(input.ticketId, input.reason, input.agentId)
    }),

  expiredLeases: protectedProcedure.query(async ({ ctx }) => {
    return getTicketEngine(ctx.db).getExpiredLeases()
  }),

  // === Cron Jobs ===

  cronJobs: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getCronEngine(ctx.db).list(input?.workspaceId)
    }),

  createCronJob: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        schedule: z.string().min(9), // min "* * * * *"
        type: z.string().optional(),
        task: z.string().optional(),
        workspaceId: z.string().uuid().optional(),
        agentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getCronEngine(ctx.db).createJob(input)
    }),

  pauseCronJob: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getCronEngine(ctx.db).pause(input.id)
    }),

  resumeCronJob: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getCronEngine(ctx.db).resume(input.id)
    }),

  deleteCronJob: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getCronEngine(ctx.db).delete(input.id)
    }),

  dueJobs: protectedProcedure.query(async ({ ctx }) => {
    return getCronEngine(ctx.db).getDueJobs()
  }),

  recordJobSuccess: protectedProcedure
    .input(z.object({ id: z.string().uuid(), result: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return getCronEngine(ctx.db).recordSuccess(input.id, input.result)
    }),

  recordJobFailure: protectedProcedure
    .input(z.object({ id: z.string().uuid(), error: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return getCronEngine(ctx.db).recordFailure(input.id, input.error)
    }),

  // === Ephemeral Swarms ===

  formSwarm: protectedProcedure
    .input(
      z.object({
        task: z.string().min(1),
        requiredSkills: z.array(z.string()).optional(),
        minAgents: z.number().min(1).max(20).optional(),
        maxAgents: z.number().min(1).max(20).optional(),
        workspaceId: z.string().uuid().optional(),
        agentIds: z.array(z.string().uuid()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).form(input)
    }),

  getSwarm: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).get(input.id)
    }),

  completeSwarm: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const engine = getSwarmEngine(ctx.db)
      await engine.complete(input.id)

      // Learn from swarm outcomes — record team composition + task for future formation
      try {
        const swarm = await engine.get(input.id)
        if (swarm) {
          const members = (swarm as { members?: Array<{ role: string }> }).members ?? []
          const roleComposition = members.map((m) => m.role).join(', ')
          await ctx.db
            .insert(instinctObservations)
            .values({
              eventType: 'swarm_outcome',
              payload: {
                swarmId: input.id,
                task: (swarm as { task?: string }).task,
                memberCount: members.length,
                roleComposition,
              },
            })
            .catch((err) => {
              logger.warn(
                { err: err instanceof Error ? err : undefined },
                'swarm: failed to record outcome observation',
              )
            })
        }
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          'swarm: outcome learning failed',
        )
      }
    }),

  disbandSwarm: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).disband(input.id)
    }),

  addSwarmMember: protectedProcedure
    .input(
      z.object({
        swarmId: z.string().uuid(),
        agentId: z.string().uuid(),
        role: z.enum(['lead', 'worker', 'reviewer', 'specialist']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).addMember(input.swarmId, input.agentId, input.role)
    }),

  removeSwarmMember: protectedProcedure
    .input(
      z.object({
        swarmId: z.string().uuid(),
        agentId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).removeMember(input.swarmId, input.agentId)
    }),

  activeSwarms: protectedProcedure.query(async ({ ctx }) => {
    return getSwarmEngine(ctx.db).listActive()
  }),

  // === Receipts ===

  startReceipt: protectedProcedure
    .input(
      z.object({
        agentId: z.string().uuid().optional(),
        ticketId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        workspaceId: z.string().uuid().optional(),
        trigger: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).start(input)
    }),

  recordAction: protectedProcedure
    .input(
      z.object({
        receiptId: z.string().uuid(),
        type: z.string().min(1),
        target: z.string().optional(),
        summary: z.string().optional(),
        preState: z.unknown().optional(),
        result: z.unknown().optional(),
        isRollbackEligible: z.boolean().optional(),
        durationMs: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).recordAction(input)
    }),

  completeReceipt: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const mgr = getReceiptManager(ctx.db)
      await mgr.complete(input.id)

      // Learn from receipt outcomes — extract tool patterns for instinct system
      try {
        const full = await mgr.getFull(input.id)
        if (full) {
          const actions = full.actions ?? []
          const anomalies = full.anomalies ?? []
          const toolSequence = actions.map((a: { type: string }) => a.type).join(' → ')
          const successRate =
            actions.length > 0
              ? actions.filter((a) => a.status === 'completed').length / actions.length
              : 1.0
          await ctx.db
            .insert(instinctObservations)
            .values({
              eventType: 'receipt_outcome',
              payload: {
                receiptId: input.id,
                ticketId: full.receipt.ticketId,
                agentId: full.receipt.agentId,
                toolSequence,
                actionCount: actions.length,
                anomalyCount: anomalies.length,
                successRate,
                durationMs: full.receipt.durationMs,
              },
            })
            .catch((err) => {
              logger.warn(
                { err: err instanceof Error ? err : undefined },
                'receipt: failed to record outcome observation',
              )
            })
        }
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          'receipt: outcome learning failed',
        )
      }
    }),

  failReceipt: protectedProcedure
    .input(z.object({ id: z.string().uuid(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).fail(input.id, input.reason)
    }),

  rollbackReceipt: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).rollback(input.id)
    }),

  receipt: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).getFull(input.id)
    }),

  receipts: protectedProcedure
    .input(
      z
        .object({
          agentId: z.string().uuid().optional(),
          ticketId: z.string().uuid().optional(),
          status: z.enum(['running', 'completed', 'failed', 'rolled_back']).optional(),
          limit: z.number().min(1).max(200).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).list(input ?? undefined)
    }),

  recordAnomaly: protectedProcedure
    .input(
      z.object({
        receiptId: z.string().uuid(),
        description: z.string().min(1),
        severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).recordAnomaly(
        input.receiptId,
        input.description,
        input.severity,
      )
    }),

  // === Agent Routines (Paperclip-inspired) ===

  routinesList: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { listRoutines } = await import('../services/orchestration/agent-routines')
      return listRoutines(ctx.db, input.workspaceId)
    }),

  routineUpsert: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        agentId: z.string().uuid(),
        workspaceId: z.string().uuid(),
        triggerMode: z.enum(['schedule', 'webhook', 'manual']),
        schedule: z.string().optional(),
        task: z.string().min(1),
        concurrencyPolicy: z
          .enum(['always_enqueue', 'skip_if_active', 'coalesce'])
          .default('skip_if_active'),
        maxCatchUp: z.number().min(0).max(25).default(5),
        enabled: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { upsertRoutine } = await import('../services/orchestration/agent-routines')
      return upsertRoutine(ctx.db, input)
    }),

  routineDispatch: protectedProcedure
    .input(
      z.object({
        routineId: z.string().uuid(),
        triggerSource: z.enum(['schedule', 'webhook', 'manual', 'catch_up']).default('manual'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { dispatchRoutine } = await import('../services/orchestration/agent-routines')
      return dispatchRoutine(ctx.db, input.routineId, input.triggerSource)
    }),

  routineHistory: protectedProcedure
    .input(z.object({ routineId: z.string().uuid() }))
    .query(async ({ input }) => {
      const { getRoutineHistory } = await import('../services/orchestration/agent-routines')
      return getRoutineHistory(input.routineId)
    }),

  // === Work Products (Paperclip-inspired) ===

  workProductsList: protectedProcedure
    .input(z.object({ ticketId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { listWorkProducts } = await import('../services/orchestration/work-products')
      return listWorkProducts(ctx.db, input.ticketId)
    }),

  workProductCreate: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        name: z.string().min(1),
        type: z.string().default('other'),
        content: z.string().optional(),
        url: z.string().optional(),
        agentId: z.string().uuid().optional(),
        workspaceId: z.string().uuid().optional(),
        isPrimary: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { createWorkProduct } = await import('../services/orchestration/work-products')
      return createWorkProduct(ctx.db, input)
    }),

  workProductReview: protectedProcedure
    .input(
      z.object({
        artifactId: z.string().uuid(),
        reviewState: z.enum(['pending', 'approved', 'rejected', 'needs_revision']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { reviewWorkProduct } = await import('../services/orchestration/work-products')
      await reviewWorkProduct(ctx.db, input.artifactId, input.reviewState)
      return { updated: true }
    }),

  // ── Breakthroughs: Initiative, Knowledge, Goals, Roles, Market ────────

  /** Get initiative engine stats */
  initiativeStats: protectedProcedure.query(async ({ ctx }) => {
    const { AgentInitiativeEngine } = await import('../services/orchestration/initiative-engine')
    const engine = new AgentInitiativeEngine(ctx.db)
    return engine.getStats()
  }),

  /** Get recent initiative signals */
  initiativeSignals: protectedProcedure.query(async () => {
    // Signals populate during cron cycles via AgentInitiativeEngine
    return { signals: [] as unknown[], initiatives: [] as unknown[] }
  }),

  /** Query knowledge mesh */
  knowledgeMeshQuery: protectedProcedure
    .input(
      z.object({ question: z.string(), scope: z.enum(['department', 'organization']).optional() }),
    )
    .query(async ({ ctx }) => {
      const { KnowledgeMesh } = await import('../services/orchestration/knowledge-mesh')
      const mesh = new KnowledgeMesh(ctx.db)
      return mesh.getStats()
    }),

  /** Get knowledge mesh stats */
  knowledgeMeshStats: protectedProcedure.query(async ({ ctx }) => {
    const { KnowledgeMesh } = await import('../services/orchestration/knowledge-mesh')
    const mesh = new KnowledgeMesh(ctx.db)
    return mesh.getStats()
  }),

  /** Get knowledge mesh exchange history from DB */
  knowledgeMeshExchanges: protectedProcedure.query(async ({ ctx }) => {
    const { KnowledgeMesh } = await import('../services/orchestration/knowledge-mesh')
    const mesh = new KnowledgeMesh(ctx.db)
    return mesh.getRecentExchanges()
  }),

  /** Get goal cascade snapshot */
  goalCascade: protectedProcedure.query(async () => {
    const { GoalCascadeEngine } = await import('../services/orchestration/goal-cascade')
    const engine = new GoalCascadeEngine()
    return engine.getSnapshot()
  }),

  /** Get emergent role proposals */
  roleProposals: protectedProcedure.query(async () => {
    const { EmergentRoleCreator } = await import('../services/orchestration/emergent-roles')
    const creator = new EmergentRoleCreator()
    return { proposals: creator.getProposals(), stats: creator.getStats() }
  }),

  /** Get work market stats */
  workMarketStats: protectedProcedure.query(async ({ ctx }) => {
    const { WorkMarket } = await import('../services/orchestration/work-market')
    const market = new WorkMarket(ctx.db)
    return market.getStats()
  }),

  /** Get work market reputations (DB-backed) */
  workMarketReputations: protectedProcedure.query(async ({ ctx }) => {
    const { WorkMarket } = await import('../services/orchestration/work-market')
    const market = new WorkMarket(ctx.db)
    const reps = await market.getAllReputationsFromDb()
    return reps
  }),

  /** Get open market listings with ticket details */
  workMarketOpenListings: protectedProcedure.query(async ({ ctx }) => {
    const { WorkMarket } = await import('../services/orchestration/work-market')
    const market = new WorkMarket(ctx.db)
    return market.getOpenListings()
  }),

  /** Preview a codebase review (dry-run) */
  reviewPreview: protectedProcedure.query(async () => {
    const { CodebaseMapper } = await import('../services/orchestration/codebase-mapper')
    const mapper = new CodebaseMapper()
    const rootDir = process.cwd()
    const map = mapper.scan(rootDir)
    const tickets = mapper.generateReviewTickets(map)
    return {
      totalFiles: map.totalFiles,
      totalLines: map.totalLines,
      subsystems: map.subsystems.map((s) => ({
        name: s.name,
        category: s.category,
        department: s.department,
        totalFiles: s.totalFiles,
        totalLines: s.totalLines,
      })),
      ticketCount: tickets.length,
      tickets: tickets.map((t) => ({
        title: t.title,
        department: t.department,
        priority: t.priority,
      })),
    }
  }),

  /** Run a full codebase review — creates real tickets */
  runReview: protectedProcedure.mutation(async ({ ctx }) => {
    const { AutoReviewEngine } = await import('../services/orchestration/auto-review')
    const engine = new AutoReviewEngine(ctx.db)
    return engine.runReview(process.cwd())
  }),

  // ── Collective Decision Engine (T3) ─────────────────────────────────

  /** Trigger a multi-agent debate on a topic */
  triggerDebate: protectedProcedure
    .input(
      z.object({
        topic: z.string(),
        context: z.string(),
        agentIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { DebateEngine } = await import('../services/orchestration/debate-engine')
      const engine = new DebateEngine(ctx.db)
      const id = await engine.triggerDebate(input.topic, input.context, input.agentIds)
      return { debateId: id }
    }),

  /** Get recent debate history */
  debateHistory: protectedProcedure.query(async ({ ctx }) => {
    const { DebateEngine } = await import('../services/orchestration/debate-engine')
    return new DebateEngine(ctx.db).getDebateHistory()
  }),

  // ── Org Optimizer (T4) ──────────────────────────────────────────────

  /** Analyze workforce bottlenecks */
  orgAnalysis: protectedProcedure.query(async ({ ctx }) => {
    const { OrgOptimizer } = await import('../services/orchestration/org-optimizer')
    return new OrgOptimizer(ctx.db).analyzeBottlenecks()
  }),

  /** Get restructuring proposals */
  restructuringProposals: protectedProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { OrgOptimizer } = await import('../services/orchestration/org-optimizer')
      return new OrgOptimizer(ctx.db).getProposals(input?.status)
    }),
})
