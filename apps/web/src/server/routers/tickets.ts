/**
 * Tickets Router — CRUD and lifecycle operations for execution tickets.
 *
 * Tickets are the primary work unit: created by users or A2A, assigned to agents,
 * and executed through the ModeRouter pipeline (quick/autonomous/deep_work).
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure, protectedProcedure } from '../trpc'
import { tickets, ticketStatusHistory } from '@solarc/db'
import { eq } from 'drizzle-orm'

export const ticketsRouter = router({
  list: publicProcedure
    .input(z.object({ workspaceId: z.string().uuid().optional(), status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.tickets.findMany({
        where: input?.workspaceId ? eq(tickets.workspaceId, input.workspaceId) : undefined,
      })
    }),
  byId: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    return ctx.db.query.tickets.findFirst({ where: eq(tickets.id, input.id) })
  }),
  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      complexity: z.enum(['easy', 'medium', 'hard', 'critical']).optional(),
      executionMode: z.enum(['quick', 'autonomous', 'deep_work']).optional(),
      workspaceId: z.string().uuid().optional(),
      assignedAgentId: z.string().uuid().optional(),
      projectId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [ticket] = await ctx.db.insert(tickets).values(input).returning()
      return ticket
    }),
  updateStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid(), status: z.enum(['backlog', 'queued', 'in_progress', 'review', 'done', 'failed', 'cancelled']) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.tickets.findFirst({ where: eq(tickets.id, input.id) })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' })
      await ctx.db.insert(ticketStatusHistory).values({
        ticketId: input.id,
        fromStatus: existing.status,
        toStatus: input.status,
      })
      const [updated] = await ctx.db.update(tickets).set({ status: input.status, updatedAt: new Date() }).where(eq(tickets.id, input.id)).returning()
      return updated
    }),
})
