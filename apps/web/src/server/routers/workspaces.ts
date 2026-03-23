import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { workspaces } from '@solarc/db'
import { eq } from 'drizzle-orm'

export const workspacesRouter = router({
  list: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.workspaces.findMany({
        limit: input.limit,
        offset: input.offset,
      })
    }),
  byId: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    return ctx.db.query.workspaces.findFirst({ where: eq(workspaces.id, input.id) })
  }),
  create: publicProcedure
    .input(z.object({ name: z.string().min(1), type: z.string().optional(), goal: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [ws] = await ctx.db.insert(workspaces).values(input).returning()
      if (!ws) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create workspace' })
      return ws
    }),
})
