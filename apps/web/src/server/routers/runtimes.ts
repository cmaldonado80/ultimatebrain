/**
 * Runtimes Router — deployment lifecycle management for Mini Brains and Development apps.
 *
 * Manages runtime identity, deployment state, endpoint registration,
 * health verification, and lifecycle transitions.
 *
 * Lifecycle: provisioning → configured → deployed → verified → active
 *   active ↔ degraded (auto), active/degraded → suspended (manual)
 *   suspended → active (manual), any → retired (manual, irreversible)
 */

import { brainEntities } from '@solarc/db'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { auditEvent } from '../services/platform/audit'
import { assertPermission } from '../services/platform/permissions'
import { protectedProcedure, router } from '../trpc'

export const runtimesRouter = router({
  /** List all runtimes with optional filters */
  getRuntimes: protectedProcedure
    .input(
      z
        .object({
          tier: z.enum(['brain', 'mini_brain', 'development']).optional(),
          environment: z.string().optional(),
          limit: z.number().min(1).max(200).default(50),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.session.organizationId
      const conditions = [eq(brainEntities.organizationId, orgId)]
      if (input?.tier) conditions.push(eq(brainEntities.tier, input.tier))
      return ctx.db.query.brainEntities.findMany({
        where: conditions.length > 1 ? and(...conditions) : conditions[0],
        orderBy: desc(brainEntities.updatedAt),
        limit: input?.limit ?? 50,
      })
    }),

  /** Get single runtime with full metadata */
  getRuntime: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.brainEntities.findFirst({
        where: eq(brainEntities.id, input.id),
      })
    }),

  /** Get children (Development apps bound to a Mini Brain) */
  getRuntimeBindings: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.brainEntities.findMany({
        where: eq(brainEntities.parentId, input.entityId),
      })
    }),

  /** Register endpoint URL — transitions to 'deployed' */
  registerEndpoint: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        endpoint: z.string().url(),
        healthEndpoint: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      await ctx.db
        .update(brainEntities)
        .set({
          endpoint: input.endpoint,
          healthEndpoint: input.healthEndpoint ?? null,
          status: 'deployed',
          updatedAt: new Date(),
        })
        .where(eq(brainEntities.id, input.entityId))
      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'register_endpoint',
        'brain_entity',
        input.entityId,
        {
          endpoint: input.endpoint,
        },
      )
      return { ok: true }
    }),

  /** Verify runtime — checks health, transitions to 'active' if healthy */
  verifyRuntime: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const entity = await ctx.db.query.brainEntities.findFirst({
        where: eq(brainEntities.id, input.entityId),
      })
      if (!entity) return { ok: false, message: 'Entity not found' }
      if (!entity.endpoint) return { ok: false, message: 'No endpoint registered' }

      // Check health
      const healthUrl = entity.healthEndpoint ?? `${entity.endpoint}/health`
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10_000)
        const res = await fetch(healthUrl, { signal: controller.signal })
        clearTimeout(timeout)

        if (!res.ok) return { ok: false, message: `Health returned ${res.status}` }

        const data = (await res.json()) as { status?: string }
        if (data.status !== 'ok' && data.status !== 'degraded') {
          return { ok: false, message: `Health status: ${data.status ?? 'unknown'}` }
        }

        await ctx.db
          .update(brainEntities)
          .set({ status: 'active', lastHealthCheck: new Date(), updatedAt: new Date() })
          .where(eq(brainEntities.id, input.entityId))
        await auditEvent(
          ctx.db,
          ctx.session.userId,
          'verify_runtime',
          'brain_entity',
          input.entityId,
          {
            healthStatus: data.status,
          },
        )
        return { ok: true, message: 'Runtime verified and active' }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Health check failed' }
      }
    }),

  /** Suspend runtime (admin) */
  suspendRuntime: protectedProcedure
    .input(z.object({ entityId: z.string().uuid(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      await ctx.db
        .update(brainEntities)
        .set({ status: 'suspended', updatedAt: new Date() })
        .where(eq(brainEntities.id, input.entityId))
      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'suspend_runtime',
        'brain_entity',
        input.entityId,
        {
          reason: input.reason,
        },
      )
      return { ok: true }
    }),

  /** Retire runtime (admin, irreversible) */
  retireRuntime: protectedProcedure
    .input(z.object({ entityId: z.string().uuid(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      await ctx.db
        .update(brainEntities)
        .set({ status: 'retired', updatedAt: new Date() })
        .where(eq(brainEntities.id, input.entityId))
      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'retire_runtime',
        'brain_entity',
        input.entityId,
        {
          reason: input.reason,
        },
      )
      return { ok: true }
    }),

  /** Activate a suspended runtime (admin) */
  activateRuntime: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      await ctx.db
        .update(brainEntities)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(brainEntities.id, input.entityId))
      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'activate_runtime',
        'brain_entity',
        input.entityId,
      )
      return { ok: true }
    }),

  /** Update deployment metadata */
  updateDeploymentInfo: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        provider: z.string().optional(),
        ref: z.string().optional(),
        version: z.string().optional(),
        environment: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      const updates: Record<string, unknown> = { updatedAt: new Date() }
      if (input.provider) updates.deploymentProvider = input.provider
      if (input.ref) updates.deploymentRef = input.ref
      if (input.version) updates.version = input.version
      if (input.environment) updates.environment = input.environment
      updates.lastDeployedAt = new Date()

      await ctx.db.update(brainEntities).set(updates).where(eq(brainEntities.id, input.entityId))
      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'update_deployment',
        'brain_entity',
        input.entityId,
        {
          provider: input.provider,
          ref: input.ref,
          version: input.version,
        },
      )
      return { ok: true }
    }),
})
