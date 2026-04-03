import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    createdAt: 'createdAt',
    task: 'task',
    context: 'context',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
  and: (...conditions: unknown[]) => ({ and: conditions }),
  desc: (col: string) => ({ desc: col }),
  lte: (col: string, val: unknown) => ({ lte: { col, val } }),
  sql: (...args: unknown[]) => args,
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  // update chain: update().set().where().returning()
  const updateReturningFn = vi.fn().mockResolvedValue([{ id: 'mock-delegation-id' }])
  const updateWhereFn = vi.fn().mockReturnValue({ returning: updateReturningFn })
  const setFn = vi.fn().mockReturnValue({ where: updateWhereFn })

  // insert chain: insert().values().returning()
  const insertReturningFn = vi.fn().mockResolvedValue([{ id: 'mock-delegation-id' }])
  const valuesFn = vi.fn().mockReturnValue({ returning: insertReturningFn })

  // delete chain: delete().where()
  const deleteWhereFn = vi.fn().mockResolvedValue(undefined)

  // select chain: select().from() -> { innerJoin, where }
  // where -> { orderBy } for pendingFor
  const orderByFn = vi.fn().mockResolvedValue([])
  const selectWhereFn = vi.fn().mockReturnValue({ orderBy: orderByFn })
  const innerJoinFn = vi.fn().mockResolvedValue([])
  const fromFn = vi.fn().mockReturnValue({ innerJoin: innerJoinFn, where: selectWhereFn })

  return {
    query: {
      agentCards: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      a2aDelegations: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    },
    insert: vi.fn().mockReturnValue({ values: valuesFn }),
    update: vi.fn().mockReturnValue({ set: setFn }),
    delete: vi.fn().mockReturnValue({ where: deleteWhereFn }),
    select: vi.fn().mockReturnValue({ from: fromFn }),
    _mock: {
      updateWhereFn,
      updateReturningFn,
      setFn,
      valuesFn,
      insertReturningFn,
      fromFn,
      deleteWhereFn,
      selectWhereFn,
      orderByFn,
      innerJoinFn,
    },
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
      const innerJoinFn = vi.fn().mockResolvedValue([
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

      const innerJoinFn = vi.fn().mockResolvedValue([
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
      expect(db.insert).toHaveBeenCalled()
    })

    it('should create unique IDs for each delegation', async () => {
      db._mock.insertReturningFn
        .mockResolvedValueOnce([{ id: 'delegation-1' }])
        .mockResolvedValueOnce([{ id: 'delegation-2' }])

      const id1 = await engine.delegate(makeDelegateInput())
      const id2 = await engine.delegate(makeDelegateInput({ task: 'Another task' }))

      expect(id1).not.toBe(id2)
    })
  })

  // ── State transitions ─────────────────────────────────────────────────

  describe('accept', () => {
    it('should call update with accepted status', async () => {
      await engine.accept('delegation-1')

      expect(db.update).toHaveBeenCalled()
      expect(db._mock.setFn).toHaveBeenCalledWith({ status: 'accepted' })
    })

    it('should throw for non-existent delegationId', async () => {
      db._mock.updateReturningFn.mockResolvedValue([])

      await expect(engine.accept('nonexistent')).rejects.toThrow('Delegation nonexistent not found')
    })
  })

  describe('reject', () => {
    it('should call update with rejected status and reason', async () => {
      await engine.reject('delegation-1', 'Not capable')

      expect(db.update).toHaveBeenCalled()
      expect(db._mock.setFn).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected', error: 'Not capable' }),
      )
    })

    it('should throw for non-existent delegationId', async () => {
      db._mock.updateReturningFn.mockResolvedValue([])

      await expect(engine.reject('nonexistent')).rejects.toThrow('Delegation nonexistent not found')
    })
  })

  describe('markInProgress', () => {
    it('should call update with in_progress status', async () => {
      await engine.markInProgress('delegation-1')

      expect(db.update).toHaveBeenCalled()
      expect(db._mock.setFn).toHaveBeenCalledWith({ status: 'in_progress' })
    })

    it('should throw for non-existent delegationId', async () => {
      db._mock.updateReturningFn.mockResolvedValue([])

      await expect(engine.markInProgress('nonexistent')).rejects.toThrow(
        'Delegation nonexistent not found',
      )
    })
  })

  describe('complete', () => {
    it('should call update with completed status and result', async () => {
      await engine.complete('delegation-1', { summary: 'Done' })

      expect(db.update).toHaveBeenCalled()
      expect(db._mock.setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          result: JSON.stringify({ summary: 'Done' }),
        }),
      )
    })

    it('should throw for non-existent delegationId', async () => {
      db._mock.updateReturningFn.mockResolvedValue([])

      await expect(engine.complete('nonexistent', 'result')).rejects.toThrow(
        'Delegation nonexistent not found',
      )
    })
  })

  describe('fail', () => {
    it('should call update with failed status and error message', async () => {
      await engine.fail('delegation-1', 'Timeout exceeded')

      expect(db.update).toHaveBeenCalled()
      expect(db._mock.setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: 'Timeout exceeded',
        }),
      )
    })

    it('should throw for non-existent delegationId', async () => {
      db._mock.updateReturningFn.mockResolvedValue([])

      await expect(engine.fail('nonexistent', 'error')).rejects.toThrow(
        'Delegation nonexistent not found',
      )
    })
  })

  // ── getStatus ──────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('should return current status with delegationId', async () => {
      db.query.a2aDelegations.findFirst.mockResolvedValue({
        id: 'delegation-1',
        status: 'pending',
        result: null,
        error: null,
      })

      const status = await engine.getStatus('delegation-1')

      expect(status).toEqual({
        delegationId: 'delegation-1',
        status: 'pending',
        result: undefined,
        error: undefined,
      })
    })

    it('should throw for non-existent delegationId', async () => {
      db.query.a2aDelegations.findFirst.mockResolvedValue(undefined)

      await expect(engine.getStatus('nonexistent')).rejects.toThrow(
        'Delegation nonexistent not found',
      )
    })
  })

  // ── pendingFor ─────────────────────────────────────────────────────────

  describe('pendingFor', () => {
    it('should return pending delegations for a specific agent', async () => {
      const orderByFn = vi.fn().mockResolvedValue([
        { id: 'del-1', task: 'Task A', context: null },
        { id: 'del-2', task: 'Task B', context: null },
      ])
      const selectWhereFn = vi.fn().mockReturnValue({ orderBy: orderByFn })
      const fromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: fromFn })

      const pending = await engine.pendingFor('pending-agent-A')

      expect(pending).toHaveLength(2)
      expect(pending.map((p) => p.task)).toEqual(expect.arrayContaining(['Task A', 'Task B']))
    })

    it('should return empty array when no pending delegations exist', async () => {
      const orderByFn = vi.fn().mockResolvedValue([])
      const selectWhereFn = vi.fn().mockReturnValue({ orderBy: orderByFn })
      const fromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: fromFn })

      const pending = await engine.pendingFor('agent-999')

      expect(pending).toEqual([])
    })

    it('should include context in pending delegation results', async () => {
      const orderByFn = vi
        .fn()
        .mockResolvedValue([{ id: 'del-1', task: 'Task with context', context: { key: 'value' } }])
      const selectWhereFn = vi.fn().mockReturnValue({ orderBy: orderByFn })
      const fromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: fromFn })

      const pending = await engine.pendingFor('pending-agent-D')

      expect(pending[0].context).toEqual({ key: 'value' })
    })
  })

  // ── removeCard ─────────────────────────────────────────────────────────

  describe('removeCard', () => {
    it('should delete the card for a given agentId', async () => {
      await engine.removeCard('agent-1')

      expect(db.delete).toHaveBeenCalled()
      expect(db._mock.deleteWhereFn).toHaveBeenCalled()
    })
  })

  // ── cancel ────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('should update status to cancelled with reason', async () => {
      await engine.cancel('delegation-1', 'No longer needed')

      expect(db.update).toHaveBeenCalled()
      expect(db._mock.setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
          error: 'No longer needed',
        }),
      )
    })

    it('should throw for non-existent or terminal delegationId', async () => {
      db._mock.updateReturningFn.mockResolvedValue([])

      await expect(engine.cancel('nonexistent')).rejects.toThrow('not found or already terminal')
    })
  })

  // ── expireStale ───────────────────────────────────────────────────────

  describe('expireStale', () => {
    it('should return count of expired delegations', async () => {
      db._mock.updateReturningFn.mockResolvedValue([{ id: 'del-1' }, { id: 'del-2' }])

      const expired = await engine.expireStale(24)
      expect(expired).toBe(2)
    })

    it('should return 0 when no stale delegations exist', async () => {
      db._mock.updateReturningFn.mockResolvedValue([])

      const expired = await engine.expireStale(24)
      expect(expired).toBe(0)
    })
  })

  // ── delegate with fromAgentId ─────────────────────────────────────────

  describe('delegate with fromAgentId', () => {
    it('should pass fromAgentId to DB insert', async () => {
      await engine.delegate(makeDelegateInput({ fromAgentId: 'caller-agent-id' }))

      expect(db.insert).toHaveBeenCalled()
      expect(db._mock.valuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAgentId: 'caller-agent-id',
          toAgentId: 'agent-1',
        }),
      )
    })

    it('should set fromAgentId to null when not provided', async () => {
      await engine.delegate(makeDelegateInput())

      expect(db._mock.valuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAgentId: null,
        }),
      )
    })
  })
})
