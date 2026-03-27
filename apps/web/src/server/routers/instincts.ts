/**
 * Instincts Router — behavioral pattern learning system.
 *
 * Instincts are learned trigger→action patterns with confidence scoring,
 * scope promotion (development → mini_brain → brain), and evolution into skills.
 */
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { instincts, instinctObservations } from '@solarc/db'
import { eq, desc, and } from 'drizzle-orm'

export const instinctsRouter = router({
  /** List all instincts, optionally filtered by scope or domain */
  list: protectedProcedure
    .input(
      z
        .object({
          scope: z.enum(['development', 'mini_brain', 'brain']).optional(),
          domain: z.string().optional(),
          limit: z.number().min(1).max(200).default(100),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input?.scope) conditions.push(eq(instincts.scope, input.scope))
      if (input?.domain) conditions.push(eq(instincts.domain, input.domain))
      return ctx.db.query.instincts.findMany({
        where:
          conditions.length > 0
            ? conditions.length === 1
              ? conditions[0]
              : and(...conditions)
            : undefined,
        orderBy: desc(instincts.confidence),
        limit: input?.limit ?? 100,
      })
    }),

  /** Get a single instinct by ID */
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.instincts.findFirst({ where: eq(instincts.id, input.id) })
    }),

  /** List observations for an instinct */
  observations: protectedProcedure
    .input(
      z.object({ instinctId: z.string().uuid(), limit: z.number().min(1).max(100).default(50) }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.instinctObservations.findMany({
        where: eq(instinctObservations.instinctId, input.instinctId),
        orderBy: desc(instinctObservations.createdAt),
        limit: input.limit,
      })
    }),

  /** Manually create an instinct */
  create: protectedProcedure
    .input(
      z.object({
        trigger: z.string().min(1),
        action: z.string().min(1),
        domain: z.string().default('universal'),
        scope: z.enum(['development', 'mini_brain', 'brain']).default('development'),
        entityId: z.string().uuid().optional(),
        confidence: z.number().min(0).max(1).default(0.3),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [inst] = await ctx.db.insert(instincts).values(input).returning()
      return inst
    }),

  /** Update confidence for an instinct */
  updateConfidence: protectedProcedure
    .input(z.object({ id: z.string().uuid(), confidence: z.number().min(0).max(1) }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(instincts)
        .set({ confidence: input.confidence, updatedAt: new Date() })
        .where(eq(instincts.id, input.id))
        .returning()
      return updated
    }),

  /** Delete an instinct */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(instincts).where(eq(instincts.id, input.id))
      return { deleted: true }
    }),
})
