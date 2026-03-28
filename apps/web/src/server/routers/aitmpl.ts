/**
 * AITMPL Router — component marketplace integration.
 *
 * Discover, scan, and install components from the AITMPL marketplace
 * (agents, skills, commands, hooks, MCPs, settings).
 */
import { z } from 'zod'

import type { ComponentCategory, InstallTier } from '../services/aitmpl'
import { AitmplDiscoverer, AitmplInstaller, getAllPreInstalledComponents } from '../services/aitmpl'
import { protectedProcedure, router } from '../trpc'

let _installer: AitmplInstaller | null = null
let _discoverer: AitmplDiscoverer | null = null

function getInstaller() {
  return (_installer ??= new AitmplInstaller())
}
function getDiscoverer() {
  return (_discoverer ??= new AitmplDiscoverer(getInstaller()))
}

const categoryEnum = z.enum(['agents', 'skills', 'commands', 'hooks', 'mcps', 'settings'])

export const aitmplRouter = router({
  /** List pre-installed Brain components from the catalog */
  preInstalled: protectedProcedure.query(() => {
    return getAllPreInstalledComponents()
  }),

  /** Fetch available components from a category */
  browse: protectedProcedure
    .input(z.object({ category: categoryEnum }))
    .query(async ({ input }) => {
      return getInstaller().fetchCategory(input.category as ComponentCategory)
    }),

  /** Fetch a single component by name and category */
  fetch: protectedProcedure
    .input(z.object({ name: z.string().min(1), category: categoryEnum }))
    .query(async ({ input }) => {
      return getInstaller().fetchComponent(input.name, input.category as ComponentCategory)
    }),

  /** Run security scan on a component */
  scan: protectedProcedure
    .input(z.object({ name: z.string().min(1), category: categoryEnum }))
    .mutation(async ({ input }) => {
      const component = await getInstaller().fetchComponent(
        input.name,
        input.category as ComponentCategory,
      )
      if (!component) return { error: 'Component not found' }
      return getInstaller().securityScan(component)
    }),

  /** Install a component (fetch → scan → install) */
  install: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        category: categoryEnum,
        tier: z.enum(['brain', 'mini_brain', 'development']).default('brain'),
        targetEntityId: z.string().default('brain'),
      }),
    )
    .mutation(async ({ input }) => {
      const component = await getInstaller().fetchComponent(
        input.name,
        input.category as ComponentCategory,
      )
      if (!component) return { error: 'Component not found' }
      return getInstaller().install(component, input.tier as InstallTier, input.targetEntityId)
    }),

  /** Sync the catalog (discover new/updated components) */
  syncCatalog: protectedProcedure.mutation(async () => {
    return getDiscoverer().syncCatalog()
  }),
})
