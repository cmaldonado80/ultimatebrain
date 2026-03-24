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

vi.mock('@solarc/db', () => ({
  default: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
}))

const mockCreateSession = vi.fn()
const mockSubmitArgument = vi.fn()
const mockGetSession = vi.fn()
const mockRecord = vi.fn()
const mockCheckBudget = vi.fn()
const mockUsageSummary = vi.fn()
const mockEntityCreate = vi.fn()
const mockEntityGet = vi.fn()
const mockEntityListByTier = vi.fn()

vi.mock('../../services/platform', () => ({
  DebateEngine: vi.fn().mockImplementation(() => ({
    createSession: mockCreateSession,
    submitArgument: mockSubmitArgument,
    addEdge: vi.fn(),
    scoreArgument: vi.fn(),
    scoreSession: vi.fn().mockResolvedValue(new Map()),
    getSession: mockGetSession,
    completeSession: vi.fn(),
    cancelSession: vi.fn(),
    getElo: vi.fn(),
    leaderboard: vi.fn(),
  })),
  TokenLedgerService: vi.fn().mockImplementation(() => ({
    record: mockRecord,
    checkBudget: mockCheckBudget,
    setBudget: vi.fn(),
    usageSummary: mockUsageSummary,
    agentUsage: vi.fn(),
    dailyCostTrend: vi.fn(),
  })),
  EntityManager: vi.fn().mockImplementation(() => ({
    create: mockEntityCreate,
    activate: vi.fn(),
    suspend: vi.fn(),
    get: mockEntityGet,
    listByTier: mockEntityListByTier,
    getHierarchy: vi.fn(),
    assignAgent: vi.fn(),
    removeAgent: vi.fn(),
    getEntityAgents: vi.fn(),
    getHealth: vi.fn(),
    recordHealthCheck: vi.fn(),
    createStrategyRun: vi.fn(),
    startStrategyRun: vi.fn(),
    completeStrategyRun: vi.fn(),
    getStrategyRuns: vi.fn(),
    addRoute: vi.fn(),
    getRoutes: vi.fn(),
    deleteRoute: vi.fn(),
  })),
}))

const { platformRouter } = await import('../platform')

import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) => t.createCallerFactory(platformRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const UUID = '550e8400-e29b-41d4-a716-446655440000'
const UUID2 = '660e8400-e29b-41d4-a716-446655440000'

describe('platform router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('createDebate', () => {
    it('creates a debate session', async () => {
      const session = { id: UUID, status: 'active' }
      mockCreateSession.mockResolvedValue(session)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.createDebate({})

      expect(result).toEqual(session)
    })
  })

  describe('submitArgument', () => {
    it('submits an argument to a debate', async () => {
      const arg = { id: 'arg-1', text: 'My argument' }
      mockSubmitArgument.mockResolvedValue(arg)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.submitArgument({
        sessionId: UUID,
        agentId: UUID2,
        text: 'My argument',
      })

      expect(result).toEqual(arg)
    })

    it('rejects empty text', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.submitArgument({ sessionId: UUID, agentId: UUID2, text: '' }),
      ).rejects.toThrow()
    })
  })

  describe('recordUsage', () => {
    it('records token usage', async () => {
      const entry = { id: 'u-1', tokensIn: 100, tokensOut: 50 }
      mockRecord.mockResolvedValue(entry)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.recordUsage({
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.01,
      })

      expect(result).toEqual(entry)
    })

    it('rejects negative token count', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.recordUsage({ tokensIn: -1, tokensOut: 50, costUsd: 0.01 }),
      ).rejects.toThrow()
    })
  })

  describe('createEntity', () => {
    it('creates a brain entity', async () => {
      const entity = { id: UUID, name: 'Core Brain', tier: 'brain' }
      mockEntityCreate.mockResolvedValue(entity)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.createEntity({ name: 'Core Brain', tier: 'brain' })

      expect(result).toEqual(entity)
    })

    it('rejects empty name', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.createEntity({ name: '', tier: 'brain' })).rejects.toThrow()
    })

    it('rejects invalid tier', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.createEntity({ name: 'Test', tier: 'invalid' as any })).rejects.toThrow()
    })
  })

  describe('entitiesByTier', () => {
    it('lists entities by tier', async () => {
      const entities = [{ id: UUID, tier: 'brain' }]
      mockEntityListByTier.mockResolvedValue(entities)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.entitiesByTier()

      expect(result).toEqual(entities)
    })
  })

  describe('auth', () => {
    // TODO: re-enable when auth is wired up
    it.skip('rejects unauthenticated requests', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.entitiesByTier()).rejects.toThrow()
    })
  })
})
