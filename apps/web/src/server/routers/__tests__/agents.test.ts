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
      agents: {
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
  agents: { id: 'id', workspaceId: 'workspaceId' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
}))

// Import after mocks are set up
const { agentsRouter } = await import('../agents')

// Minimal tRPC caller factory
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) => t.createCallerFactory(agentsRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agents router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('list', () => {
    it('returns agents with default pagination', async () => {
      const agents = [
        { id: '1', name: 'Agent Alpha', type: 'coder' },
        { id: '2', name: 'Agent Beta', type: 'reviewer' },
      ]
      mockFindMany.mockResolvedValue(agents)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.list({ limit: 50, offset: 0 })

      expect(mockFindMany).toHaveBeenCalledWith({ limit: 50, offset: 0 })
      expect(result).toEqual(agents)
    })

    it('respects custom limit and offset', async () => {
      mockFindMany.mockResolvedValue([])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await trpc.list({ limit: 10, offset: 20 })

      expect(mockFindMany).toHaveBeenCalledWith({ limit: 10, offset: 20 })
    })

    it('rejects limit above 500', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.list({ limit: 600, offset: 0 })).rejects.toThrow()
    })

    it('rejects negative offset', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.list({ limit: 10, offset: -1 })).rejects.toThrow()
    })
  })

  describe('byId', () => {
    it('returns a single agent by id', async () => {
      const agent = { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Agent Alpha' }
      mockFindFirst.mockResolvedValue(agent)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.byId({ id: agent.id })

      expect(result).toEqual(agent)
    })

    it('rejects non-uuid id', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.byId({ id: 'not-a-uuid' })).rejects.toThrow()
    })
  })

  describe('byWorkspace', () => {
    it('queries agents by workspace id', async () => {
      const wsId = '550e8400-e29b-41d4-a716-446655440000'
      mockFindMany.mockResolvedValue([])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await trpc.byWorkspace({ workspaceId: wsId, limit: 50, offset: 0 })

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { col: 'workspaceId', val: wsId },
        limit: 50,
        offset: 0,
      })
    })
  })

  describe('create', () => {
    it('creates an agent and returns it', async () => {
      const input = {
        name: 'New Agent',
        type: 'coder',
        model: 'gpt-4',
        description: 'Writes code',
        skills: ['typescript', 'python'],
        tags: ['backend'],
      }
      const created = { id: 'new-id', ...input }
      mockInsertReturning.mockResolvedValue([created])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.create(input)

      expect(result).toEqual(created)
    })

    it('creates an agent with only required fields', async () => {
      const input = { name: 'Minimal Agent' }
      const created = { id: 'new-id', name: 'Minimal Agent' }
      mockInsertReturning.mockResolvedValue([created])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.create(input)

      expect(result).toEqual(created)
    })

    it('rejects creation without a session (UNAUTHORIZED)', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.create({ name: 'Nope' })).rejects.toThrow()
    })

    it('rejects creation with empty name', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.create({ name: '' })).rejects.toThrow()
    })

    it('throws INTERNAL_SERVER_ERROR when insert returns empty', async () => {
      mockInsertReturning.mockResolvedValue([undefined])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.create({ name: 'Ghost Agent' })).rejects.toThrow()
    })
  })
})
