import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

const mockFindMany = vi.fn()
const mockInsertReturning = vi.fn()

function createMockDb() {
  return {
    query: {
      gatewayMetrics: {
        findMany: mockFindMany,
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
// Mock service layer
// ---------------------------------------------------------------------------

const mockGateway = {
  chat: vi.fn(),
  embed: vi.fn(),
  getHealth: vi.fn(),
  costTracker: {
    getUsage: vi.fn(),
    checkBudget: vi.fn(),
    setBudget: vi.fn(),
  },
  rateLimiter: {
    setAgentLimit: vi.fn(),
    getAgentCapacity: vi.fn(),
  },
  keyVault: {
    storeKey: vi.fn(),
    rotateKey: vi.fn(),
    listProviders: vi.fn(),
  },
  circuitBreaker: {
    reset: vi.fn(),
  },
  cache: {
    prune: vi.fn(),
  },
}

const mockGetPricing = vi.fn()

vi.mock('../../services/gateway', () => ({
  GatewayRouter: vi.fn().mockImplementation(() => mockGateway),
  GatewayError: class GatewayError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  },
  CostTracker: { getPricing: mockGetPricing },
}))

vi.mock('@solarc/db', () => ({
  gatewayMetrics: { id: 'id', createdAt: 'createdAt' },
}))

vi.mock('drizzle-orm', () => ({}))

const { z } = await import('zod')

vi.mock('@solarc/engine-contracts', () => ({
  LlmChatInput: z.object({
    messages: z.array(
      z.object({
        role: z.string(),
        content: z.string(),
      }),
    ),
    model: z.string().optional(),
    tools: z.array(z.unknown()).optional(),
    stream: z.boolean().optional(),
    agentId: z.string().uuid().optional(),
    ticketId: z.string().uuid().optional(),
  }),
  LlmEmbedInput: z.object({
    text: z.string().min(1),
    model: z.string().optional(),
  }),
}))

// Import after mocks are set up
const { gatewayRouter } = await import('../gateway')

// Minimal tRPC caller factory
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) =>
  t.createCallerFactory(gatewayRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID1 = '550e8400-e29b-41d4-a716-446655440000'
const authedCtx = (db: any) => ({ db, session: { userId: 'user-1' } })
const unauthCtx = (db: any) => ({ db, session: null })

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('gateway router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  // === Public Procedures ===

  describe('health', () => {
    it('returns provider health without auth', async () => {
      const health = { openai: 'healthy', anthropic: 'degraded' }
      mockGateway.getHealth.mockResolvedValue(health)

      const trpc = caller(unauthCtx(db))
      const result = await trpc.health()

      expect(mockGateway.getHealth).toHaveBeenCalled()
      expect(result).toEqual(health)
    })

    it('also works with auth', async () => {
      mockGateway.getHealth.mockResolvedValue({})

      const trpc = caller(authedCtx(db))
      const result = await trpc.health()

      expect(result).toEqual({})
    })
  })

  describe('pricing', () => {
    it('returns pricing table without auth', async () => {
      const pricing = { 'gpt-4': { input: 0.03, output: 0.06 } }
      mockGetPricing.mockReturnValue(pricing)

      const trpc = caller(unauthCtx(db))
      const result = await trpc.pricing()

      expect(mockGetPricing).toHaveBeenCalled()
      expect(result).toEqual(pricing)
    })
  })

  // === Protected Procedures ===

  describe('chat', () => {
    it('sends a chat request through the gateway', async () => {
      const response = { content: 'Hello!', model: 'gpt-4' }
      mockGateway.chat.mockResolvedValue(response)

      const trpc = caller(authedCtx(db))
      const result = await trpc.chat({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gpt-4',
      })

      expect(mockGateway.chat).toHaveBeenCalled()
      expect(result).toEqual(response)
    })

    it('rejects unauthenticated calls', async () => {
      const trpc = caller(unauthCtx(db))
      await expect(
        trpc.chat({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toThrow()
    })
  })

  describe('metrics', () => {
    it('returns metrics with default limit', async () => {
      const metrics = [{ id: '1', provider: 'openai', tokensIn: 100 }]
      mockFindMany.mockResolvedValue(metrics)

      const trpc = caller(authedCtx(db))
      const result = await trpc.metrics()

      expect(mockFindMany).toHaveBeenCalled()
      expect(result).toEqual(metrics)
    })

    it('rejects unauthenticated calls', async () => {
      const trpc = caller(unauthCtx(db))
      await expect(trpc.metrics()).rejects.toThrow()
    })
  })

  describe('record', () => {
    it('records a metric entry', async () => {
      const input = { provider: 'openai', model: 'gpt-4', tokensIn: 500, tokensOut: 200 }
      const recorded = { id: UUID1, ...input }
      mockInsertReturning.mockResolvedValue([recorded])

      const trpc = caller(authedCtx(db))
      const result = await trpc.record(input)

      expect(result).toEqual(recorded)
    })

    it('rejects unauthenticated calls', async () => {
      const trpc = caller(unauthCtx(db))
      await expect(
        trpc.record({ provider: 'openai', model: 'gpt-4' }),
      ).rejects.toThrow()
    })
  })

  describe('agentCost', () => {
    it('returns cost summary for an agent', async () => {
      const usage = { totalUsd: 12.5, totalTokens: 50000 }
      mockGateway.costTracker.getUsage.mockResolvedValue(usage)

      const trpc = caller(authedCtx(db))
      const result = await trpc.agentCost({ agentId: UUID1 })

      expect(mockGateway.costTracker.getUsage).toHaveBeenCalledWith(UUID1, 'agent')
      expect(result).toEqual(usage)
    })

    it('rejects non-uuid agentId', async () => {
      const trpc = caller(authedCtx(db))
      await expect(trpc.agentCost({ agentId: 'bad-id' })).rejects.toThrow()
    })
  })

  describe('setBudget', () => {
    it('sets budget for an agent', async () => {
      const trpc = caller(authedCtx(db))
      const result = await trpc.setBudget({
        agentId: UUID1,
        softLimitUsd: 10,
        hardLimitUsd: 50,
        period: 'daily',
      })

      expect(mockGateway.costTracker.setBudget).toHaveBeenCalledWith(UUID1, {
        softLimitUsd: 10,
        hardLimitUsd: 50,
        period: 'daily',
      })
      expect(result).toEqual({ success: true })
    })

    it('rejects non-positive limits', async () => {
      const trpc = caller(authedCtx(db))
      await expect(
        trpc.setBudget({ agentId: UUID1, softLimitUsd: -1, hardLimitUsd: 50, period: 'daily' }),
      ).rejects.toThrow()
    })
  })

  describe('storeKey', () => {
    it('stores an API key', async () => {
      mockGateway.keyVault.storeKey.mockResolvedValue(undefined)

      const trpc = caller(authedCtx(db))
      const result = await trpc.storeKey({ provider: 'openai', apiKey: 'sk-test-123' })

      expect(mockGateway.keyVault.storeKey).toHaveBeenCalledWith('openai', 'sk-test-123')
      expect(result).toEqual({ success: true })
    })

    it('rejects empty apiKey', async () => {
      const trpc = caller(authedCtx(db))
      await expect(
        trpc.storeKey({ provider: 'openai', apiKey: '' }),
      ).rejects.toThrow()
    })
  })
})
