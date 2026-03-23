import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc'
import { projects } from '@solarc/db'
import { eq } from 'drizzle-orm'

export const projectsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.projects.findMany({
        limit: input.limit,
        offset: input.offset,
      })
    }),
  byId: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    return ctx.db.query.projects.findFirst({ where: eq(projects.id, input.id) })
  }),
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1), goal: z.string().optional(), deadline: z.date().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [project] = await ctx.db.insert(projects).values(input).returning()
      if (!project) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create project' })
      return project
    }),
})
