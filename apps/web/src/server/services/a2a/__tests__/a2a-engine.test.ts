import { describe, it, expect, vi, beforeEach } from 'vitest'
import { A2AEngine } from '../a2a-engine'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@solarc/db', () => ({
  agentCards: { agentId: 'agentId' },
  agents: { id: 'id', skills: 'skills', name: 'name' },
  a2aDelegations: {
    id: 'id',
    fromAgentId: 'fromAgentId',
    toAgentId: 'toAgentId',
    status: 'status',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
  and: (...conditions: unknown[]) => ({ and: conditions }),
  desc: (col: string) => ({ desc: col }),
  sql: (...args: unknown[]) => args,
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  const whereFn = vi.fn().mockReturnThis()
  const setFn = vi.fn().mockReturnValue({ where: whereFn })
  const returningFn = vi.fn().mockResolvedValue([{ id: 'mock-delegation-id' }])
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })
  const fromFn = vi.fn().mockReturnValue({ innerJoin: vi.fn().mockResolvedValue([]) })

  return {
    query: {
      agentCards: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    },
    insert: vi.fn().mockReturnValue({ values: valuesFn }),
    update: vi.fn().mockReturnValue({ set: setFn }),
    delete: vi.fn().mockReturnValue({ where: whereFn }),
    select: vi.fn().mockReturnValue({ from: fromFn }),
    _mock: { whereFn, setFn, valuesFn, fromFn, returningFn },
  } as any
}

