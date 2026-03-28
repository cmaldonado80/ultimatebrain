/**
 * Adaptive Layout Router — behavior-driven dashboard personalization.
 */
import { z } from 'zod'

import type { ContextSignal, UserPreferences, UserRole } from '../services/adaptive/layout-engine'
import { LayoutEngine } from '../services/adaptive/layout-engine'
import { protectedProcedure, router } from '../trpc'

let _engine: LayoutEngine | null = null
function getEngine() {
  return (_engine ??= new LayoutEngine())
}

export const adaptiveRouter = router({
  /** Get panel definitions */
  panels: protectedProcedure.query(() => {
    return getEngine().getPanelDefinitions()
  }),

  /** Get ranked panels for default user (no behavior data) */
  defaultRank: protectedProcedure
    .input(
      z
        .object({
          role: z.enum(['admin', 'operator', 'developer', 'viewer']).default('developer'),
          visibleCount: z.number().min(1).max(20).default(8),
        })
        .optional(),
    )
    .query(({ input }) => {
      const prefs: UserPreferences = {
        role: (input?.role ?? 'developer') as UserRole,
        pinnedPanels: [],
        hiddenPanels: [],
        behaviorWeights: {},
      }
      const context: ContextSignal = {
        activeIncidents: 0,
        pendingApprovals: 0,
        activeAgents: 0,
        dlqCount: 0,
        activeBrowserSessions: 0,
      }
      return getEngine().rank(prefs, [], context, { visibleCount: input?.visibleCount ?? 8 })
    }),

  /** Get current time of day classification */
  timeOfDay: protectedProcedure.query(() => {
    return { timeOfDay: getEngine().getCurrentTimeOfDay() }
  }),
})
