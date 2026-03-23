import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

function createMockDb() {
  return {} as any
}

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

const mockDiagnose = vi.fn()
const mockHealthCheck = vi.fn()
const mockAutoHeal = vi.fn()
const mockRestartAgent = vi.fn()
const mockClearExpiredLeases = vi.fn()
const mockRequeuTicket = vi.fn()
const mockGetHealingLog = vi.fn()

vi.mock('@solarc/db', () => ({}))

vi.mock('../../services/healing', () => ({
  HealingEngine: vi.fn().mockImplementation(() => ({
    diagnose: mockDiagnose,
    healthCheck: mockHealthCheck,
    autoHeal: mockAutoHeal,
    restartAgent: mockRestartAgent,
    clearExpiredLeases: mockClearExpiredLeases,
    requeueTicket: mockRequeuTicket,
    getHealingLog: mockGetHealingLog,
  })),
}))

const { healingRouter } = await import('../healing')

import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) =>
  t.createCallerFactory(healingRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('healing router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('diagnose', () => {
    it('runs full system diagnostic', async () => {
      const report = { healthy: true, issues: [] }
      mockDiagnose.mockResolvedValue(report)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.diagnose()

      expect(mockDiagnose).toHaveBeenCalled()
      expect(result).toEqual(report)
    })

    it('rejects without a session (UNAUTHORIZED)', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.diagnose()).rejects.toThrow()
    })
  })

  describe('healthCheck', () => {
    it('returns health check output', async () => {
      const health = { status: 'ok', uptime: 12345 }
      mockHealthCheck.mockResolvedValue(health)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.healthCheck()

      expect(mockHealthCheck).toHaveBeenCalled()
      expect(result).toEqual(health)
    })
  })

  describe('autoHeal', () => {
    it('runs auto-heal and returns actions taken', async () => {
      const actions = { healed: 2, actions: ['restart-agent-1', 'clear-lease-2'] }
      mockAutoHeal.mockResolvedValue(actions)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.autoHeal()

      expect(mockAutoHeal).toHaveBeenCalled()
      expect(result).toEqual(actions)
    })
  })

  describe('restartAgent', () => {
    it('restarts a specific agent', async () => {
      mockRestartAgent.mockResolvedValue({ restarted: true })

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.restartAgent({ agentId: UUID, reason: 'stuck' })

      expect(mockRestartAgent).toHaveBeenCalledWith(UUID, 'stuck')
      expect(result).toEqual({ restarted: true })
    })

    it('rejects empty reason', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.restartAgent({ agentId: UUID, reason: '' })).rejects.toThrow()
    })

    it('rejects non-uuid agentId', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.restartAgent({ agentId: 'bad', reason: 'stuck' })).rejects.toThrow()
    })
  })

  describe('healingLog', () => {
    it('returns recent healing actions', async () => {
      const log = [{ action: 'restart', timestamp: '2025-01-01' }]
      mockGetHealingLog.mockResolvedValue(log)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.healingLog({ limit: 10 })

      expect(mockGetHealingLog).toHaveBeenCalledWith(10)
      expect(result).toEqual(log)
    })
  })
})
