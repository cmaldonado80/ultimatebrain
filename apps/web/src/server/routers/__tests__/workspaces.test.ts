import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

const mockFindMany = vi.fn()
const mockFindFirst = vi.fn()
const mockInsertReturning = vi.fn()

function createMockDb() {
  return {
    query: {
      workspaces: {
        findMany: mockFindMany,
        findFirst: mockFindFirst,
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mockInsertReturning,
      }),
    }),
  } as any
}

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('@solarc/db', () => ({
  workspaces: { id: 'id' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
}))

const { workspacesRouter } = await import('../workspaces')

import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) => t.createCallerFactory(workspacesRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('workspaces router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('list', () => {
    it('returns workspaces with default pagination', async () => {
      const workspaces = [{ id: '1', name: 'Workspace Alpha' }]
      mockFindMany.mockResolvedValue(workspaces)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.list({ limit: 50, offset: 0 })

      expect(mockFindMany).toHaveBeenCalledWith({ limit: 50, offset: 0 })
      expect(result).toEqual(workspaces)
    })

    it('respects custom limit and offset', async () => {
      mockFindMany.mockResolvedValue([])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await trpc.list({ limit: 10, offset: 20 })

      expect(mockFindMany).toHaveBeenCalledWith({ limit: 10, offset: 20 })
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

  describe('byId', () => {
    it('returns a workspace by id', async () => {
      const workspace = { id: UUID, name: 'Workspace Alpha' }
      mockFindFirst.mockResolvedValue(workspace)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.byId({ id: UUID })

      expect(result).toEqual(workspace)
    })

    it('rejects non-uuid id', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.byId({ id: 'not-a-uuid' })).rejects.toThrow()
    })
  })

  describe('create', () => {
    it('creates a workspace and returns it', async () => {
      const input = { name: 'New Workspace', type: 'development', goal: 'Ship features' }
      const created = { id: UUID, ...input }
      mockInsertReturning.mockResolvedValue([created])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.create(input)

      expect(result).toEqual(created)
    })

    it('creates a workspace with only required fields', async () => {
      const created = { id: UUID, name: 'Minimal' }
      mockInsertReturning.mockResolvedValue([created])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.create({ name: 'Minimal' })

      expect(result).toEqual(created)
    })

    it('rejects empty name', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.create({ name: '' })).rejects.toThrow()
    })

    it('throws when insert returns empty', async () => {
      mockInsertReturning.mockResolvedValue([undefined])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.create({ name: 'Ghost' })).rejects.toThrow()
    })
  })

  describe('auth', () => {
    // TODO: re-enable when auth is wired up
    it.skip('rejects unauthenticated requests', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.create({ name: 'Nope' })).rejects.toThrow()
    })
  })
})
