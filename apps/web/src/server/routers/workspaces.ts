/**
 * Workspaces Router — lifecycle-managed organizational units with bindings and goals.
 */
import {
  agents,
  chatRuns,
  chatSessions,
  runQuality,
  workspaceBindings,
  workspaceGoals,
  workspaceLifecycleEvents,
  workspaceMembers,
  workspaces,
} from '@solarc/db'
import { TRPCError } from '@trpc/server'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { auditEvent } from '../services/platform/audit'
import { protectedProcedure, router } from '../trpc'

// Valid lifecycle transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['active'],
  active: ['paused', 'retired'],
  paused: ['active', 'retired'],
  retired: [],
}

export const workspacesRouter = router({
  // ── List / Read ──────────────────────────────────────────────────

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.session.organizationId
      return ctx.db.query.workspaces.findMany({
        where: orgId ? eq(workspaces.organizationId, orgId) : undefined,
        limit: input.limit,
        offset: input.offset,
      })
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.workspaces.findFirst({
        where: eq(workspaces.id, input.id),
      })
    }),

  // ── Create ───────────────────────────────────────────────────────

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.enum(['general', 'development', 'staging', 'system']).optional(),
        goal: z.string().optional(),
        autonomyLevel: z.number().min(1).max(5).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [ws] = await ctx.db
        .insert(workspaces)
        .values({ ...input, organizationId: ctx.session.organizationId })
        .returning()
      if (!ws)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create workspace',
        })

      // Log creation event
      await ctx.db.insert(workspaceLifecycleEvents).values({
        workspaceId: ws.id,
        eventType: 'created',
        toState: 'draft',
        payload: { name: ws.name, type: ws.type },
      })

      // Auto-provision orchestrator agent for this workspace
      // Find system orchestrator to set as parent (if exists)
      const systemWs = await ctx.db.query.workspaces.findFirst({
        where: eq(workspaces.type, 'system'),
      })
      let parentOrchestratorId: string | null = null
      if (systemWs) {
        const systemOrch = await ctx.db.query.agents.findFirst({
          where: and(eq(agents.workspaceId, systemWs.id), eq(agents.isWsOrchestrator, true)),
        })
        parentOrchestratorId = systemOrch?.id ?? null
      }

      await ctx.db.insert(agents).values({
        name: `${ws.name} Orchestrator`,
        type: 'orchestrator',
        workspaceId: ws.id,
        isWsOrchestrator: true,
        parentOrchestratorId,
        description: `Default orchestrator for workspace ${ws.name}`,
        skills: ['coordination', 'task-routing', 'monitoring'],
        triggerMode: 'auto',
      })

      return ws
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        goal: z.string().optional(),
        autonomyLevel: z.number().min(1).max(5).optional(),
        settings: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input
      const [updated] = await ctx.db
        .update(workspaces)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(workspaces.id, id))
        .returning()
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })
      return updated
    }),

  // ── Lifecycle ────────────────────────────────────────────────────

  activate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const ws = await ctx.db.query.workspaces.findFirst({
        where: eq(workspaces.id, input.id),
      })
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })

      const current = ws.lifecycleState ?? 'draft'
      if (!VALID_TRANSITIONS[current]?.includes('active'))
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot activate from ${current}`,
        })

      // Readiness check: must have at least one binding
      const bindings = await ctx.db.query.workspaceBindings.findMany({
        where: and(
          eq(workspaceBindings.workspaceId, input.id),
          eq(workspaceBindings.enabled, true),
        ),
      })
      if (bindings.length === 0)
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Workspace has no active bindings. Add at least one binding before activating.',
        })

      // Enforce orchestrator exists
      const orchestrator = await ctx.db.query.agents.findFirst({
        where: and(eq(agents.workspaceId, input.id), eq(agents.isWsOrchestrator, true)),
      })
      if (!orchestrator)
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'Workspace has no orchestrator agent. An orchestrator is required before activating.',
        })

      const [updated] = await ctx.db
        .update(workspaces)
        .set({ lifecycleState: 'active', updatedAt: new Date() })
        .where(eq(workspaces.id, input.id))
        .returning()

      await ctx.db.insert(workspaceLifecycleEvents).values({
        workspaceId: input.id,
        eventType: 'activated',
        fromState: current as 'draft' | 'active' | 'paused' | 'retired',
        toState: 'active',
      })

      // Set all workspace agents to idle
      await ctx.db
        .update(agents)
        .set({ status: 'idle', updatedAt: new Date() })
        .where(eq(agents.workspaceId, input.id))

      return updated
    }),

  pause: protectedProcedure
    .input(z.object({ id: z.string().uuid(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const ws = await ctx.db.query.workspaces.findFirst({
        where: eq(workspaces.id, input.id),
      })
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })

      if (ws.type === 'system' || ws.isSystemProtected)
        throw new TRPCError({ code: 'FORBIDDEN', message: 'System workspace cannot be paused' })

      const current = ws.lifecycleState ?? 'draft'
      if (!VALID_TRANSITIONS[current]?.includes('paused'))
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot pause from ${current}`,
        })

      const [updated] = await ctx.db
        .update(workspaces)
        .set({ lifecycleState: 'paused', updatedAt: new Date() })
        .where(eq(workspaces.id, input.id))
        .returning()

      await ctx.db.insert(workspaceLifecycleEvents).values({
        workspaceId: input.id,
        eventType: 'paused',
        fromState: current as 'draft' | 'active' | 'paused' | 'retired',
        toState: 'paused',
        payload: input.reason ? { reason: input.reason } : undefined,
      })

      // Set all workspace agents to offline
      await ctx.db
        .update(agents)
        .set({ status: 'offline', updatedAt: new Date() })
        .where(eq(agents.workspaceId, input.id))

      return updated
    }),

  retire: protectedProcedure
    .input(z.object({ id: z.string().uuid(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const ws = await ctx.db.query.workspaces.findFirst({
        where: eq(workspaces.id, input.id),
      })
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })

      if (ws.type === 'system' || ws.isSystemProtected)
        throw new TRPCError({ code: 'FORBIDDEN', message: 'System workspace cannot be retired' })

      const current = ws.lifecycleState ?? 'draft'
      if (!VALID_TRANSITIONS[current]?.includes('retired'))
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot retire from ${current}`,
        })

      const [updated] = await ctx.db
        .update(workspaces)
        .set({ lifecycleState: 'retired', updatedAt: new Date() })
        .where(eq(workspaces.id, input.id))
        .returning()

      await ctx.db.insert(workspaceLifecycleEvents).values({
        workspaceId: input.id,
        eventType: 'retired',
        fromState: current as 'draft' | 'active' | 'paused' | 'retired',
        toState: 'retired',
        payload: input.reason ? { reason: input.reason } : undefined,
      })

      // Set all workspace agents to offline
      await ctx.db
        .update(agents)
        .set({ status: 'offline', updatedAt: new Date() })
        .where(eq(agents.workspaceId, input.id))

      return updated
    }),

  lifecycleEvents: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.workspaceLifecycleEvents.findMany({
        where: eq(workspaceLifecycleEvents.workspaceId, input.workspaceId),
        orderBy: (e, { desc }) => [desc(e.createdAt)],
      })
    }),

  readiness: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const ws = await ctx.db.query.workspaces.findFirst({
        where: eq(workspaces.id, input.id),
      })
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })

      const bindings = await ctx.db.query.workspaceBindings.findMany({
        where: and(
          eq(workspaceBindings.workspaceId, input.id),
          eq(workspaceBindings.enabled, true),
        ),
      })

      const orchestrator = await ctx.db.query.agents.findFirst({
        where: and(eq(agents.workspaceId, input.id), eq(agents.isWsOrchestrator, true)),
      })

      const checks = {
        hasBindings: bindings.length > 0,
        hasBrain: bindings.some((b) => b.bindingType === 'brain'),
        hasEngine: bindings.some((b) => b.bindingType === 'engine'),
        hasOrchestrator: !!orchestrator,
        bindingCount: bindings.length,
      }

      return {
        ready: checks.hasBindings && checks.hasOrchestrator,
        lifecycleState: ws.lifecycleState,
        checks,
      }
    }),

  // ── Bindings ─────────────────────────────────────────────────────

  listBindings: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.workspaceBindings.findMany({
        where: eq(workspaceBindings.workspaceId, input.workspaceId),
      })
    }),

  addBinding: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        bindingType: z.enum(['brain', 'engine', 'skill']),
        bindingKey: z.string().min(1),
        config: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [binding] = await ctx.db
        .insert(workspaceBindings)
        .values({
          workspaceId: input.workspaceId,
          bindingType: input.bindingType,
          bindingKey: input.bindingKey,
          config: input.config,
        })
        .returning()

      await ctx.db.insert(workspaceLifecycleEvents).values({
        workspaceId: input.workspaceId,
        eventType: 'binding_added',
        payload: { bindingType: input.bindingType, bindingKey: input.bindingKey },
      })

      return binding
    }),

  removeBinding: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const binding = await ctx.db.query.workspaceBindings.findFirst({
        where: eq(workspaceBindings.id, input.id),
      })
      if (!binding) throw new TRPCError({ code: 'NOT_FOUND', message: 'Binding not found' })

      await ctx.db.delete(workspaceBindings).where(eq(workspaceBindings.id, input.id))

      await ctx.db.insert(workspaceLifecycleEvents).values({
        workspaceId: binding.workspaceId,
        eventType: 'binding_removed',
        payload: { bindingType: binding.bindingType, bindingKey: binding.bindingKey },
      })

      return { removed: true }
    }),

  toggleBinding: protectedProcedure
    .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(workspaceBindings)
        .set({ enabled: input.enabled })
        .where(eq(workspaceBindings.id, input.id))
        .returning()
      return updated
    }),

  // ── Goals ────────────────────────────────────────────────────────

  listGoals: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.workspaceGoals.findMany({
        where: eq(workspaceGoals.workspaceId, input.workspaceId),
        orderBy: (g, { desc }) => [desc(g.priority)],
      })
    }),

  createGoal: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.number().min(0).max(10).default(0),
        targetMetric: z.string().optional(),
        targetValue: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [goal] = await ctx.db.insert(workspaceGoals).values(input).returning()
      if (!goal)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create goal' })
      return goal
    }),

  updateGoal: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(['active', 'achieved', 'abandoned']).optional(),
        currentValue: z.number().optional(),
        priority: z.number().min(0).max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input
      const [updated] = await ctx.db
        .update(workspaceGoals)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(workspaceGoals.id, id))
        .returning()
      return updated
    }),

  deleteGoal: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(workspaceGoals).where(eq(workspaceGoals.id, input.id))
      return { deleted: true }
    }),

  // ── Delete ────────────────────────────────────────────────────────

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const ws = await ctx.db.query.workspaces.findFirst({
        where: eq(workspaces.id, input.id),
      })
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })

      if (ws.type === 'system' || ws.isSystemProtected)
        throw new TRPCError({ code: 'FORBIDDEN', message: 'System workspace cannot be deleted' })

      await ctx.db.delete(workspaces).where(eq(workspaces.id, input.id))
      return { deleted: true }
    }),

  // ── Autonomy ──────────────────────────────────────────────────────

  getAutonomyLevel: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      if (!input.workspaceId) return 'manual' as const
      const ws = await ctx.db.query.workspaces.findFirst({
        where: eq(workspaces.id, input.workspaceId),
      })
      const level = ws?.autonomyLevel ?? 1
      if (level >= 4) return 'auto' as const
      if (level >= 3) return 'assist' as const
      return 'manual' as const
    }),

  setAutonomyLevel: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        level: z.enum(['manual', 'assist', 'auto']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const dbLevel = input.level === 'auto' ? 5 : input.level === 'assist' ? 3 : 1
      await ctx.db
        .update(workspaces)
        .set({ autonomyLevel: dbLevel, updatedAt: new Date() })
        .where(eq(workspaces.id, input.workspaceId))
      return { level: input.level }
    }),

  // === Workspace Intelligence ===

  /** Get workspace-level performance summary */
  getWorkspaceSummary: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Get sessions in this workspace
      const sessions = await ctx.db.query.chatSessions.findMany({
        where: eq(chatSessions.workspaceId, input.workspaceId),
        limit: 200,
      })
      const sessionIds = sessions.map((s) => s.id)

      // Get runs from those sessions
      const runs =
        sessionIds.length > 0
          ? await ctx.db.query.chatRuns.findMany({
              where: sql`${chatRuns.sessionId} = ANY(${sessionIds})`,
              orderBy: desc(chatRuns.startedAt),
              limit: 100,
            })
          : []

      const nonRunning = runs.filter((r) => r.status !== 'running')
      const completed = nonRunning.filter((r) => r.status === 'completed')
      const failed = nonRunning.filter((r) => r.status === 'failed')
      const totalRuns = nonRunning.length
      const successRate = totalRuns > 0 ? Math.round((completed.length / totalRuns) * 100) / 100 : 0

      // Get quality scores
      const runIds = nonRunning.map((r) => r.id)
      const qualities =
        runIds.length > 0
          ? await ctx.db.query.runQuality.findMany({
              where: sql`${runQuality.runId} = ANY(${runIds})`,
            })
          : []
      const qualityScores = qualities.map((q) => q.score)
      const avgQualityScore =
        qualityScores.length > 0
          ? Math.round((qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length) * 100) /
            100
          : null

      // Duration
      const durations = nonRunning.map((r) => r.durationMs).filter((d): d is number => d != null)
      const avgDurationMs =
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null

      // Trend
      let trend: 'improving' | 'declining' | 'stable' | null = null
      if (qualityScores.length >= 6) {
        const recent = qualityScores.slice(0, 3).reduce((a, b) => a + b, 0) / 3
        const earlier = qualityScores.slice(-3).reduce((a, b) => a + b, 0) / 3
        const delta = recent - earlier
        trend = delta > 0.1 ? 'improving' : delta < -0.1 ? 'declining' : 'stable'
      }

      // Members + agents count
      const members = await ctx.db.query.workspaceMembers.findMany({
        where: eq(workspaceMembers.workspaceId, input.workspaceId),
      })
      const wsAgents = await ctx.db.query.agents.findMany({
        where: eq(agents.workspaceId, input.workspaceId),
      })
      const goals = await ctx.db.query.workspaceGoals.findMany({
        where: and(
          eq(workspaceGoals.workspaceId, input.workspaceId),
          eq(workspaceGoals.status, 'active'),
        ),
      })

      return {
        totalRuns,
        completedRuns: completed.length,
        failedRuns: failed.length,
        successRate,
        avgQualityScore,
        avgDurationMs,
        trend,
        memberCount: members.length,
        agentCount: wsAgents.length,
        activeGoals: goals.length,
      }
    }),

  /** Get typed workspace policy from settings JSONB */
  getWorkspacePolicy: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const ws = await ctx.db.query.workspaces.findFirst({
        where: eq(workspaces.id, input.workspaceId),
      })
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })

      const settings = (ws.settings ?? {}) as Record<string, unknown>
      return {
        decisionMode: (settings.decisionMode as string) ?? 'balanced',
        autonomyMode:
          ws.autonomyLevel === 5 ? 'auto' : ws.autonomyLevel === 3 ? 'assist' : 'manual',
        escalationOnFailure: (settings.escalationOnFailure as string) ?? 'manual',
        preferredWorkflows: (settings.preferredWorkflows as string[]) ?? [],
        guardrailLevel: (settings.guardrailLevel as string) ?? 'standard',
      }
    }),

  /** Update typed workspace policy */
  updateWorkspacePolicy: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        policy: z.object({
          decisionMode: z
            .enum(['balanced', 'quality', 'speed', 'stability', 'simplicity'])
            .optional(),
          escalationOnFailure: z.enum(['retry', 'escalate', 'manual']).optional(),
          preferredWorkflows: z.array(z.string()).optional(),
          guardrailLevel: z.enum(['standard', 'strict', 'permissive']).optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ws = await ctx.db.query.workspaces.findFirst({
        where: eq(workspaces.id, input.workspaceId),
      })
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })

      const currentSettings = (ws.settings ?? {}) as Record<string, unknown>
      const updatedSettings = { ...currentSettings, ...input.policy }

      await ctx.db
        .update(workspaces)
        .set({ settings: updatedSettings, updatedAt: new Date() })
        .where(eq(workspaces.id, input.workspaceId))

      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'update_workspace_policy',
        'workspace',
        input.workspaceId,
        input.policy,
      )

      return { ok: true }
    }),
})
