import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { brainEntities } from '@solarc/db'
import { eq } from 'drizzle-orm'

export const entitiesRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.brainEntities.findMany()
  }),
  byTier: publicProcedure
    .input(z.object({ tier: z.enum(['brain', 'mini_brain', 'development']) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.brainEntities.findMany({ where: eq(brainEntities.tier, input.tier) })
    }),
  topology: publicProcedure.query(async ({ ctx }) => {
    const all = await ctx.db.query.brainEntities.findMany()
    const brain = all.filter((e) => e.tier === 'brain')
    const miniBrains = all.filter((e) => e.tier === 'mini_brain')
    const developments = all.filter((e) => e.tier === 'development')
    return { brain, miniBrains, developments }
  }),
})
