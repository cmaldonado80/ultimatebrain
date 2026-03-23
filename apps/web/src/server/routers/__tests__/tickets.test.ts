import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

const mockFindMany = vi.fn()
const mockFindFirst = vi.fn()
const mockInsertReturning = vi.fn()
const mockUpdateReturning = vi.fn()

function createMockDb() {
  return {
    query: {
      tickets: {
        findMany: mockFindMany,
        findFirst: mockFindFirst,
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mockInsertReturning,
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: mockUpdateReturning,
        }),
      }),
    }),
  } as any
}

// ---------------------------------------------------------------------------
// Mock trpc + router setup
// ---------------------------------------------------------------------------

// We re-create a minimal caller by importing the actual router and using
// a mock context.  If the project's trpc setup is not directly importable
// in the test environment we fall back to testing the logic in isolation.

vi.mock('@solarc/db', () => ({
  tickets: { workspaceId: 'workspaceId', id: 'id', status: 'status' },
  ticketStatusHistory: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
}))

// Import after mocks are set up
const { ticketsRouter } = await import('../tickets')

// Minimal tRPC caller factory
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

// We wrap the router in a fresh tRPC instance to create a caller
const caller = (ctx: MockContext) =>
  t.createCallerFactory(ticketsRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tickets router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('list', () => {
    it('returns all tickets when no filter is provided', async () => {
      const tickets = [
        { id: '1', title: 'Fix bug', status: 'backlog' },
        { id: '2', title: 'Add feature', status: 'in_progress' },
      ]
      mockFindMany.mockResolvedValue(tickets)

      const trpc = caller({ db, session: null })
      const result = await trpc.list()

      expect(mockFindMany).toHaveBeenCalledWith({ where: undefined })
      expect(result).toEqual(tickets)
    })

    it('filters by workspaceId when provided', async () => {
      const wsId = '550e8400-e29b-41d4-a716-446655440000'
      mockFindMany.mockResolvedValue([])

      const trpc = caller({ db, session: null })
      await trpc.list({ workspaceId: wsId })

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { col: 'workspaceId', val: wsId },
      })
    })
  })

  describe('byId', () => {
    it('returns a single ticket', async () => {
      const ticket = { id: '550e8400-e29b-41d4-a716-446655440000', title: 'Test' }
      mockFindFirst.mockResolvedValue(ticket)

      const trpc = caller({ db, session: null })
      const result = await trpc.byId({ id: ticket.id })

      expect(result).toEqual(ticket)
    })
  })

  describe('create', () => {
    it('creates a ticket and returns it', async () => {
      const input = { title: 'New ticket', priority: 'high' as const }
      const created = { id: 'new-id', ...input, status: 'backlog' }
      mockInsertReturning.mockResolvedValue([created])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.create(input)

      expect(result).toEqual(created)
    })

    it('rejects creation without a session (UNAUTHORIZED)', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.create({ title: 'Nope' })).rejects.toThrow()
    })

    it('rejects creation with empty title', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.create({ title: '' })).rejects.toThrow()
    })
  })

  describe('updateStatus', () => {
    it('updates status and records history', async () => {
      const existing = { id: '550e8400-e29b-41d4-a716-446655440000', status: 'backlog' }
      mockFindFirst.mockResolvedValue(existing)
      const updated = { ...existing, status: 'in_progress' }
      mockUpdateReturning.mockResolvedValue([updated])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.updateStatus({ id: existing.id, status: 'in_progress' })

      expect(result).toEqual(updated)
      // Verify insert was called for status history
      expect(db.insert).toHaveBeenCalled()
    })

    it('throws NOT_FOUND when ticket does not exist', async () => {
      mockFindFirst.mockResolvedValue(undefined)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.updateStatus({ id: '550e8400-e29b-41d4-a716-446655440000', status: 'done' }),
      ).rejects.toThrow(/not found/i)
    })
  })
})
