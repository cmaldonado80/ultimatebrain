/**
 * Approvals Router — CRUD for approval gates in workflows.
 *
 * Approval gates act as human-in-the-loop checkpoints that pause execution
 * until explicitly approved or rejected, enforcing authorization boundaries.
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc'
import { approvalGates } from '@solarc/db'
import { eq } from 'drizzle-orm'

export const approvalsRouter = router({
  pending: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.approvalGates.findMany({ where: eq(approvalGates.status, 'pending') })
  }),
  decide: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['approved', 'denied']),
      decidedBy: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [gate] = await ctx.db.update(approvalGates)
        .set({ status: input.status, decidedBy: input.decidedBy, decidedAt: new Date(), reason: input.reason })
        .where(eq(approvalGates.id, input.id))
        .returning()
      if (!gate) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update approval gate' })
      return gate
    }),
})