function makeDelegateInput(overrides: Record<string, unknown> = {}) {
  return {
    agentId: 'agent-1',
    task: 'Summarize document',
    context: { docId: 'doc-123' },
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('A2AEngine', () => {
  let engine: A2AEngine
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
    engine = new A2AEngine(db)
  })

  // ── registerCard ───────────────────────────────────────────────────────

  describe('registerCard', () => {
    it('should insert a new card when none exists', async () => {
      db.query.agentCards.findFirst.mockResolvedValue(undefined)

      await engine.registerCard('agent-1', {
        capabilities: { search: true },
        endpoint: 'http://localhost:3000',
      })

      expect(db.insert).toHaveBeenCalled()
    })

    it('should update an existing card', async () => {
      db.query.agentCards.findFirst.mockResolvedValue({ agentId: 'agent-1' })

      await engine.registerCard('agent-1', {
        capabilities: { search: true, write: true },
        endpoint: 'http://localhost:4000',
      })

      expect(db.update).toHaveBeenCalled()
      expect(db._mock.setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilities: { search: true, write: true },
          endpoint: 'http://localhost:4000',
        }),
      )
    })

    it('should pass authRequirements when registering a new card', async () => {
      db.query.agentCards.findFirst.mockResolvedValue(undefined)
      const insertValuesFn = vi.fn().mockResolvedValue(undefined)
      db.insert.mockReturnValue({ values: insertValuesFn })

      await engine.registerCard('agent-2', {
        capabilities: { translate: true },
        authRequirements: { apiKey: true },
        endpoint: 'http://localhost:5000',
      })

      expect(insertValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-2',
          capabilities: { translate: true },
          authRequirements: { apiKey: true },
          endpoint: 'http://localhost:5000',
        }),
      )
    })
  })

  // ── getCard ────────────────────────────────────────────────────────────

  describe('getCard', () => {
    it('should return a card for a given agentId', async () => {
      const card = { agentId: 'agent-1', capabilities: { search: true } }
      db.query.agentCards.findFirst.mockResolvedValue(card)

      const result = await engine.getCard('agent-1')

      expect(result).toEqual(card)
      expect(db.query.agentCards.findFirst).toHaveBeenCalled()
    })

    it('should return undefined when card does not exist', async () => {
      db.query.agentCards.findFirst.mockResolvedValue(undefined)

      const result = await engine.getCard('nonexistent')

      expect(result).toBeUndefined()
    })
  })

  // ── listCards ──────────────────────────────────────────────────────────

  describe('listCards', () => {
    it('should return all registered cards joined with agents', async () => {
      const cards = [{ agentId: 'a1', capabilities: {}, agentName: 'Agent 1', agentStatus: 'idle' }]
      const innerJoinFn = vi.fn().mockResolvedValue(cards)
      const fromFn = vi.fn().mockReturnValue({ innerJoin: innerJoinFn })
      db.select.mockReturnValue({ from: fromFn })

      const result = await engine.listCards()

      expect(result).toEqual(cards)
      expect(db.select).toHaveBeenCalled()
    })
  })

  // ── discover ───────────────────────────────────────────────────────────

  describe('discover', () => {
    it('should find agents by skill match', async () => {
      const whereFn = vi
        .fn()
        .mockResolvedValue([{ id: 'agent-1', name: 'Search Agent', skills: ['search'] }])
      const fromFn = vi.fn().mockReturnValue({ where: whereFn })
      db.select.mockReturnValue({ from: fromFn })

      // listCards returns empty to avoid duplicates logic
      const innerJoinFn = vi.fn().mockResolvedValue([])
      const fromFnCards = vi.fn().mockReturnValue({ innerJoin: innerJoinFn })
      db.select.mockReturnValueOnce({ from: fromFn }).mockReturnValueOnce({ from: fromFnCards })

      const results = await engine.discover('search')

      expect(results).toHaveLength(1)
      expect(results[0]).toEqual(
        expect.objectContaining({ agentId: 'agent-1', matchType: 'skill' }),
      )
    })

    it('should find agents by card capability match', async () => {
      // skill search returns nothing
      const skillWhereFn = vi.fn().mockResolvedValue([])
      const skillFromFn = vi.fn().mockReturnValue({ where: skillWhereFn })

      // listCards returns a card with matching capability
      const innerJoinFn = vi
        .fn()
        .mockResolvedValue([
          {
            agentId: 'agent-2',
            capabilities: { translate: true },
            agentName: 'Translator',
            endpoint: 'http://localhost',
          },
        ])
      const cardsFromFn = vi.fn().mockReturnValue({ innerJoin: innerJoinFn })

      db.select
        .mockReturnValueOnce({ from: skillFromFn })
        .mockReturnValueOnce({ from: cardsFromFn })

      const results = await engine.discover('translate')

      expect(results).toHaveLength(1)
      expect(results[0]).toEqual(expect.objectContaining({ agentId: 'agent-2', matchType: 'card' }))
    })

    it('should not return duplicate agents found by both skill and card', async () => {
      const skillWhereFn = vi
        .fn()
        .mockResolvedValue([{ id: 'agent-1', name: 'Agent 1', skills: ['search'] }])
      const skillFromFn = vi.fn().mockReturnValue({ where: skillWhereFn })

      const innerJoinFn = vi
        .fn()
        .mockResolvedValue([
          {
            agentId: 'agent-1',
            capabilities: { search: true },
            agentName: 'Agent 1',
            endpoint: null,
          },
        ])
      const cardsFromFn = vi.fn().mockReturnValue({ innerJoin: innerJoinFn })

      db.select
        .mockReturnValueOnce({ from: skillFromFn })
        .mockReturnValueOnce({ from: cardsFromFn })

      const results = await engine.discover('search')

      expect(results).toHaveLength(1)
      expect(results[0].matchType).toBe('skill')
    })
  })

  // ── delegate ───────────────────────────────────────────────────────────

  describe('delegate', () => {
    it('should create a delegation and return an ID', async () => {
      const id = await engine.delegate(makeDelegateInput())

      expect(id).toBeDefined()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })

    it('should create unique IDs for each delegation', async () => {
      const id1 = await engine.delegate(makeDelegateInput())
      const id2 = await engine.delegate(makeDelegateInput({ task: 'Another task' }))

      expect(id1).not.toBe(id2)
    })
  })

  // ── State transitions ─────────────────────────────────────────────────

  describe('accept', () => {
    it('should transition delegation to accepted', async () => {
      const id = await engine.delegate(makeDelegateInput())
      await engine.accept(id)
      const status = await engine.getStatus(id)

      expect(status.status).toBe('accepted')
    })

    it('should throw for non-existent delegationId', async () => {
      await expect(engine.accept('nonexistent')).rejects.toThrow('Delegation nonexistent not found')
    })
  })

  describe('reject', () => {
    it('should transition delegation to rejected', async () => {
      const id = await engine.delegate(makeDelegateInput())
      await engine.reject(id, 'Not capable')
      const status = await engine.getStatus(id)

      expect(status.status).toBe('rejected')
      expect(status.error).toBe('Not capable')
    })

    it('should throw for non-existent delegationId', async () => {
      await expect(engine.reject('nonexistent')).rejects.toThrow('Delegation nonexistent not found')
    })
  })

  describe('markInProgress', () => {
    it('should transition delegation to in_progress', async () => {
      const id = await engine.delegate(makeDelegateInput())
      await engine.accept(id)
      await engine.markInProgress(id)
      const status = await engine.getStatus(id)

      expect(status.status).toBe('in_progress')
    })

    it('should throw for non-existent delegationId', async () => {
      await expect(engine.markInProgress('nonexistent')).rejects.toThrow(
        'Delegation nonexistent not found',
      )
    })
  })

  describe('complete', () => {
    it('should transition delegation to completed with result', async () => {
      const id = await engine.delegate(makeDelegateInput())
      await engine.accept(id)
      await engine.markInProgress(id)
      await engine.complete(id, { summary: 'Done' })
      const status = await engine.getStatus(id)

      expect(status.status).toBe('completed')
      expect(status.result).toEqual({ summary: 'Done' })
    })

    it('should throw for non-existent delegationId', async () => {
      await expect(engine.complete('nonexistent', 'result')).rejects.toThrow(
        'Delegation nonexistent not found',
      )
    })
  })

  describe('fail', () => {
    it('should transition delegation to failed with error message', async () => {
      const id = await engine.delegate(makeDelegateInput())
      await engine.accept(id)
      await engine.markInProgress(id)
      await engine.fail(id, 'Timeout exceeded')
      const status = await engine.getStatus(id)

      expect(status.status).toBe('failed')
      expect(status.error).toBe('Timeout exceeded')
    })

    it('should throw for non-existent delegationId', async () => {
      await expect(engine.fail('nonexistent', 'error')).rejects.toThrow(
        'Delegation nonexistent not found',
      )
    })
  })

  // ── getStatus ──────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('should return current status with delegationId', async () => {
      const id = await engine.delegate(makeDelegateInput())
      const status = await engine.getStatus(id)

      expect(status).toEqual({
        delegationId: id,
        status: 'pending',
        result: undefined,
        error: undefined,
      })
    })

    it('should throw for non-existent delegationId', async () => {
      await expect(engine.getStatus('nonexistent')).rejects.toThrow(
        'Delegation nonexistent not found',
      )
    })
  })

  // ── pendingFor ─────────────────────────────────────────────────────────

  describe('pendingFor', () => {
    it('should return pending delegations for a specific agent', async () => {
      await engine.delegate(makeDelegateInput({ agentId: 'pending-agent-A', task: 'Task A' }))
      await engine.delegate(makeDelegateInput({ agentId: 'pending-agent-A', task: 'Task B' }))
      await engine.delegate(makeDelegateInput({ agentId: 'pending-agent-B', task: 'Task C' }))

      const pending = await engine.pendingFor('pending-agent-A')

      expect(pending).toHaveLength(2)
      expect(pending.map((p) => p.task)).toEqual(expect.arrayContaining(['Task A', 'Task B']))
    })

    it('should not return non-pending delegations', async () => {
      const id = await engine.delegate(
        makeDelegateInput({ agentId: 'pending-agent-C', task: 'Task A' }),
      )
      await engine.accept(id)

      const pending = await engine.pendingFor('pending-agent-C')

      expect(pending).toHaveLength(0)
    })

    it('should return empty array when no pending delegations exist', async () => {
      const pending = await engine.pendingFor('agent-999')

      expect(pending).toEqual([])
    })

    it('should include context in pending delegation results', async () => {
      await engine.delegate(
        makeDelegateInput({
          agentId: 'pending-agent-D',
          task: 'Task with context',
          context: { key: 'value' },
        }),
      )

      const pending = await engine.pendingFor('pending-agent-D')

      expect(pending[0].context).toEqual({ key: 'value' })
    })
  })

  // ── removeCard ─────────────────────────────────────────────────────────

  describe('removeCard', () => {
    it('should delete the card for a given agentId', async () => {
      await engine.removeCard('agent-1')

      expect(db.delete).toHaveBeenCalled()
      expect(db._mock.whereFn).toHaveBeenCalled()
    })
  })
})
