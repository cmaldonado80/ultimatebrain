import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DebateEngine } from '../debate-engine'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@solarc/db', () => ({
  debateSessions: { id: 'id', status: 'status' },
  debateNodes: { id: 'id', sessionId: 'sessionId' },
  debateEdges: { fromNodeId: 'fromNodeId', toNodeId: 'toNodeId', type: 'type' },
  debateElo: { agentId: 'agentId', eloRating: 'eloRating' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
  desc: (col: string) => ({ desc: col }),
  sql: (...args: unknown[]) => args,
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  const whereFn = vi.fn().mockResolvedValue([])
  const setFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
  const returningFn = vi.fn().mockResolvedValue([
    {
      id: 'session-1',
      projectId: null,
      status: 'active',
      constitutionalRules: [],
      createdAt: new Date(),
    },
  ])
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })
  const fromFn = vi.fn().mockReturnValue({ where: whereFn })

  return {
    query: {
      debateSessions: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      debateNodes: {
        findFirst: vi.fn().mockResolvedValue(undefined),
        findMany: vi.fn().mockResolvedValue([]),
      },
      debateElo: {
        findFirst: vi.fn().mockResolvedValue(undefined),
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    insert: vi.fn().mockReturnValue({ values: valuesFn }),
    update: vi.fn().mockReturnValue({ set: setFn }),
    select: vi.fn().mockReturnValue({ from: fromFn }),
    _mock: { whereFn, setFn, valuesFn, returningFn, fromFn },
  } as any
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('DebateEngine', () => {
  let engine: DebateEngine
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
    engine = new DebateEngine(db)
  })

  // ── Session Management ────────────────────────────────────────────────

  describe('createSession', () => {
    it('should create a new debate session', async () => {
      const session = await engine.createSession('proj-1', [
        { name: 'No ad hominem', description: 'Attack ideas not people', weight: 1.0 },
      ])

      expect(db.insert).toHaveBeenCalled()
      expect(session).toBeDefined()
      expect(session.id).toBe('session-1')
    })

    it('should create session with empty rules by default', async () => {
      await engine.createSession()

      expect(db._mock.valuesFn).toHaveBeenCalledWith(
        expect.objectContaining({ constitutionalRules: [] }),
      )
    })
  })

  describe('getSession', () => {
    it('should return null when session does not exist', async () => {
      db.query.debateSessions.findFirst.mockResolvedValue(undefined)

      const result = await engine.getSession('nonexistent')

      expect(result).toBeNull()
    })

    it('should return full session with nodes and edges', async () => {
      db.query.debateSessions.findFirst.mockResolvedValue({
        id: 'session-1',
        projectId: 'proj-1',
        status: 'active',
        constitutionalRules: [],
        createdAt: new Date(),
      })
      db.query.debateNodes.findMany.mockResolvedValue([
        {
          id: 'node-1',
          agentId: 'agent-1',
          text: 'Arg 1',
          validity: 0.5,
          parentId: null,
          isAxiom: false,
          createdAt: new Date(),
        },
      ])
      // edges from select().from().where()
      const edgeWhereFn = vi
        .fn()
        .mockResolvedValue([{ fromNodeId: 'node-1', toNodeId: 'node-2', type: 'support' }])
      const edgeFromFn = vi.fn().mockReturnValue({ where: edgeWhereFn })
      db.select.mockReturnValue({ from: edgeFromFn })

      const result = await engine.getSession('session-1')

      expect(result).toBeDefined()
      expect(result!.nodes).toHaveLength(1)
      expect(result!.edges).toHaveLength(1)
    })
  })

  // ── Arguments ─────────────────────────────────────────────────────────

  describe('submitArgument', () => {
    it('should submit an argument and return it', async () => {
      db._mock.returningFn.mockResolvedValue([
        {
          id: 'node-1',
          agentId: 'agent-1',
          text: 'My argument',
          validity: null,
          parentId: null,
          isAxiom: false,
          createdAt: new Date(),
        },
      ])

      const arg = await engine.submitArgument('session-1', 'agent-1', 'My argument')

      expect(db.insert).toHaveBeenCalled()
      expect(arg.id).toBe('node-1')
      expect(arg.text).toBe('My argument')
    })

    it('should set isAxiom from options', async () => {
      db._mock.returningFn.mockResolvedValue([
        {
          id: 'node-2',
          agentId: 'agent-1',
          text: 'Axiom',
          validity: 1.0,
          parentId: null,
          isAxiom: true,
          createdAt: new Date(),
        },
      ])

      const arg = await engine.submitArgument('session-1', 'agent-1', 'Axiom', {
        isAxiom: true,
        validity: 1.0,
      })

      expect(arg.isAxiom).toBe(true)
    })
  })

  // ── Edges ─────────────────────────────────────────────────────────────

  describe('addEdge / support / attack / rebut', () => {
    it('should add a support edge', async () => {
      await engine.support('node-1', 'node-2')

      expect(db.insert).toHaveBeenCalled()
      expect(db._mock.valuesFn).toHaveBeenCalledWith(expect.objectContaining({ type: 'support' }))
    })

    it('should add an attack edge', async () => {
      await engine.attack('node-1', 'node-2')

      expect(db._mock.valuesFn).toHaveBeenCalledWith(expect.objectContaining({ type: 'attack' }))
    })

    it('should add a rebuttal edge', async () => {
      await engine.rebut('node-1', 'node-2')

      expect(db._mock.valuesFn).toHaveBeenCalledWith(expect.objectContaining({ type: 'rebuttal' }))
    })
  })

  // ── Scoring ───────────────────────────────────────────────────────────

  describe('scoreArgument', () => {
    it('should return 0.5 base score with no edges', async () => {
      // select().from().where() returns empty array
      const edgeWhereFn = vi.fn().mockResolvedValue([])
      const edgeFromFn = vi.fn().mockReturnValue({ where: edgeWhereFn })
      db.select.mockReturnValue({ from: edgeFromFn })

      const score = await engine.scoreArgument('node-1')

      expect(score).toBe(0.5)
    })

    it('should increase score with support edges', async () => {
      const edgeWhereFn = vi
        .fn()
        .mockResolvedValue([{ fromNodeId: 'node-2', toNodeId: 'node-1', type: 'support' }])
      const edgeFromFn = vi.fn().mockReturnValue({ where: edgeWhereFn })
      db.select.mockReturnValue({ from: edgeFromFn })
      db.query.debateNodes.findFirst.mockResolvedValue({ id: 'node-2', validity: 0.8 })

      const score = await engine.scoreArgument('node-1')

      expect(score).toBeGreaterThan(0.5)
    })
  })

  // ── Session Completion ────────────────────────────────────────────────

  describe('completeSession', () => {
    it('should mark session as completed', async () => {
      await engine.completeSession('session-1')

      expect(db.update).toHaveBeenCalled()
    })

    it('should update Elo ratings when winner and loser are provided', async () => {
      // getElo calls: two findFirst for winner and loser
      db.query.debateElo.findFirst
        .mockResolvedValueOnce({ agentId: 'agent-1', eloRating: 1200, matches: 5, wins: 3 })
        .mockResolvedValueOnce({ agentId: 'agent-2', eloRating: 1200, matches: 5, wins: 2 })
        // upsertElo calls
        .mockResolvedValueOnce({ agentId: 'agent-1' })
        .mockResolvedValueOnce({ agentId: 'agent-2' })

      await engine.completeSession('session-1', 'agent-1', 'agent-2')

      // update for session + 2 updates for Elo
      expect(db.update).toHaveBeenCalled()
    })
  })

  describe('cancelSession', () => {
    it('should mark session as cancelled', async () => {
      await engine.cancelSession('session-1')

      expect(db.update).toHaveBeenCalled()
    })
  })

  // ── Elo ───────────────────────────────────────────────────────────────

  describe('getElo', () => {
    it('should return default Elo of 1200 when no record exists', async () => {
      db.query.debateElo.findFirst.mockResolvedValue(undefined)

      const elo = await engine.getElo('agent-1')

      expect(elo.eloRating).toBe(1200)
      expect(elo.matches).toBe(0)
      expect(elo.wins).toBe(0)
    })
  })

  describe('leaderboard', () => {
    it('should return top agents by Elo', async () => {
      db.query.debateElo.findMany.mockResolvedValue([
        { agentId: 'a1', eloRating: 1500, matches: 10, wins: 8 },
        { agentId: 'a2', eloRating: 1400, matches: 10, wins: 6 },
      ])

      const board = await engine.leaderboard(10)

      expect(board).toHaveLength(2)
    })
  })
})
