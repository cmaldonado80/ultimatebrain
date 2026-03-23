import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { SkillMarketplace } from '../services/skills/marketplace'

let marketplace: SkillMarketplace | null = null
function getMarketplace(db: any) { return marketplace ??= new SkillMarketplace(db) }

export const skillsRouter = router({
  browse: publicProcedure
    .input(z.object({
      category: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const mp = getMarketplace(ctx.db)
      let list = await mp.browse()
      if (input?.category && input.category !== 'all') {
        list = list.filter((s) => s.category === input.category)
      }
      if (input?.search) {
        const q = input.search.toLowerCase()
        list = list.filter((s) =>
          s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
        )
      }
      return list
    }),

  installed: publicProcedure.query(async ({ ctx }) => {
    const mp = getMarketplace(ctx.db)
    return mp.getInstalled()
  }),

  install: publicProcedure
    .input(z.object({
      skillId: z.string(),
      approvedPermissions: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const mp = getMarketplace(ctx.db)
      return mp.install(input.skillId, input.approvedPermissions as any)
    }),

  uninstall: publicProcedure
    .input(z.object({ skillId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const mp = getMarketplace(ctx.db)
      return mp.uninstall(input.skillId)
    }),
})
