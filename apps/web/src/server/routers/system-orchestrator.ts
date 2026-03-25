/**
 * System Orchestrator Router — system workspace governance, orchestrator hierarchy,
 * cross-workspace routing, health monitoring, and agent rebalancing.
 */
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import type { Database } from '@solarc/db'
import { SystemOrchestrator } from '../services/orchestration'

// Lazy singleton
let systemOrchestrator: SystemOrchestrator | null = null
function getSystemOrchestrator(db: Database) {
  if (!systemOrchestrator) {
    systemOrchestrator = new SystemOrchestrator(db)
    // Bootstrap system workspace on first access (idempotent)
    systemOrchestrator.ensureSystemWorkspace().catch(console.error)
  }
  return systemOrchestrator
}

export const systemOrchestratorRouter = router({
  // ── Bootstrap & Status ──────────────────────────────────────────────

  status: protectedProcedure.query(async ({ ctx }) => {
    return getSystemOrchestrator(ctx.db).ensureSystemWorkspace()
  }),

  bootstrap: protectedProcedure.mutation(async ({ ctx }) => {
    return getSystemOrchestrator(ctx.db).ensureSystemWorkspace()
  }),

  // ── Orchestrator Hierarchy ──────────────────────────────────────────

  orchestratorTree: protectedProcedure.query(async ({ ctx }) => {
    return getSystemOrchestrator(ctx.db).getOrchestratorTree()
  }),

  linkOrchestrator: protectedProcedure
    .input(
      z.object({
        childOrchestratorId: z.string().uuid(),
        parentOrchestratorId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getSystemOrchestrator(ctx.db).linkOrchestrator(
        input.childOrchestratorId,
        input.parentOrchestratorId,
      )
      return { linked: true }
    }),

  childOrchestrators: protectedProcedure
    .input(z.object({ orchestratorId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getSystemOrchestrator(ctx.db).getChildOrchestrators(input.orchestratorId)
    }),

  // ── Escalation & Delegation ─────────────────────────────────────────

  escalate: protectedProcedure
    .input(
      z.object({
        workspaceOrchestratorId: z.string().uuid(),
        ticketId: z.string().uuid(),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getSystemOrchestrator(ctx.db).escalate(
        input.workspaceOrchestratorId,
        input.ticketId,
        input.reason,
      )
    }),

  delegate: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        targetWorkspaceId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getSystemOrchestrator(ctx.db).delegate(input.ticketId, input.targetWorkspaceId)
    }),

  // ── Task Routing ────────────────────────────────────────────────────

  routeTask: protectedProcedure
    .input(z.object({ ticketId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getSystemOrchestrator(ctx.db).routeTask(input.ticketId)
    }),

  // ── Health & Monitoring ─────────────────────────────────────────────

  workspaceHealth: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getSystemOrchestrator(ctx.db).getWorkspaceHealth(input.workspaceId)
    }),

  allWorkspacesHealth: protectedProcedure.query(async ({ ctx }) => {
    return getSystemOrchestrator(ctx.db).getAllWorkspacesHealth()
  }),

  monitorHealth: protectedProcedure.mutation(async ({ ctx }) => {
    return getSystemOrchestrator(ctx.db).monitorHealth()
  }),

  // ── Agent Allocation ────────────────────────────────────────────────

  agentAllocation: protectedProcedure.query(async ({ ctx }) => {
    return getSystemOrchestrator(ctx.db).getAgentAllocation()
  }),

  rebalanceAgents: protectedProcedure.mutation(async ({ ctx }) => {
    return getSystemOrchestrator(ctx.db).rebalanceAgents()
  }),

  // ── Budget ──────────────────────────────────────────────────────────

  budgetSummary: protectedProcedure.query(async ({ ctx }) => {
    return getSystemOrchestrator(ctx.db).getSystemBudgetSummary()
  }),

  // ── Brain Seeding ──────────────────────────────────────────────────

  /** Remove duplicate system workspaces */
  cleanupDuplicates: protectedProcedure.mutation(async ({ ctx }) => {
    return getSystemOrchestrator(ctx.db).cleanupDuplicates()
  }),

  /** Seed 10 category workspaces with orchestrators and all starter agents */
  seedBrain: protectedProcedure.mutation(async ({ ctx }) => {
    // Cleanup duplicates first, then ensure system workspace
    await getSystemOrchestrator(ctx.db).cleanupDuplicates()
    await getSystemOrchestrator(ctx.db).ensureSystemWorkspace()

    const { seedBrainWorkspaces } = await import('../services/orchestration/brain-seed')
    return seedBrainWorkspaces(ctx.db)
  }),
})
