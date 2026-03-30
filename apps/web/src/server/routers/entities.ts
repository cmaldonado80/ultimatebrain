/**
 * Entities Router — CRUD for brain knowledge-base entities.
 *
 * Brain entities represent structured knowledge items (facts, concepts, relationships)
 * that agents reference during reasoning and execution.
 */
import { brainEntities } from '@solarc/db'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { protectedProcedure, router } from '../trpc'

export const entitiesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.brainEntities.findMany({
        limit: input.limit,
        offset: input.offset,
      })
    }),
  byTier: protectedProcedure
    .input(z.object({ tier: z.enum(['brain', 'mini_brain', 'development']) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.brainEntities.findMany({
        where: eq(brainEntities.tier, input.tier),
        limit: 200,
      })
    }),
  topology: protectedProcedure.query(async ({ ctx }) => {
    const all = await ctx.db.query.brainEntities.findMany({ limit: 500 })
    const brain = all.filter((e) => e.tier === 'brain')
    const miniBrains = all.filter((e) => e.tier === 'mini_brain')
    const developments = all.filter((e) => e.tier === 'development')
    return { brain, miniBrains, developments }
  }),

  /** Get OpenClaw daemon status (connection, version, capability counts). */
  openclawHealth: protectedProcedure.query(async () => {
    const { getOpenClawStatus } = await import('../adapters/openclaw/bootstrap')
    return getOpenClawStatus()
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const entity = await ctx.db.query.brainEntities.findFirst({
        where: eq(brainEntities.id, input.id),
      })
      if (!entity) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entity not found' })
      return entity
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        status: z.enum(['provisioning', 'active', 'suspended', 'retired']).optional(),
        endpoint: z.string().optional(),
        config: z.unknown().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input
      const [updated] = await ctx.db
        .update(brainEntities)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(brainEntities.id, id))
        .returning()
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entity not found' })
      return updated
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(brainEntities).where(eq(brainEntities.id, input.id))
      return { deleted: true }
    }),
})
