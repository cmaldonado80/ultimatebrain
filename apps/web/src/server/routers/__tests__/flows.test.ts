import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

function createMockDb() {
  return {} as any
}

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

const mockCrewEngine = {
  run: vi.fn(),
  runAgent: vi.fn(),
}

const mockRecallFlow = {
  search: vi.fn(),
  searchAndInject: vi.fn(),
  promoteUsedMemories: vi.fn(),
}

const mockGateway = {
  embed: vi.fn(),
}

vi.mock('../../services/crews/crew-engine', () => ({
  CrewEngine: vi.fn().mockImplementation(() => mockCrewEngine),
}))

vi.mock('../../services/memory/recall-flow', () => ({
  RecallFlow: vi.fn().mockImplementation(() => mockRecallFlow),
}))

vi.mock('../../services/gateway', () => ({
  GatewayRouter: vi.fn().mockImplementation(() => mockGateway),
}))

vi.mock('@solarc/db', () => ({}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
}))

// Import after mocks are set up
const { flowsRouter } = await import('../flows')

// Minimal tRPC caller factory
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) =>
  t.createCallerFactory(flowsRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID = '550e8400-e29b-41d4-a716-446655440000'
const UUID2 = '660e8400-e29b-41d4-a716-446655440000'

function makeAgent(overrides?: Record<string, unknown>) {
  return {
    id: 'agent-1',
    role: 'coder',
    goal: 'Write code',
    backstory: 'Expert programmer',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('flows router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  // ── Auth ────────────────────────────────────────────────────────────────

  describe('auth', () => {
    it('rejects runCrew without a session', async () => {
      const trpc = caller({ db, session: null })
      await expect(
        trpc.runCrew({ name: 'crew', agents: [makeAgent()], task: 'do stuff' }),
      ).rejects.toThrow()
    })

    it('rejects runAgent without a session', async () => {
      const trpc = caller({ db, session: null })
      await expect(
        trpc.runAgent({ agent: makeAgent(), task: 'do stuff' }),
      ).rejects.toThrow()
    })

    it('rejects recall without a session', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.recall({ query: 'test' })).rejects.toThrow()
    })

    it('rejects promoteMemories without a session', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.promoteMemories({ memoryIds: [UUID] })).rejects.toThrow()
    })
  })

  // ── runCrew ─────────────────────────────────────────────────────────────

  describe('runCrew', () => {
    it('executes a crew and returns result', async () => {
      const expected = { crewId: 'crew-1', output: 'done', steps: [] }
      mockCrewEngine.run.mockResolvedValue(expected)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.runCrew({
        name: 'Test Crew',
        agents: [makeAgent()],
        task: 'Build a widget',
      })

      expect(mockCrewEngine.run).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Crew',
          task: 'Build a widget',
          agents: expect.arrayContaining([
            expect.objectContaining({ id: 'agent-1', role: 'coder', tools: [] }),
          ]),
        }),
      )
      expect(result).toEqual(expected)
    })

    it('rejects when agents array is empty', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.runCrew({ name: 'crew', agents: [], task: 'do stuff' }),
      ).rejects.toThrow()
    })

    it('passes verbose flag through', async () => {
      mockCrewEngine.run.mockResolvedValue({ crewId: 'c', output: 'ok', steps: [] })

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await trpc.runCrew({
        name: 'Verbose Crew',
        agents: [makeAgent()],
        task: 'debug',
        verbose: true,
      })

      expect(mockCrewEngine.run).toHaveBeenCalledWith(
        expect.objectContaining({ verbose: true }),
      )
    })
  })

  // ── runAgent ────────────────────────────────────────────────────────────

  describe('runAgent', () => {
    it('runs a single agent and returns result', async () => {
      const expected = { output: 'result', steps: [] }
      mockCrewEngine.runAgent.mockResolvedValue(expected)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.runAgent({
        agent: makeAgent(),
        task: 'Solve this problem',
      })

      expect(mockCrewEngine.runAgent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent-1', role: 'coder', tools: [] }),
        'Solve this problem',
        expect.any(String), // auto-generated crewId
        [],
      )
      expect(result).toEqual(expected)
    })

    it('passes crewId when provided', async () => {
      mockCrewEngine.runAgent.mockResolvedValue({ output: 'ok', steps: [] })

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await trpc.runAgent({
        agent: makeAgent(),
        task: 'task',
        crewId: UUID,
      })

      expect(mockCrewEngine.runAgent).toHaveBeenCalledWith(
        expect.any(Object),
        'task',
        UUID,
        [],
      )
    })

    it('rejects non-uuid crewId', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.runAgent({ agent: makeAgent(), task: 'task', crewId: 'not-a-uuid' }),
      ).rejects.toThrow()
    })
  })

  // ── recall ──────────────────────────────────────────────────────────────

  describe('recall', () => {
    it('searches memory and returns results', async () => {
      const memories = [{ id: 'm-1', content: 'relevant fact', score: 0.9 }]
      mockRecallFlow.search.mockResolvedValue(memories)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.recall({ query: 'what is X?' })

      expect(mockRecallFlow.search).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'what is X?' }),
      )
      expect(result).toEqual(memories)
    })

    it('passes optional filters through', async () => {
      mockRecallFlow.search.mockResolvedValue([])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await trpc.recall({
        query: 'search',
        workspaceId: UUID,
        topK: 5,
        includeArchival: true,
      })

      expect(mockRecallFlow.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'search',
          workspaceId: UUID,
          topK: 5,
          includeArchival: true,
        }),
      )
    })

    it('rejects non-uuid workspaceId', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.recall({ query: 'test', workspaceId: 'bad' }),
      ).rejects.toThrow()
    })
  })

  // ── recallAndInject ─────────────────────────────────────────────────────

  describe('recallAndInject', () => {
    it('searches and returns formatted context block', async () => {
      const formatted = { context: '## Memory\n- fact 1\n- fact 2', count: 2 }
      mockRecallFlow.searchAndInject.mockResolvedValue(formatted)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.recallAndInject({ query: 'context for agent' })

      expect(mockRecallFlow.searchAndInject).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'context for agent' }),
      )
      expect(result).toEqual(formatted)
    })
  })

  // ── promoteMemories ─────────────────────────────────────────────────────

  describe('promoteMemories', () => {
    it('promotes memories and returns count', async () => {
      mockRecallFlow.promoteUsedMemories.mockResolvedValue(undefined)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.promoteMemories({ memoryIds: [UUID, UUID2] })

      expect(mockRecallFlow.promoteUsedMemories).toHaveBeenCalledWith([UUID, UUID2])
      expect(result).toEqual({ promoted: 2 })
    })

    it('handles empty memoryIds array', async () => {
      mockRecallFlow.promoteUsedMemories.mockResolvedValue(undefined)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.promoteMemories({ memoryIds: [] })

      expect(result).toEqual({ promoted: 0 })
    })

    it('rejects non-uuid memoryIds', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.promoteMemories({ memoryIds: ['not-a-uuid'] }),
      ).rejects.toThrow()
    })
  })
})
