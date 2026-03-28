/**
 * Projects Router — CRUD for workspace project organization.
 *
 * Projects group related agents, tickets, and resources within a workspace
 * for scoped management and access control.
 */
import { projects } from '@solarc/db'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { protectedProcedure, router } from '../trpc'

export const projectsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.projects.findMany({
        limit: input.limit,
        offset: input.offset,
      })
    }),
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.projects.findFirst({ where: eq(projects.id, input.id) })
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        goal: z.string().optional(),
        deadline: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [project] = await ctx.db.insert(projects).values(input).returning()
      if (!project)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create project' })
      return project
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        goal: z.string().optional(),
        status: z.enum(['planning', 'active', 'completed', 'cancelled']).optional(),
        deadline: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input
      const [updated] = await ctx.db
        .update(projects)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning()
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' })
      return updated
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db.delete(projects).where(eq(projects.id, input.id)).returning()
      if (!deleted) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' })
      return { id: deleted.id }
    }),
})
