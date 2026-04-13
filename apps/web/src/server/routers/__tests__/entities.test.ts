import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

const mockFindMany = vi.fn()

function createMockDb() {
  return {
    query: {
      brainEntities: { findMany: mockFindMany },
    },
  } as unknown
}

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('@solarc/db', () => ({
  brainEntities: { id: 'id', tier: 'tier' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
}))

const { entitiesRouter } = await import('../entities')

import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

type AnyRouter = Parameters<typeof t.createCallerFactory>[0]
const caller = (ctx: MockContext) => t.createCallerFactory(entitiesRouter as AnyRouter)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('entities router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('list', () => {
    it('returns entities with default pagination', async () => {
      const entities = [{ id: '1', name: 'Entity A', tier: 'brain' }]
      mockFindMany.mockResolvedValue(entities)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.list({ limit: 50, offset: 0 })

      expect(mockFindMany).toHaveBeenCalledWith({ limit: 50, offset: 0 })
      expect(result).toEqual(entities)
    })

    it('rejects limit above 100', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.list({ limit: 200, offset: 0 })).rejects.toThrow()
    })

    it('rejects negative offset', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.list({ limit: 10, offset: -1 })).rejects.toThrow()
    })
  })

  describe('byTier', () => {
    it('returns entities filtered by tier', async () => {
      const entities = [{ id: '1', tier: 'brain' }]
      mockFindMany.mockResolvedValue(entities)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.byTier({ tier: 'brain' })

      expect(mockFindMany).toHaveBeenCalled()
      expect(result).toEqual(entities)
    })

    it('rejects invalid tier', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.byTier({ tier: 'invalid' as string })).rejects.toThrow()
    })
  })

  describe('topology', () => {
    it('returns grouped topology', async () => {
      const all = [
        { id: '1', tier: 'brain' },
        { id: '2', tier: 'mini_brain' },
        { id: '3', tier: 'development' },
      ]
      mockFindMany.mockResolvedValue(all)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.topology()

      expect(result.brain).toEqual([{ id: '1', tier: 'brain' }])
      expect(result.miniBrains).toEqual([{ id: '2', tier: 'mini_brain' }])
      expect(result.developments).toEqual([{ id: '3', tier: 'development' }])
    })

    it('rejects without a session (UNAUTHORIZED)', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.topology()).rejects.toThrow()
    })
  })
})
