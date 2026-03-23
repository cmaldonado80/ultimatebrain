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

vi.mock('@solarc/db', () => ({
  default: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
}))

const mockList = vi.fn()
const mockGet = vi.fn()
const mockSave = vi.fn()
const mockDelete = vi.fn()
const mockStartRecording = vi.fn()
const mockDistill = vi.fn()
const mockExecute = vi.fn()
const mockGetRun = vi.fn()

vi.mock('../../services/playbooks', () => ({
  PlaybookRecorder: vi.fn().mockImplementation(() => ({
    list: mockList,
    get: mockGet,
    save: mockSave,
    delete: mockDelete,
    startRecording: mockStartRecording,
    record: vi.fn(),
    endRecording: vi.fn(),
  })),
  PlaybookDistiller: vi.fn().mockImplementation(() => ({
    distill: mockDistill,
    generateSkillDocForPlaybook: vi.fn(),
  })),
  PlaybookExecutor: vi.fn().mockImplementation(() => ({
    execute: mockExecute,
    getRun: mockGetRun,
    abTest: vi.fn(),
  })),
}))

const { playbooksRouter } = await import('../playbooks')

import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) =>
  t.createCallerFactory(playbooksRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('playbooks router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('list', () => {
    it('returns all playbooks', async () => {
      const playbooks = [{ id: UUID, name: 'Deploy Flow' }]
      mockList.mockResolvedValue(playbooks)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.list()

      expect(result).toEqual(playbooks)
    })
  })

  describe('save', () => {
    it('saves a playbook with steps', async () => {
      const step = {
        index: 0,
        name: 'Step 1',
        type: 'click' as const,
        description: 'Click button',
        parameters: {},
      }
      const saved = { id: UUID, name: 'My Playbook', steps: [step] }
      mockSave.mockResolvedValue(saved)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.save({ name: 'My Playbook', steps: [step] })

      expect(result).toEqual(saved)
    })

    it('rejects empty name', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.save({
          name: '',
          steps: [{ index: 0, name: 's', type: 'click', description: 'd', parameters: {} }],
        }),
      ).rejects.toThrow()
    })
  })

  describe('get', () => {
    it('returns a playbook by id', async () => {
      const playbook = { id: UUID, name: 'Deploy Flow' }
      mockGet.mockResolvedValue(playbook)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.get({ id: UUID })

      expect(result).toEqual(playbook)
    })

    it('throws NOT_FOUND when playbook missing', async () => {
      mockGet.mockResolvedValue(null)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.get({ id: UUID })).rejects.toThrow()
    })
  })

  describe('startRecording', () => {
    it('starts a recording session', async () => {
      mockStartRecording.mockReturnValue('session-123')

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.startRecording({})

      expect(result).toEqual({ sessionId: 'session-123' })
    })
  })

  describe('distill', () => {
    it('distills raw steps into a parameterized playbook', async () => {
      const distilled = { name: 'Distilled', steps: [], parameters: [] }
      mockDistill.mockResolvedValue(distilled)

      const step = {
        index: 0,
        name: 'Step 1',
        type: 'click' as const,
        description: 'Click button',
        parameters: {},
      }

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.distill({ steps: [step] })

      expect(result).toEqual(distilled)
    })
  })

  describe('run', () => {
    it('executes a playbook', async () => {
      const playbook = { id: UUID, name: 'PB', steps: [] }
      mockGet.mockResolvedValue(playbook)
      const runResult = { runId: 'r-1', status: 'completed', results: [] }
      mockExecute.mockResolvedValue(runResult)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.run({ id: UUID })

      expect(result).toEqual(runResult)
    })

    it('throws NOT_FOUND when playbook does not exist', async () => {
      mockGet.mockResolvedValue(null)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.run({ id: UUID })).rejects.toThrow()
    })
  })

  describe('auth', () => {
    it('rejects unauthenticated requests', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.list()).rejects.toThrow()
    })
  })
})
