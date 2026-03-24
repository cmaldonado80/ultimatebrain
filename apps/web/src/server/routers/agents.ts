/**
 * Agents Router — CRUD for AI agent instances.
 *
 * Agents have types (executor/reviewer/planner/specialist), belong to workspaces,
 * and are assigned to tickets for execution. Supports capability and model configuration.
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc'
import { agents } from '@solarc/db'
import { eq } from 'drizzle-orm'

export const agentsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.agents.findMany({
        limit: input.limit,
        offset: input.offset,
      })
    }),
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.agents.findFirst({ where: eq(agents.id, input.id) })
    }),
  byWorkspace: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.agents.findMany({
        where: eq(agents.workspaceId, input.workspaceId),
        limit: input.limit,
        offset: input.offset,
      })
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.string().optional(),
        workspaceId: z.string().uuid().optional(),
        model: z.string().optional(),
        description: z.string().optional(),
        skills: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [agent] = await ctx.db.insert(agents).values(input).returning()
      if (!agent)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create agent' })
      return agent
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.agents.findFirst({ where: eq(agents.id, input.id) })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' })
      await ctx.db.delete(agents).where(eq(agents.id, input.id))
      return { deleted: true }
    }),
})
