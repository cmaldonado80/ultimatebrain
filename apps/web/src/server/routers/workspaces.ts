/**
 * Workspaces Router — lifecycle-managed organizational units with bindings and goals.
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc'
import { workspaces, workspaceBindings, workspaceGoals, workspaceLifecycleEvents } from '@solarc/db'
import { eq, and } from 'drizzle-orm'

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
      return ctx.db.query.workspaces.findMany({
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
        type: z.string().optional(),
        goal: z.string().optional(),
        autonomyLevel: z.number().min(1).max(5).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [ws] = await ctx.db.insert(workspaces).values(input).returning()
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

      return ws
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

      return updated
    }),

  pause: protectedProcedure
    .input(z.object({ id: z.string().uuid(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const ws = await ctx.db.query.workspaces.findFirst({
        where: eq(workspaces.id, input.id),
      })
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })

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

      return updated
    }),

  retire: protectedProcedure
    .input(z.object({ id: z.string().uuid(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const ws = await ctx.db.query.workspaces.findFirst({
        where: eq(workspaces.id, input.id),
      })
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' })

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

      const checks = {
        hasBindings: bindings.length > 0,
        hasBrain: bindings.some((b) => b.bindingType === 'brain'),
        hasEngine: bindings.some((b) => b.bindingType === 'engine'),
        bindingCount: bindings.length,
      }

      return {
        ready: checks.hasBindings,
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
})
