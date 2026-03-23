import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { memories } from '@solarc/db'
import { eq } from 'drizzle-orm'
import { MemoryService } from '../services/memory'

let memService: MemoryService | null = null
function getMemoryService(db: any) { return memService ??= new MemoryService(db) }

export const memoryRouter = router({
  list: protectedProcedure
    .input(z.object({
      tier: z.enum(['core', 'recall', 'archival']).optional(),
      workspaceId: z.string().uuid().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input?.tier) conditions.push(eq(memories.tier, input.tier))
      if (input?.workspaceId) conditions.push(eq(memories.workspaceId, input.workspaceId))
      return ctx.db.query.memories.findMany({
        where: input?.tier ? eq(memories.tier, input.tier) : undefined,
      })
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getMemoryService(ctx.db).get(input.id)
    }),

  store: protectedProcedure
    .input(z.object({
      key: z.string().min(1),
      content: z.string().min(1),
      tier: z.enum(['core', 'recall', 'archival']).optional(),
      workspaceId: z.string().uuid().optional(),
      sourceAgentId: z.string().uuid().optional(),
      confidence: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getMemoryService(ctx.db).store(input)
    }),

  search: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      tier: z.enum(['core', 'recall', 'archival']).optional(),
      workspaceId: z.string().uuid().optional(),
      limit: z.number().min(1).max(100).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return getMemoryService(ctx.db).search(input.query, {
        tier: input.tier,
        workspaceId: input.workspaceId,
        limit: input.limit,
      })
    }),

  updateTier: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      tier: z.enum(['core', 'recall', 'archival']),
    }))
    .mutation(async ({ ctx, input }) => {
      return getMemoryService(ctx.db).updateTier(input.id, input.tier)
    }),

  updateConfidence: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      confidence: z.number().min(0).max(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return getMemoryService(ctx.db).updateConfidence(input.id, input.confidence)
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getMemoryService(ctx.db).delete(input.id)
    }),

  nominate: protectedProcedure
    .input(z.object({ memoryId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getMemoryService(ctx.db).nominateForPromotion(input.memoryId)
    }),

  processPromotions: protectedProcedure
    .mutation(async ({ ctx }) => {
      return getMemoryService(ctx.db).processPromotions()
    }),

  tierStats: protectedProcedure.query(async ({ ctx }) => {
    return getMemoryService(ctx.db).tierStats()
  }),
})
