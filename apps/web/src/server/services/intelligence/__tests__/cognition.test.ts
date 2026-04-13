import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CognitionManager } from '../cognition'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@solarc/db', () => ({
  cognitionState: { id: 'id' },
  promptOverlays: { id: 'id', active: 'active', workspaceId: 'workspaceId' },
  agentTrustScores: { agentId: 'agentId' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => args,
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  const whereFn = vi.fn().mockReturnThis()
  const setFn = vi.fn().mockReturnValue({ where: whereFn })
  const returningFn = vi
    .fn()
    .mockResolvedValue([{ id: 'overlay-1', content: 'test', active: true }])
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })

  return {
    query: {
      cognitionState: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      promptOverlays: {
        findFirst: vi.fn().mockResolvedValue(undefined),
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentTrustScores: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    },
    insert: vi.fn().mockReturnValue({ values: valuesFn }),
    update: vi.fn().mockReturnValue({ set: setFn }),
    delete: vi.fn().mockReturnValue({ where: whereFn }),
    _mock: { whereFn, setFn, valuesFn, returningFn },
  } as unknown as ReturnType<typeof createMockDb>
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CognitionManager', () => {
  let manager: CognitionManager
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
    manager = new CognitionManager(db)
  })

  // ── Feature Flags ─────────────────────────────────────────────────────

  describe('getFeatures', () => {
    it('should return empty object when no state exists', async () => {
      db.query.cognitionState.findFirst.mockResolvedValue(undefined)

      const features = await manager.getFeatures()

      expect(features).toEqual({})
    })

    it('should return features from existing state', async () => {
      db.query.cognitionState.findFirst.mockResolvedValue({
        id: '1',
        features: { autoHeal: true, memorySearch: false },
      })

      const features = await manager.getFeatures()

      expect(features).toEqual({ autoHeal: true, memorySearch: false })
    })
  })

  describe('setFeature', () => {
    it('should insert new state when none exists', async () => {
      db.query.cognitionState.findFirst.mockResolvedValue(undefined)

      await manager.setFeature('autoHeal', true)

      expect(db.insert).toHaveBeenCalled()
    })

    it('should update existing state', async () => {
      db.query.cognitionState.findFirst
        .mockResolvedValueOnce({ id: '1', features: {} }) // getFeatures
        .mockResolvedValueOnce({ id: '1', features: {} }) // getState in upsertState

      await manager.setFeature('autoHeal', true)

      expect(db.update).toHaveBeenCalled()
    })
  })

  describe('isFeatureEnabled', () => {
    it('should return false for unknown feature', async () => {
      db.query.cognitionState.findFirst.mockResolvedValue({ id: '1', features: {} })

      const enabled = await manager.isFeatureEnabled('nonexistent')

      expect(enabled).toBe(false)
    })

    it('should return true for enabled feature', async () => {
      db.query.cognitionState.findFirst.mockResolvedValue({
        id: '1',
        features: { autoHeal: true },
      })

      const enabled = await manager.isFeatureEnabled('autoHeal')

      expect(enabled).toBe(true)
    })
  })

  // ── Policies ──────────────────────────────────────────────────────────

  describe('getPolicies', () => {
    it('should return empty object when no state exists', async () => {
      db.query.cognitionState.findFirst.mockResolvedValue(undefined)

      const policies = await manager.getPolicies()

      expect(policies).toEqual({})
    })
  })

  describe('setPolicy', () => {
    it('should set a policy value', async () => {
      db.query.cognitionState.findFirst
        .mockResolvedValueOnce({ id: '1', policies: {} }) // getPolicies
        .mockResolvedValueOnce({ id: '1', policies: {} }) // getState in upsertState

      await manager.setPolicy('maxRetries', 3)

      expect(db.update).toHaveBeenCalled()
    })
  })

  describe('removePolicy', () => {
    it('should remove a policy and persist', async () => {
      db.query.cognitionState.findFirst
        .mockResolvedValueOnce({ id: '1', policies: { maxRetries: 3, timeout: 5000 } })
        .mockResolvedValueOnce({ id: '1' })

      await manager.removePolicy('maxRetries')

      expect(db.update).toHaveBeenCalled()
    })
  })

  // ── Prompt Overlays ───────────────────────────────────────────────────

  describe('createOverlay', () => {
    it('should insert an overlay and return it', async () => {
      const result = await manager.createOverlay('Always respond in JSON')

      expect(db.insert).toHaveBeenCalled()
      expect(result).toEqual(expect.objectContaining({ id: 'overlay-1' }))
    })
  })

  describe('buildPromptOverlay', () => {
    it('should return empty string when no overlays exist', async () => {
      db.query.promptOverlays.findMany.mockResolvedValue([])

      const result = await manager.buildPromptOverlay()

      expect(result).toBe('')
    })

    it('should join multiple overlay contents', async () => {
      db.query.promptOverlays.findMany.mockResolvedValue([
        { content: 'Use JSON format' },
        { content: 'Be concise' },
      ])

      const result = await manager.buildPromptOverlay('ws-1')

      expect(result).toBe('Use JSON format\n\nBe concise')
    })
  })

  // ── Agent Trust Scores ────────────────────────────────────────────────

  describe('getTrustScore', () => {
    it('should return default score of 0.5 when no record exists', async () => {
      db.query.agentTrustScores.findFirst.mockResolvedValue(undefined)

      const result = await manager.getTrustScore('agent-1')

      expect(result.score).toBe(0.5)
      expect(result.factors).toBeNull()
    })

    it('should return stored score and factors', async () => {
      db.query.agentTrustScores.findFirst.mockResolvedValue({
        agentId: 'agent-1',
        score: 0.85,
        factors: {
          taskCompletionRate: 0.9,
          errorRate: 0.1,
          avgResponseTime: 2000,
          guardrailViolations: 0,
          userRating: 0.9,
        },
      })

      const result = await manager.getTrustScore('agent-1')

      expect(result.score).toBe(0.85)
      expect(result.factors).toBeDefined()
      expect(result.factors!.taskCompletionRate).toBe(0.9)
    })
  })

  describe('updateTrustScore', () => {
    it('should insert new trust score when none exists', async () => {
      db.query.agentTrustScores.findFirst.mockResolvedValue(undefined)

      await manager.updateTrustScore('agent-1', 0.8)

      expect(db.insert).toHaveBeenCalled()
    })

    it('should clamp score to 0-1 range', async () => {
      db.query.agentTrustScores.findFirst.mockResolvedValue(undefined)

      await manager.updateTrustScore('agent-1', 1.5)

      expect(db.insert).toHaveBeenCalled()
      expect(db._mock.valuesFn).toHaveBeenCalledWith(expect.objectContaining({ score: 1 }))
    })
  })

  describe('recalculateTrust', () => {
    it('should return 0.5 when no factors exist', async () => {
      db.query.agentTrustScores.findFirst.mockResolvedValue(undefined)

      const score = await manager.recalculateTrust('agent-1')

      expect(score).toBe(0.5)
    })

    it('should compute weighted score from factors', async () => {
      db.query.agentTrustScores.findFirst.mockResolvedValue({
        agentId: 'agent-1',
        score: 0.5,
        factors: {
          taskCompletionRate: 1.0,
          errorRate: 0.0,
          avgResponseTime: 1000,
          guardrailViolations: 0,
          userRating: 1.0,
        },
      })

      const score = await manager.recalculateTrust('agent-1')

      // All perfect factors should give a high score
      expect(score).toBeGreaterThan(0.8)
      expect(score).toBeLessThanOrEqual(1)
    })
  })
})
