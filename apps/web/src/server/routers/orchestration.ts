import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { TicketExecutionEngine, CronEngine, SwarmEngine, ReceiptManager } from '../services/orchestration'

// Lazy singletons
let ticketEngine: TicketExecutionEngine | null = null
let cronEngine: CronEngine | null = null
let swarmEngine: SwarmEngine | null = null
let receiptManager: ReceiptManager | null = null

function getTicketEngine(db: any) { return ticketEngine ??= new TicketExecutionEngine(db) }
function getCronEngine(db: any) { return cronEngine ??= new CronEngine(db) }
function getSwarmEngine(db: any) { return swarmEngine ??= new SwarmEngine(db) }
function getReceiptManager(db: any) { return receiptManager ??= new ReceiptManager(db) }

export const orchestrationRouter = router({
  // === Ticket Execution ===

  readyTickets: publicProcedure
    .input(z.object({ workspaceId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).getReadyTickets(input?.workspaceId)
    }),

  acquireLock: publicProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      agentId: z.string().uuid(),
      leaseSeconds: z.number().min(30).max(3600).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).acquireLock(input.ticketId, input.agentId, input.leaseSeconds)
    }),

  releaseLock: publicProcedure
    .input(z.object({ ticketId: z.string().uuid(), agentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).releaseLock(input.ticketId, input.agentId)
    }),

  renewLease: publicProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      agentId: z.string().uuid(),
      leaseSeconds: z.number().min(30).max(3600).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).renewLease(input.ticketId, input.agentId, input.leaseSeconds)
    }),

  transition: publicProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      status: z.enum(['backlog', 'queued', 'in_progress', 'review', 'done', 'failed', 'cancelled']),
      agentId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).transition(input.ticketId, input.status, input.agentId)
    }),

  assignAgent: publicProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      strategy: z.enum(['round_robin', 'least_loaded', 'skill_match', 'affinity']).optional(),
      workspaceId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).assignAgent(
        input.ticketId,
        { type: input.strategy ?? 'least_loaded' },
        input.workspaceId,
      )
    }),

  addDependency: publicProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      blockedByTicketId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).addDependency(input.ticketId, input.blockedByTicketId)
    }),

  completeTicket: publicProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      result: z.string(),
      agentId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).complete(input.ticketId, input.result, input.agentId)
    }),

  failTicket: publicProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      reason: z.string(),
      agentId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).fail(input.ticketId, input.reason, input.agentId)
    }),

  expiredLeases: publicProcedure.query(async ({ ctx }) => {
    return getTicketEngine(ctx.db).getExpiredLeases()
  }),

  // === Cron Jobs ===

  cronJobs: publicProcedure
    .input(z.object({ workspaceId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getCronEngine(ctx.db).list(input?.workspaceId)
    }),

  createCronJob: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      schedule: z.string().min(9), // min "* * * * *"
      type: z.string().optional(),
      task: z.string().optional(),
      workspaceId: z.string().uuid().optional(),
      agentId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getCronEngine(ctx.db).createJob(input)
    }),

  pauseCronJob: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getCronEngine(ctx.db).pause(input.id)
    }),

  resumeCronJob: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getCronEngine(ctx.db).resume(input.id)
    }),

  deleteCronJob: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getCronEngine(ctx.db).delete(input.id)
    }),

  dueJobs: publicProcedure.query(async ({ ctx }) => {
    return getCronEngine(ctx.db).getDueJobs()
  }),

  recordJobSuccess: publicProcedure
    .input(z.object({ id: z.string().uuid(), result: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return getCronEngine(ctx.db).recordSuccess(input.id, input.result)
    }),

  recordJobFailure: publicProcedure
    .input(z.object({ id: z.string().uuid(), error: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return getCronEngine(ctx.db).recordFailure(input.id, input.error)
    }),

  // === Ephemeral Swarms ===

  formSwarm: publicProcedure
    .input(z.object({
      task: z.string().min(1),
      requiredSkills: z.array(z.string()).optional(),
      minAgents: z.number().min(1).max(20).optional(),
      maxAgents: z.number().min(1).max(20).optional(),
      workspaceId: z.string().uuid().optional(),
      agentIds: z.array(z.string().uuid()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).form(input)
    }),

  getSwarm: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).get(input.id)
    }),

  completeSwarm: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).complete(input.id)
    }),

  disbandSwarm: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).disband(input.id)
    }),

  addSwarmMember: publicProcedure
    .input(z.object({
      swarmId: z.string().uuid(),
      agentId: z.string().uuid(),
      role: z.enum(['lead', 'worker', 'reviewer', 'specialist']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).addMember(input.swarmId, input.agentId, input.role)
    }),

  removeSwarmMember: publicProcedure
    .input(z.object({
      swarmId: z.string().uuid(),
      agentId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).removeMember(input.swarmId, input.agentId)
    }),

  activeSwarms: publicProcedure.query(async ({ ctx }) => {
    return getSwarmEngine(ctx.db).listActive()
  }),

  // === Receipts ===

  startReceipt: publicProcedure
    .input(z.object({
      agentId: z.string().uuid().optional(),
      ticketId: z.string().uuid().optional(),
      projectId: z.string().uuid().optional(),
      workspaceId: z.string().uuid().optional(),
      trigger: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).start(input)
    }),

  recordAction: publicProcedure
    .input(z.object({
      receiptId: z.string().uuid(),
      type: z.string().min(1),
      target: z.string().optional(),
      summary: z.string().optional(),
      preState: z.unknown().optional(),
      result: z.unknown().optional(),
      isRollbackEligible: z.boolean().optional(),
      durationMs: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).recordAction(input)
    }),

  completeReceipt: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).complete(input.id)
    }),

  failReceipt: publicProcedure
    .input(z.object({ id: z.string().uuid(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).fail(input.id, input.reason)
    }),

  rollbackReceipt: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).rollback(input.id)
    }),

  receipt: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).getFull(input.id)
    }),

  receipts: publicProcedure
    .input(z.object({
      agentId: z.string().uuid().optional(),
      ticketId: z.string().uuid().optional(),
      status: z.enum(['running', 'completed', 'failed', 'rolled_back']).optional(),
      limit: z.number().min(1).max(200).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).list(input ?? undefined)
    }),

  recordAnomaly: publicProcedure
    .input(z.object({
      receiptId: z.string().uuid(),
      description: z.string().min(1),
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).recordAnomaly(input.receiptId, input.description, input.severity)
    }),
})
