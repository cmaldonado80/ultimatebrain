import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

const mockSelect = vi.fn()
const mockFrom = vi.fn()
const mockWhere = vi.fn()
const mockOrderBy = vi.fn()
const mockLimit = vi.fn()

function createMockDb() {
  // Chain: db.select().from().where().orderBy().limit()
  mockLimit.mockResolvedValue([])
  mockOrderBy.mockReturnValue({ limit: mockLimit })
  mockWhere.mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit })
  mockFrom.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy })
  mockSelect.mockReturnValue({ from: mockFrom })

  return {
    select: mockSelect,
  } as any
}

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('@solarc/db', () => ({
  traces: {
    traceId: 'traceId',
    parentSpanId: 'parentSpanId',
    service: 'service',
    status: 'status',
    createdAt: 'createdAt',
    agentId: 'agentId',
    ticketId: 'ticketId',
    durationMs: 'durationMs',
    operation: 'operation',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
  and: (...conditions: any[]) => ({ and: conditions }),
  gte: (col: string, val: any) => ({ gte: { col, val } }),
  desc: (col: string) => ({ desc: col }),
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({ sql: strings.join('?'), values }),
}))

const { tracesRouter } = await import('../traces')

import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) => t.createCallerFactory(tracesRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('traces router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('byTraceId', () => {
    it('returns spans for a trace', async () => {
      const spans = [{ id: 's-1', traceId: 'trace-1' }]
      mockOrderBy.mockResolvedValue(spans)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.byTraceId({ traceId: 'trace-1' })

      expect(result).toEqual(spans)
    })
  })

  describe('recent', () => {
    it('returns recent root traces', async () => {
      const traces = [{ id: 't-1', service: 'agent' }]
      mockLimit.mockResolvedValue(traces)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.recent()

      expect(result).toEqual(traces)
    })
  })

  describe('byAgent', () => {
    it('returns traces for an agent', async () => {
      const traces = [{ id: 't-1', agentId: UUID }]
      mockLimit.mockResolvedValue(traces)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.byAgent({ agentId: UUID })

      expect(result).toEqual(traces)
    })

    it('rejects non-uuid agentId', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.byAgent({ agentId: 'bad' })).rejects.toThrow()
    })
  })

  describe('byTicket', () => {
    it('returns traces for a ticket', async () => {
      const traces = [{ id: 't-1', ticketId: UUID }]
      mockLimit.mockResolvedValue(traces)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.byTicket({ ticketId: UUID })

      expect(result).toEqual(traces)
    })

    it('rejects non-uuid ticketId', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.byTicket({ ticketId: 'bad' })).rejects.toThrow()
    })
  })

  describe('latencyStats', () => {
    it('returns latency statistics', async () => {
      const stats = { count: 100, avgMs: 50, p50: 40, p95: 90, p99: 120, errorRate: 0.02 }
      // latencyStats uses destructured array: const [stats] = await db.select(...)...
      mockWhere.mockResolvedValue([stats])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.latencyStats({})

      expect(result).toBeDefined()
    })
  })

  describe('auth', () => {
    // TODO: re-enable when auth is wired up
    it.skip('rejects unauthenticated requests', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.byTraceId({ traceId: 'trace-1' })).rejects.toThrow()
    })
  })
})
