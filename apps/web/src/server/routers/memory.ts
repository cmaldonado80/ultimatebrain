/**
 * Memory Router — CRUD and promotion for the tiered memory system.
 *
 * Memory tiers: core (high-confidence facts) → recall (working memory) → archival (long-term).
 * Supports confidence scoring, promotion nominations, and bulk compaction.
 */
import type { Database } from '@solarc/db'
import { memories } from '@solarc/db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { MemoryService } from '../services/memory'
import { createEmbedFn } from '../services/memory/embed-helper'
import { protectedProcedure, router } from '../trpc'

let memService: MemoryService | null = null
function getMemoryService(db: Database) {
  const svc = (memService ??= new MemoryService(db))
  svc.setEmbedFunction(createEmbedFn(db))
  return svc
}

export const memoryRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          tier: z.enum(['core', 'recall', 'archival']).optional(),
          workspaceId: z.string().uuid().optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input?.tier) conditions.push(eq(memories.tier, input.tier))
      if (input?.workspaceId) conditions.push(eq(memories.workspaceId, input.workspaceId))
      return ctx.db.query.memories.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      })
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getMemoryService(ctx.db).get(input.id)
    }),

  store: protectedProcedure
    .input(
      z.object({
        key: z.string().min(1),
        content: z.string().min(1),
        tier: z.enum(['core', 'recall', 'archival']).optional(),
        workspaceId: z.string().uuid().optional(),
        sourceAgentId: z.string().uuid().optional(),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getMemoryService(ctx.db).store(input)
    }),

  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        tier: z.enum(['core', 'recall', 'archival']).optional(),
        workspaceId: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return getMemoryService(ctx.db).search(input.query, {
        tier: input.tier,
        workspaceId: input.workspaceId,
        limit: input.limit,
      })
    }),

  updateTier: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        tier: z.enum(['core', 'recall', 'archival']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getMemoryService(ctx.db).updateTier(input.id, input.tier)
    }),

  updateConfidence: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        confidence: z.number().min(0).max(1),
      }),
    )
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

  processPromotions: protectedProcedure.mutation(async ({ ctx }) => {
    return getMemoryService(ctx.db).processPromotions()
  }),

  tierStats: protectedProcedure.query(async ({ ctx }) => {
    return getMemoryService(ctx.db).tierStats()
  }),

  /** Run temporal confidence decay on stale memories */
  decayConfidence: protectedProcedure.mutation(async ({ ctx }) => {
    return getMemoryService(ctx.db).decayConfidence()
  }),
})
