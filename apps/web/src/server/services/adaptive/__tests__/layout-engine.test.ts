import { describe, it, expect } from 'vitest'
import {
  LayoutEngine,
  type UserPreferences,
  type ContextSignal,
  type BehaviorSignal,
} from '../layout-engine'

const defaultPrefs: UserPreferences = {
  role: 'developer',
  pinnedPanels: [],
  hiddenPanels: [],
  behaviorWeights: {},
}

const defaultContext: ContextSignal = {
  activeIncidents: 0,
  pendingApprovals: 0,
  activeAgents: 5,
  dlqCount: 0,
  activeBrowserSessions: 0,
}

describe('LayoutEngine', () => {
  const engine = new LayoutEngine()

  describe('rank()', () => {
    it('should return ranked panels sorted by score', () => {
      const ranked = engine.rank(defaultPrefs, [], defaultContext)
      expect(ranked.length).toBeGreaterThan(0)
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score)
      }
    })

    it('should boost panels for admin role', () => {
      const adminPrefs: UserPreferences = { ...defaultPrefs, role: 'admin' }
      const ranked = engine.rank(adminPrefs, [], defaultContext)
      const security = ranked.find((p) => p.id === 'security')
      const devRanked = engine.rank(defaultPrefs, [], defaultContext)
      const devSecurity = devRanked.find((p) => p.id === 'security')
      expect(security!.breakdown.role).toBeGreaterThan(devSecurity!.breakdown.role)
    })

    it('should boost panels based on behavior signals', () => {
      const behaviors: BehaviorSignal[] = [
        { panelId: 'memory_graph', openCount: 50, totalSeconds: 3000, interactionCount: 100 },
      ]
      const ranked = engine.rank(defaultPrefs, behaviors, defaultContext)
      const memory = ranked.find((p) => p.id === 'memory_graph')
      expect(memory!.breakdown.behavior).toBeGreaterThan(0)
    })

    it('should boost ops panels during active incidents', () => {
      const incidentCtx: ContextSignal = { ...defaultContext, activeIncidents: 3 }
      const ranked = engine.rank(defaultPrefs, [], incidentCtx)
      const opsHealth = ranked.find((p) => p.id === 'ops_health')
      const normalRanked = engine.rank(defaultPrefs, [], defaultContext)
      const normalOps = normalRanked.find((p) => p.id === 'ops_health')
      expect(opsHealth!.breakdown.context).toBeGreaterThan(normalOps!.breakdown.context)
    })

    it('should always show pinned panels', () => {
      const prefs: UserPreferences = { ...defaultPrefs, pinnedPanels: ['dlq'] }
      const ranked = engine.rank(prefs, [], defaultContext)
      const dlq = ranked.find((p) => p.id === 'dlq')
      expect(dlq!.isPinned).toBe(true)
      expect(dlq!.isVisible).toBe(true)
    })

    it('should filter out hidden panels', () => {
      const prefs: UserPreferences = { ...defaultPrefs, hiddenPanels: ['presence'] }
      const ranked = engine.rank(prefs, [], defaultContext)
      const visible = ranked.filter((p) => p.isVisible)
      expect(visible.every((p) => p.id !== 'presence')).toBe(true)
    })
  })

  describe('togglePin()', () => {
    it('should pin an unpinned panel', () => {
      const result = engine.togglePin(defaultPrefs, 'metrics')
      expect(result.pinnedPanels).toContain('metrics')
    })

    it('should unpin a pinned panel', () => {
      const prefs: UserPreferences = { ...defaultPrefs, pinnedPanels: ['metrics'] }
      const result = engine.togglePin(prefs, 'metrics')
      expect(result.pinnedPanels).not.toContain('metrics')
    })
  })

  describe('toggleHidden()', () => {
    it('should hide a visible panel', () => {
      const result = engine.toggleHidden(defaultPrefs, 'presence')
      expect(result.hiddenPanels).toContain('presence')
    })

    it('should show a hidden panel', () => {
      const prefs: UserPreferences = { ...defaultPrefs, hiddenPanels: ['presence'] }
      const result = engine.toggleHidden(prefs, 'presence')
      expect(result.hiddenPanels).not.toContain('presence')
    })
  })

  describe('getPanelDefinitions()', () => {
    it('should return all panel definitions', () => {
      const panels = engine.getPanelDefinitions()
      expect(panels.length).toBeGreaterThan(10)
      expect(panels[0]).toHaveProperty('id')
      expect(panels[0]).toHaveProperty('label')
      expect(panels[0]).toHaveProperty('baseWeight')
    })
  })

  describe('getCurrentTimeOfDay()', () => {
    it('should return a valid time of day', () => {
      const tod = engine.getCurrentTimeOfDay()
      expect(['morning', 'working', 'evening', 'night']).toContain(tod)
    })
  })

  describe('resetPreferences()', () => {
    it('should clear pins and hidden panels', () => {
      const prefs: UserPreferences = {
        ...defaultPrefs,
        pinnedPanels: ['metrics', 'dlq'],
        hiddenPanels: ['presence'],
      }
      const reset = engine.resetPreferences(prefs)
      expect(reset.pinnedPanels).toEqual([])
      expect(reset.hiddenPanels).toEqual([])
    })
  })
})
