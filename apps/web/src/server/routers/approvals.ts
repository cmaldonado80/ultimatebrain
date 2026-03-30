/**
 * Approvals Router — CRUD for approval gates in workflows.
 *
 * Approval gates act as human-in-the-loop checkpoints that pause execution
 * until explicitly approved or rejected, enforcing authorization boundaries.
 */
import { approvalGates } from '@solarc/db'
import { TRPCError } from '@trpc/server'
import { and, desc, eq, lt, ne } from 'drizzle-orm'
import { z } from 'zod'

import { protectedProcedure, router } from '../trpc'

export const approvalsRouter = router({
  pending: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.approvalGates.findMany({ where: eq(approvalGates.status, 'pending') })
  }),
  decide: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(['approved', 'denied']),
        decidedBy: z.string(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [gate] = await ctx.db
        .update(approvalGates)
        .set({
          status: input.status,
          decidedBy: input.decidedBy,
          decidedAt: new Date(),
          reason: input.reason,
        })
        .where(eq(approvalGates.id, input.id))
        .returning()
      if (!gate)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update approval gate',
        })
      return gate
    }),

  history: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.approvalGates.findMany({
        where: ne(approvalGates.status, 'pending'),
        orderBy: [desc(approvalGates.decidedAt)],
        limit: input.limit,
        offset: input.offset,
      })
    }),

  batchDecide: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string().uuid()),
        decision: z.enum(['approved', 'denied']),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const results = []
      for (const id of input.ids) {
        const [updated] = await ctx.db
          .update(approvalGates)
          .set({
            status: input.decision,
            decidedAt: new Date(),
            decidedBy: ctx.session.userId,
            reason: input.reason,
          })
          .where(and(eq(approvalGates.id, id), eq(approvalGates.status, 'pending')))
          .returning()
        if (updated) results.push(updated)
      }
      return { updated: results.length }
    }),

  expireStale: protectedProcedure.mutation(async ({ ctx }) => {
    const now = new Date()
    const expired = await ctx.db
      .update(approvalGates)
      .set({ status: 'denied', decidedAt: now, reason: 'Auto-expired' })
      .where(and(eq(approvalGates.status, 'pending'), lt(approvalGates.expiresAt, now)))
      .returning()
    return { expired: expired.length }
  }),
})
