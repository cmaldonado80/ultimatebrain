import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
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

  readyTickets: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).getReadyTickets(input?.workspaceId)
    }),

  acquireLock: protectedProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      agentId: z.string().uuid(),
      leaseSeconds: z.number().min(30).max(3600).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).acquireLock(input.ticketId, input.agentId, input.leaseSeconds)
    }),

  releaseLock: protectedProcedure
    .input(z.object({ ticketId: z.string().uuid(), agentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).releaseLock(input.ticketId, input.agentId)
    }),

  renewLease: protectedProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      agentId: z.string().uuid(),
      leaseSeconds: z.number().min(30).max(3600).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).renewLease(input.ticketId, input.agentId, input.leaseSeconds)
    }),

  transition: protectedProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      status: z.enum(['backlog', 'queued', 'in_progress', 'review', 'done', 'failed', 'cancelled']),
      agentId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).transition(input.ticketId, input.status, input.agentId)
    }),

  assignAgent: protectedProcedure
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

  addDependency: protectedProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      blockedByTicketId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).addDependency(input.ticketId, input.blockedByTicketId)
    }),

  completeTicket: protectedProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      result: z.string(),
      agentId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getTicketEngine(ctx.db).complete(input.ticketId, input.result, input.agentId)
    }),

  failTicket: protectedProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      reason: z.string(),
      agentId: z.string().uuid().optional(),
    }))
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

  getSwarm: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).get(input.id)
    }),

  completeSwarm: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).complete(input.id)
    }),

  disbandSwarm: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).disband(input.id)
    }),

  addSwarmMember: protectedProcedure
    .input(z.object({
      swarmId: z.string().uuid(),
      agentId: z.string().uuid(),
      role: z.enum(['lead', 'worker', 'reviewer', 'specialist']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).addMember(input.swarmId, input.agentId, input.role)
    }),

  removeSwarmMember: protectedProcedure
    .input(z.object({
      swarmId: z.string().uuid(),
      agentId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getSwarmEngine(ctx.db).removeMember(input.swarmId, input.agentId)
    }),

  activeSwarms: protectedProcedure.query(async ({ ctx }) => {
    return getSwarmEngine(ctx.db).listActive()
  }),

  // === Receipts ===

  startReceipt: protectedProcedure
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

  recordAction: protectedProcedure
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

  completeReceipt: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).complete(input.id)
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
    .input(z.object({
      agentId: z.string().uuid().optional(),
      ticketId: z.string().uuid().optional(),
      status: z.enum(['running', 'completed', 'failed', 'rolled_back']).optional(),
      limit: z.number().min(1).max(200).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).list(input ?? undefined)
    }),

  recordAnomaly: protectedProcedure
    .input(z.object({
      receiptId: z.string().uuid(),
      description: z.string().min(1),
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getReceiptManager(ctx.db).recordAnomaly(input.receiptId, input.description, input.severity)
    }),
})
