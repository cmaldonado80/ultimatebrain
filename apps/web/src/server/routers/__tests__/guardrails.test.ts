import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

const mockSelect = vi.fn()
const mockFrom = vi.fn()
const mockWhere = vi.fn()
const mockOrderBy = vi.fn()
const mockLimit = vi.fn()
const mockGroupBy = vi.fn()

function createMockDb() {
  // Chain: db.select().from().where().orderBy().limit()
  // Also:  db.select().from().where().groupBy().orderBy()  (stats query)
  mockLimit.mockResolvedValue([])
  mockOrderBy.mockReturnValue({ limit: mockLimit })
  mockGroupBy.mockReturnValue({ orderBy: mockOrderBy })
  mockWhere.mockReturnValue({ orderBy: mockOrderBy, groupBy: mockGroupBy })
  mockFrom.mockReturnValue({ where: mockWhere })
  mockSelect.mockReturnValue({ from: mockFrom })

  return {
    select: mockSelect,
  } as unknown
}

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

const mockGuardrailEngine = {
  checkInput: vi.fn(),
  checkOutput: vi.fn(),
  checkTool: vi.fn(),
  check: vi.fn(),
  listRules: vi.fn(),
}

vi.mock('../../services/guardrails', () => ({
  GuardrailEngine: vi.fn().mockImplementation(() => mockGuardrailEngine),
}))

vi.mock('@solarc/db', () => ({
  guardrailLogs: {
    agentId: 'agentId',
    createdAt: 'createdAt',
    ruleName: 'ruleName',
    passed: 'passed',
  },
}))

vi.mock('@solarc/engine-contracts', () => {
  const { z } = require('zod')
  return {
    GuardrailCheckInput: z.object({
      content: z.string(),
      agentId: z.string().uuid().optional(),
      policies: z.array(z.string()).optional(),
    }),
  }
})

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
  desc: (col: string) => ({ desc: col }),
  and: (...args: unknown[]) => ({ and: args }),
  gte: (col: string, val: unknown) => ({ gte: col, val }),
  sql: (strings: TemplateStringsArray, ..._values: unknown[]) => ({ sql: strings.join('?') }),
}))

// Import after mocks are set up
const { guardrailsRouter } = await import('../guardrails')

// Minimal tRPC caller factory
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

type AnyRouter = Parameters<typeof t.createCallerFactory>[0]
const caller = (ctx: MockContext) => t.createCallerFactory(guardrailsRouter as AnyRouter)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('guardrails router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  // ── Auth ────────────────────────────────────────────────────────────────

  describe('auth', () => {
    it('rejects checkInput without a session', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.checkInput({ content: 'hello' })).rejects.toThrow()
    })

    it('rejects checkOutput without a session', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.checkOutput({ content: 'hello' })).rejects.toThrow()
    })

    it('rejects rules query without a session', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.rules()).rejects.toThrow()
    })
  })

  // ── checkInput ──────────────────────────────────────────────────────────

  describe('checkInput', () => {
    it('calls engine.checkInput and returns result', async () => {
      const expected = { passed: true, violations: [] }
      mockGuardrailEngine.checkInput.mockResolvedValue(expected)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.checkInput({ content: 'safe content' })

      expect(mockGuardrailEngine.checkInput).toHaveBeenCalledWith('safe content', {
        agentId: undefined,
      })
      expect(result).toEqual(expected)
    })

    it('passes agentId option when provided', async () => {
      const agentId = '550e8400-e29b-41d4-a716-446655440000'
      mockGuardrailEngine.checkInput.mockResolvedValue({ passed: true, violations: [] })

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await trpc.checkInput({ content: 'test', agentId })

      expect(mockGuardrailEngine.checkInput).toHaveBeenCalledWith('test', { agentId })
    })
  })

  // ── checkOutput ─────────────────────────────────────────────────────────

  describe('checkOutput', () => {
    it('calls engine.checkOutput and returns result', async () => {
      const expected = { passed: false, violations: [{ rule: 'pii', severity: 'high' }] }
      mockGuardrailEngine.checkOutput.mockResolvedValue(expected)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.checkOutput({ content: 'SSN: 123-45-6789' })

      expect(mockGuardrailEngine.checkOutput).toHaveBeenCalledWith('SSN: 123-45-6789', {
        agentId: undefined,
      })
      expect(result).toEqual(expected)
    })
  })

  // ── check (generic) ────────────────────────────────────────────────────

  describe('check', () => {
    it('calls engine.check with layer and options', async () => {
      const expected = { passed: true, violations: [] }
      mockGuardrailEngine.check.mockResolvedValue(expected)
      const agentId = '550e8400-e29b-41d4-a716-446655440000'

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.check({
        content: 'some content',
        layer: 'input',
        agentId,
        policies: ['no-pii'],
      })

      expect(mockGuardrailEngine.check).toHaveBeenCalledWith('some content', 'input', {
        agentId,
        ticketId: undefined,
        policies: ['no-pii'],
      })
      expect(result).toEqual(expected)
    })

    it('rejects invalid layer value', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.check({ content: 'x', layer: 'invalid' as string })).rejects.toThrow()
    })
  })

  // ── rules ───────────────────────────────────────────────────────────────

  describe('rules', () => {
    it('returns rules from engine', async () => {
      const rules = [{ name: 'no-pii', severity: 'high' }]
      mockGuardrailEngine.listRules.mockResolvedValue(rules)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.rules()

      expect(result).toEqual(rules)
    })
  })

  // ── logs ────────────────────────────────────────────────────────────────

  describe('logs', () => {
    it('returns logs with default limit', async () => {
      const logs = [{ id: '1', ruleName: 'no-pii' }]
      mockLimit.mockResolvedValue(logs)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.logs()

      expect(mockLimit).toHaveBeenCalledWith(100)
      expect(result).toEqual(logs)
    })

    it('filters logs by agentId', async () => {
      mockLimit.mockResolvedValue([])

      const agentId = '550e8400-e29b-41d4-a716-446655440000'
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await trpc.logs({ agentId })

      expect(mockSelect).toHaveBeenCalled()
    })

    it('rejects limit above 500', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.logs({ limit: 501 })).rejects.toThrow()
    })
  })

  // ── stats ───────────────────────────────────────────────────────────────

  describe('stats', () => {
    it('returns violation stats', async () => {
      const stats = [{ ruleName: 'no-pii', count: 5, blocked: 3 }]
      mockLimit.mockResolvedValue(stats)
      // The stats query doesn't use .limit(), it ends at .orderBy()
      mockOrderBy.mockResolvedValue(stats)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await trpc.stats()

      expect(mockSelect).toHaveBeenCalled()
    })
  })
})
