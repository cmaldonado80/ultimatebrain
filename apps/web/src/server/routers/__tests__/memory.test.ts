import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

const mockFindMany = vi.fn()

function createMockDb() {
  return {
    query: {
      memories: {
        findMany: mockFindMany,
      },
    },
  } as any
}

// ---------------------------------------------------------------------------
// Mock service layer
// ---------------------------------------------------------------------------

const mockMemoryService = {
  get: vi.fn(),
  store: vi.fn(),
  search: vi.fn(),
  updateTier: vi.fn(),
  updateConfidence: vi.fn(),
  delete: vi.fn(),
  nominateForPromotion: vi.fn(),
  processPromotions: vi.fn(),
  tierStats: vi.fn(),
}

vi.mock('../../services/memory', () => ({
  MemoryService: vi.fn().mockImplementation(() => mockMemoryService),
}))

vi.mock('@solarc/db', () => ({
  memories: { tier: 'tier', workspaceId: 'workspaceId' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
  and: (...conds: any[]) => ({ and: conds }),
}))

// Import after mocks are set up
const { memoryRouter } = await import('../memory')

// Minimal tRPC caller factory
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) =>
  t.createCallerFactory(memoryRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID1 = '550e8400-e29b-41d4-a716-446655440000'
const UUID2 = '660e8400-e29b-41d4-a716-446655440001'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('memory router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('list', () => {
    it('returns all memories without filters', async () => {
      const mems = [{ id: UUID1, key: 'fact-1', tier: 'core' }]
      mockFindMany.mockResolvedValue(mems)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.list()

      expect(mockFindMany).toHaveBeenCalledWith({ where: undefined })
      expect(result).toEqual(mems)
    })

    it('filters by tier', async () => {
      mockFindMany.mockResolvedValue([])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await trpc.list({ tier: 'core' })

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { and: [{ col: 'tier', val: 'core' }] },
      })
    })

    it('filters by tier and workspaceId', async () => {
      mockFindMany.mockResolvedValue([])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await trpc.list({ tier: 'recall', workspaceId: UUID1 })

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          and: [
            { col: 'tier', val: 'recall' },
            { col: 'workspaceId', val: UUID1 },
          ],
        },
      })
    })

    it('rejects invalid tier value', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.list({ tier: 'invalid' as any })).rejects.toThrow()
    })

    it('rejects unauthenticated calls', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.list()).rejects.toThrow()
    })
  })

  describe('store', () => {
    it('stores a new memory entry', async () => {
      const input = { key: 'user-preference', content: 'Prefers dark mode', tier: 'core' as const }
      const stored = { id: UUID1, ...input }
      mockMemoryService.store.mockResolvedValue(stored)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.store(input)

      expect(mockMemoryService.store).toHaveBeenCalledWith(input)
      expect(result).toEqual(stored)
    })

    it('rejects empty key', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.store({ key: '', content: 'some content' }),
      ).rejects.toThrow()
    })

    it('rejects empty content', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.store({ key: 'k', content: '' }),
      ).rejects.toThrow()
    })

    it('rejects unauthenticated calls', async () => {
      const trpc = caller({ db, session: null })
      await expect(
        trpc.store({ key: 'k', content: 'c' }),
      ).rejects.toThrow()
    })
  })

  describe('search', () => {
    it('searches memories by query string', async () => {
      const results = [{ id: UUID1, key: 'fact', content: 'TypeScript is typed JS', score: 0.95 }]
      mockMemoryService.search.mockResolvedValue(results)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.search({ query: 'typescript', limit: 10 })

      expect(mockMemoryService.search).toHaveBeenCalledWith('typescript', {
        tier: undefined,
        workspaceId: undefined,
        limit: 10,
      })
      expect(result).toEqual(results)
    })

    it('rejects empty query', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.search({ query: '' })).rejects.toThrow()
    })
  })

  describe('delete', () => {
    it('deletes a memory by id', async () => {
      mockMemoryService.delete.mockResolvedValue({ success: true })

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.delete({ id: UUID1 })

      expect(mockMemoryService.delete).toHaveBeenCalledWith(UUID1)
      expect(result).toEqual({ success: true })
    })

    it('rejects non-uuid id', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.delete({ id: 'not-a-uuid' })).rejects.toThrow()
    })
  })

  describe('nominate', () => {
    it('nominates a memory for promotion', async () => {
      mockMemoryService.nominateForPromotion.mockResolvedValue({ nominated: true })

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.nominate({ memoryId: UUID1 })

      expect(mockMemoryService.nominateForPromotion).toHaveBeenCalledWith(UUID1)
      expect(result).toEqual({ nominated: true })
    })

    it('rejects non-uuid memoryId', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.nominate({ memoryId: 'bad-id' })).rejects.toThrow()
    })
  })

  describe('processPromotions', () => {
    it('processes pending promotions', async () => {
      const stats = { promoted: 3, skipped: 1 }
      mockMemoryService.processPromotions.mockResolvedValue(stats)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.processPromotions()

      expect(mockMemoryService.processPromotions).toHaveBeenCalled()
      expect(result).toEqual(stats)
    })

    it('rejects unauthenticated calls', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.processPromotions()).rejects.toThrow()
    })
  })
})
