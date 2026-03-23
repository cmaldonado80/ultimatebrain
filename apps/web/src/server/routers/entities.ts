import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { brainEntities } from '@solarc/db'
import { eq } from 'drizzle-orm'

export const entitiesRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.brainEntities.findMany({
        limit: input.limit,
        offset: input.offset,
      })
    }),
  byTier: protectedProcedure
    .input(z.object({ tier: z.enum(['brain', 'mini_brain', 'development']) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.brainEntities.findMany({ where: eq(brainEntities.tier, input.tier) })
    }),
  topology: protectedProcedure.query(async ({ ctx }) => {
    const all = await ctx.db.query.brainEntities.findMany()
    const brain = all.filter((e) => e.tier === 'brain')
    const miniBrains = all.filter((e) => e.tier === 'mini_brain')
    const developments = all.filter((e) => e.tier === 'development')
    return { brain, miniBrains, developments }
  }),
})
