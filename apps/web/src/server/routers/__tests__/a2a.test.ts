import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

function createMockDb() {
  return {} as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

const mockRegisterCard = vi.fn()
const mockGetCard = vi.fn()
const mockListCards = vi.fn()
const mockRemoveCard = vi.fn()
const mockDiscover = vi.fn()
const mockDelegate = vi.fn()
const mockAccept = vi.fn()
const mockReject = vi.fn()

vi.mock('@solarc/db', () => ({}))

vi.mock('../../services/a2a', () => ({
  A2AEngine: vi.fn().mockImplementation(() => ({
    registerCard: mockRegisterCard,
    getCard: mockGetCard,
    listCards: mockListCards,
    removeCard: mockRemoveCard,
    discover: mockDiscover,
    delegate: mockDelegate,
    accept: mockAccept,
    reject: mockReject,
    complete: vi.fn(),
    fail: vi.fn(),
    getStatus: vi.fn(),
    pendingFor: vi.fn(),
  })),
  AgentCardGenerator: vi.fn().mockImplementation(() => ({
    generateForAgent: vi.fn(),
    persistCard: vi.fn(),
    generateAll: vi.fn(),
  })),
  A2ARegistry: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    list: vi.fn(),
    findBySkill: vi.fn(),
    runHealthChecks: vi.fn(),
    deregister: vi.fn(),
  })),
}))

const { a2aRouter } = await import('../a2a')

import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

type AnyRouter = Parameters<typeof t.createCallerFactory>[0]
const caller = (ctx: MockContext) => t.createCallerFactory(a2aRouter as AnyRouter)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('a2a router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('registerCard', () => {
    it('registers a card for an agent', async () => {
      const card = { agentId: '550e8400-e29b-41d4-a716-446655440000', capabilities: { code: true } }
      mockRegisterCard.mockResolvedValue({ id: 'card-1', ...card })

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.registerCard({
        agentId: card.agentId,
        capabilities: card.capabilities,
      })

      expect(mockRegisterCard).toHaveBeenCalled()
      expect(result).toEqual({ id: 'card-1', ...card })
    })

    it('rejects without a session (UNAUTHORIZED)', async () => {
      const trpc = caller({ db, session: null })
      await expect(
        trpc.registerCard({ agentId: '550e8400-e29b-41d4-a716-446655440000' }),
      ).rejects.toThrow()
    })
  })

  describe('card', () => {
    it('returns a card by agentId', async () => {
      const card = { id: 'card-1', agentId: '550e8400-e29b-41d4-a716-446655440000' }
      mockGetCard.mockResolvedValue(card)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.card({ agentId: card.agentId })

      expect(mockGetCard).toHaveBeenCalledWith(card.agentId)
      expect(result).toEqual(card)
    })

    it('rejects non-uuid agentId', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.card({ agentId: 'bad-id' })).rejects.toThrow()
    })
  })

  describe('cards', () => {
    it('lists all cards', async () => {
      const cards = [{ id: 'c1' }, { id: 'c2' }]
      mockListCards.mockResolvedValue(cards)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.cards()

      expect(mockListCards).toHaveBeenCalled()
      expect(result).toEqual(cards)
    })
  })

  describe('discover', () => {
    it('discovers agents by skill', async () => {
      mockDiscover.mockResolvedValue([{ agentId: 'a1', skill: 'typescript' }])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.discover({ skill: 'typescript' })

      expect(mockDiscover).toHaveBeenCalledWith('typescript')
      expect(result).toHaveLength(1)
    })

    it('rejects empty skill string', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.discover({ skill: '' })).rejects.toThrow()
    })
  })

  describe('delegate', () => {
    it('delegates a task to an agent', async () => {
      const input = { agentId: 'agent-1', task: 'write tests' }
      mockDelegate.mockResolvedValue({ delegationId: 'd-1', status: 'pending' })

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.delegate(input)

      expect(mockDelegate).toHaveBeenCalledWith(input)
      expect(result).toEqual({ delegationId: 'd-1', status: 'pending' })
    })

    it('rejects empty task string', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.delegate({ agentId: 'agent-1', task: '' })).rejects.toThrow()
    })
  })
})
