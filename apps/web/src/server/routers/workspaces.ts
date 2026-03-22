import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { workspaces } from '@solarc/db'
import { eq } from 'drizzle-orm'

export const workspacesRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.workspaces.findMany()
  }),
  byId: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    return ctx.db.query.workspaces.findFirst({ where: eq(workspaces.id, input.id) })
  }),
  create: publicProcedure
    .input(z.object({ name: z.string().min(1), type: z.string().optional(), goal: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [ws] = await ctx.db.insert(workspaces).values(input).returning()
      return ws
    }),
})
