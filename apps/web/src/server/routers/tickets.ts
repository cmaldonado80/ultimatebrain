/**
 * Tickets Router — CRUD and lifecycle operations for execution tickets.
 *
 * Tickets are the primary work unit: created by users or A2A, assigned to agents,
 * and executed through the ModeRouter pipeline (quick/autonomous/deep_work).
 */
import { tickets, ticketStatusHistory } from '@solarc/db'
import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { eventBus } from '../services/orchestration/event-bus'
import { protectedProcedure, router } from '../trpc'

export const ticketsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.string().uuid().optional(),
          status: z
            .enum(['backlog', 'queued', 'in_progress', 'review', 'done', 'failed', 'cancelled'])
            .optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input?.workspaceId) conditions.push(eq(tickets.workspaceId, input.workspaceId))
      if (input?.status) conditions.push(eq(tickets.status, input.status))
      return ctx.db.query.tickets.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      })
    }),
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.tickets.findFirst({ where: eq(tickets.id, input.id) })
    }),
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        complexity: z.enum(['easy', 'medium', 'hard', 'critical']).optional(),
        executionMode: z.enum(['quick', 'autonomous', 'deep_work']).optional(),
        workspaceId: z.string().uuid().optional(),
        assignedAgentId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [ticket] = await ctx.db.insert(tickets).values(input).returning()
      if (!ticket)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create ticket' })
      eventBus.emit('ticket.created', { ticketId: ticket.id }).catch((err) => {
        console.error('[Tickets] Failed to emit ticket.created event:', err)
      })
      return ticket
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        complexity: z.enum(['easy', 'medium', 'hard', 'critical']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input
      const [updated] = await ctx.db
        .update(tickets)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(tickets.id, id))
        .returning()
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' })
      return updated
    }),
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum([
          'backlog',
          'queued',
          'in_progress',
          'review',
          'done',
          'failed',
          'cancelled',
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.tickets.findFirst({ where: eq(tickets.id, input.id) })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' })
      await ctx.db.insert(ticketStatusHistory).values({
        ticketId: input.id,
        fromStatus: existing.status,
        toStatus: input.status,
      })
      const [updated] = await ctx.db
        .update(tickets)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(tickets.id, input.id))
        .returning()
      return updated
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.tickets.findFirst({ where: eq(tickets.id, input.id) })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' })
      await ctx.db.delete(ticketStatusHistory).where(eq(ticketStatusHistory.ticketId, input.id))
      await ctx.db.delete(tickets).where(eq(tickets.id, input.id))
      return { deleted: true }
    }),
})
