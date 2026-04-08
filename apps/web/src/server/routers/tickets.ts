/**
 * Tickets Router — CRUD and lifecycle operations for execution tickets.
 *
 * Tickets are the primary work unit: created by users or A2A, assigned to agents,
 * and executed through the ModeRouter pipeline (quick/autonomous/deep_work).
 */
import { agents, tickets, ticketStatusHistory } from '@solarc/db'
import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { logger } from '../../lib/logger'
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
      // Smart auto-assignment: match agent to ticket content by skill/type relevance
      let assignedWorkspaceId = input.workspaceId
      let assignedAgentId = input.assignedAgentId

      // Step 1: Find best agent by matching ticket text to agent skills/type
      if (!assignedAgentId) {
        try {
          const allIdle = await ctx.db.query.agents.findMany({
            where: eq(agents.status, 'idle'),
            limit: 50,
          })

          if (allIdle.length > 0) {
            const ticketText = `${input.title} ${input.description ?? ''}`.toLowerCase()
            // Score each agent by keyword overlap with their type, name, and skills
            let bestAgent = allIdle[0]!
            let bestScore = 0

            for (const agent of allIdle) {
              let score = 0
              const agentText =
                `${agent.name} ${agent.type ?? ''} ${((agent.skills as string[]) ?? []).join(' ')}`.toLowerCase()
              // Check keyword overlap
              const keywords = ticketText.split(/\s+/).filter((w) => w.length > 3)
              for (const kw of keywords) {
                if (agentText.includes(kw)) score += 1
              }
              // Boost agents with relevant types
              if (ticketText.includes('health') && agentText.includes('engineer')) score += 3
              if (ticketText.includes('system') && agentText.includes('engineer')) score += 3
              if (ticketText.includes('design') && agentText.includes('design')) score += 3
              if (ticketText.includes('security') && agentText.includes('security')) score += 3
              if (ticketText.includes('code') && agentText.includes('engineer')) score += 3
              if (ticketText.includes('build') && agentText.includes('engineer')) score += 2
              if (ticketText.includes('review') && agentText.includes('review')) score += 2

              if (score > bestScore) {
                bestScore = score
                bestAgent = agent
              }
            }

            assignedAgentId = bestAgent.id
            // Use the agent's workspace if user didn't specify one
            if (!assignedWorkspaceId && bestAgent.workspaceId) {
              assignedWorkspaceId = bestAgent.workspaceId
            }
          }
        } catch {
          /* best-effort */
        }
      }

      // Step 2: Fallback workspace if still unassigned
      if (!assignedWorkspaceId) {
        try {
          const firstWs = await ctx.db.query.workspaces.findFirst({
            orderBy: (t, { desc }) => [desc(t.createdAt)],
          })
          if (firstWs) assignedWorkspaceId = firstWs.id
        } catch {
          /* best-effort */
        }
      }

      const [ticket] = await ctx.db
        .insert(tickets)
        .values({
          ...input,
          workspaceId: assignedWorkspaceId,
          assignedAgentId: assignedAgentId,
        })
        .returning()
      if (!ticket)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create ticket' })
      eventBus.emit('ticket.created', { ticketId: ticket.id }).catch((err) => {
        logger.error(
          { err: err instanceof Error ? err : undefined },
          '[Tickets] Failed to emit ticket.created event',
        )
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
