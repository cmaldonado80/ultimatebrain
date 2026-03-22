import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { memories } from '@solarc/db'
import { eq } from 'drizzle-orm'

export const memoryRouter = router({
  list: publicProcedure
    .input(z.object({ tier: z.enum(['core', 'recall', 'archival']).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.memories.findMany({
        where: input?.tier ? eq(memories.tier, input.tier) : undefined,
      })
    }),
  store: publicProcedure
    .input(z.object({
      key: z.string().min(1),
      content: z.string().min(1),
      tier: z.enum(['core', 'recall', 'archival']).optional(),
      workspaceId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [mem] = await ctx.db.insert(memories).values(input).returning()
      return mem
    }),
})
