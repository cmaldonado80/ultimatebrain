/**
 * Skills Router — skill marketplace and capability discovery.
 *
 * Manages the skill marketplace where agents discover, compose, and acquire
 * reusable capabilities for dynamic tool and behavior extension.
 */
import type { Database } from '@solarc/db'
import { z } from 'zod'

import type { SkillCapability } from '../services/skills/marketplace'
import { SkillMarketplace } from '../services/skills/marketplace'
import { SkillSecurityScanner } from '../services/skills/scanner'
import { protectedProcedure, router } from '../trpc'

let marketplace: SkillMarketplace | null = null
function getMarketplace(db: Database) {
  return (marketplace ??= new SkillMarketplace(db))
}

export const skillsRouter = router({
  browse: protectedProcedure
    .input(
      z
        .object({
          category: z.string().optional(),
          search: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const mp = getMarketplace(ctx.db)
      let list = await mp.browse()
      if (input?.category && input.category !== 'all') {
        list = list.filter((s) => s.category === input.category)
      }
      if (input?.search) {
        const q = input.search.toLowerCase()
        list = list.filter(
          (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
        )
      }
      return list
    }),

  installed: protectedProcedure.query(async ({ ctx }) => {
    const mp = getMarketplace(ctx.db)
    return mp.getInstalled()
  }),

  install: protectedProcedure
    .input(
      z.object({
        skillId: z.string(),
        approvedPermissions: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const mp = getMarketplace(ctx.db)
      return mp.install(input.skillId, input.approvedPermissions as SkillCapability[])
    }),

  uninstall: protectedProcedure
    .input(z.object({ skillId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const mp = getMarketplace(ctx.db)
      return mp.uninstall(input.skillId)
    }),

  /** Run security scan on a skill */
  scan: protectedProcedure
    .input(z.object({ skillName: z.string(), content: z.string() }))
    .mutation(async ({ input }) => {
      const scanner = new SkillSecurityScanner()
      return scanner.scan(input.skillName, input.content)
    }),
})
