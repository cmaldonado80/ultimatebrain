/**
 * Adaptive Layout Router — behavior-driven dashboard personalization.
 * DB-backed via user_preferences table for persistence across sessions.
 */
import { userPreferences } from '@solarc/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import type {
  ContextSignal,
  PanelId,
  UserPreferences,
  UserRole,
} from '../services/adaptive/layout-engine'
import { LayoutEngine } from '../services/adaptive/layout-engine'
import { protectedProcedure, router } from '../trpc'

let _engine: LayoutEngine | null = null
function getEngine() {
  return (_engine ??= new LayoutEngine())
}

/** Load user preferences from DB, falling back to defaults */
async function loadPreferences(
  db: unknown,
  userId: string,
  role: UserRole,
): Promise<UserPreferences> {
  try {
    const typedDb = db as import('@solarc/db').Database
    const row = await typedDb.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, userId),
    })
    if (row) {
      return {
        role,
        pinnedPanels: (row.pinnedPanels ?? []) as PanelId[],
        hiddenPanels: (row.hiddenPanels ?? []) as PanelId[],
        behaviorWeights: (row.behaviorWeights as Record<string, number>) ?? {},
      }
    }
  } catch {
    /* fall through to defaults */
  }
  return { role, pinnedPanels: [], hiddenPanels: [], behaviorWeights: {} }
}

/** Save user preferences to DB */
async function savePreferences(db: unknown, userId: string, prefs: UserPreferences): Promise<void> {
  try {
    const typedDb = db as import('@solarc/db').Database
    await typedDb
      .insert(userPreferences)
      .values({
        userId,
        pinnedPanels: prefs.pinnedPanels,
        hiddenPanels: prefs.hiddenPanels,
        behaviorWeights: prefs.behaviorWeights,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          pinnedPanels: prefs.pinnedPanels,
          hiddenPanels: prefs.hiddenPanels,
          behaviorWeights: prefs.behaviorWeights,
          updatedAt: new Date(),
        },
      })
  } catch (err) {
    console.error('[Adaptive] Failed to save preferences:', err)
  }
}

export const adaptiveRouter = router({
  /** Get panel definitions */
  panels: protectedProcedure.query(() => {
    return getEngine().getPanelDefinitions()
  }),

  /** Get ranked panels (loads user preferences from DB if available) */
  defaultRank: protectedProcedure
    .input(
      z
        .object({
          role: z.enum(['admin', 'operator', 'developer', 'viewer']).default('developer'),
          visibleCount: z.number().min(1).max(20).default(8),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const role = (input?.role ?? 'developer') as UserRole
      const prefs = await loadPreferences(ctx.db, ctx.session.userId, role)
      const context: ContextSignal = {
        activeIncidents: 0,
        pendingApprovals: 0,
        activeAgents: 0,
        dlqCount: 0,
        activeBrowserSessions: 0,
      }
      return getEngine().rank(prefs, [], context, { visibleCount: input?.visibleCount ?? 8 })
    }),

  /** Toggle pin on a panel */
  togglePin: protectedProcedure
    .input(z.object({ panelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const prefs = await loadPreferences(ctx.db, ctx.session.userId, 'developer')
      const updated = getEngine().togglePin(prefs, input.panelId as PanelId)
      await savePreferences(ctx.db, ctx.session.userId, updated)
      return { pinnedPanels: updated.pinnedPanels }
    }),

  /** Toggle hidden on a panel */
  toggleHidden: protectedProcedure
    .input(z.object({ panelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const prefs = await loadPreferences(ctx.db, ctx.session.userId, 'developer')
      const updated = getEngine().toggleHidden(prefs, input.panelId as PanelId)
      await savePreferences(ctx.db, ctx.session.userId, updated)
      return { hiddenPanels: updated.hiddenPanels }
    }),

  /** Reset preferences to defaults */
  resetPreferences: protectedProcedure.mutation(async ({ ctx }) => {
    const prefs = await loadPreferences(ctx.db, ctx.session.userId, 'developer')
    const updated = getEngine().resetPreferences(prefs)
    await savePreferences(ctx.db, ctx.session.userId, updated)
    return { reset: true }
  }),

  /** Get current time of day classification */
  timeOfDay: protectedProcedure.query(() => {
    return { timeOfDay: getEngine().getCurrentTimeOfDay() }
  }),
})
