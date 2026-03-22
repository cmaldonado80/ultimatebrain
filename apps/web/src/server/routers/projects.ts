import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { projects } from '@solarc/db'
import { eq } from 'drizzle-orm'

export const projectsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.projects.findMany()
  }),
  byId: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    return ctx.db.query.projects.findFirst({ where: eq(projects.id, input.id) })
  }),
  create: publicProcedure
    .input(z.object({ name: z.string().min(1), goal: z.string().optional(), deadline: z.date().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [project] = await ctx.db.insert(projects).values(input).returning()
      return project
    }),
})
