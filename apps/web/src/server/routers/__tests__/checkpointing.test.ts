import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

function createMockDb() {
  return {} as any
}

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

const mockSave = vi.fn()
const mockList = vi.fn()
const mockGet = vi.fn()
const mockGetLatest = vi.fn()
const mockCount = vi.fn()
const mockPrune = vi.fn()

const mockGetTimeline = vi.fn()
const mockDiffCheckpoints = vi.fn()
const mockDiffLatest = vi.fn()
const mockReplayFrom = vi.fn()

vi.mock('@solarc/db', () => ({}))

vi.mock('../../services/checkpointing/checkpoint-manager', () => ({
  CheckpointManager: vi.fn().mockImplementation(() => ({
    save: mockSave,
    list: mockList,
    get: mockGet,
    getLatest: mockGetLatest,
    count: mockCount,
    prune: mockPrune,
  })),
}))

vi.mock('../../services/checkpointing/time-travel', () => ({
  TimeTravelEngine: vi.fn().mockImplementation(() => ({
    getTimeline: mockGetTimeline,
    diffCheckpoints: mockDiffCheckpoints,
    diffLatest: mockDiffLatest,
    replayFrom: mockReplayFrom,
  })),
}))

const { checkpointingRouter } = await import('../checkpointing')

import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) => t.createCallerFactory(checkpointingRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const UUID = '550e8400-e29b-41d4-a716-446655440000'
const UUID2 = '660e8400-e29b-41d4-a716-446655440000'

describe('checkpointing router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('save', () => {
    it('saves a checkpoint and returns id', async () => {
      mockSave.mockResolvedValue('cp-1')

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.save({
        entityType: 'ticket',
        entityId: UUID,
        stepIndex: 0,
        state: { foo: 'bar' },
        metadata: { trigger: 'manual' },
      })

      expect(mockSave).toHaveBeenCalled()
      expect(result).toEqual({ id: 'cp-1', saved: true })
    })

    it('rejects without a session (UNAUTHORIZED)', async () => {
      const trpc = caller({ db, session: null })
      await expect(
        trpc.save({
          entityType: 'ticket',
          entityId: UUID,
          stepIndex: 0,
          state: {},
          metadata: { trigger: 'manual' },
        }),
      ).rejects.toThrow()
    })
  })

  describe('list', () => {
    it('lists checkpoints for an entity', async () => {
      const checkpoints = [{ id: 'cp-1' }, { id: 'cp-2' }]
      mockList.mockResolvedValue(checkpoints)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.list({ entityType: 'ticket', entityId: UUID })

      expect(mockList).toHaveBeenCalledWith('ticket', UUID)
      expect(result).toEqual(checkpoints)
    })
  })

  describe('get', () => {
    it('returns a checkpoint by id', async () => {
      const cp = { id: UUID, state: { x: 1 } }
      mockGet.mockResolvedValue(cp)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.get({ checkpointId: UUID })

      expect(result).toEqual(cp)
    })

    it('throws NOT_FOUND when checkpoint does not exist', async () => {
      mockGet.mockResolvedValue(null)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.get({ checkpointId: UUID })).rejects.toThrow()
    })
  })

  describe('diff', () => {
    it('diffs two checkpoints', async () => {
      const diffResult = { added: ['key1'], removed: [] }
      mockDiffCheckpoints.mockResolvedValue(diffResult)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.diff({ checkpointAId: UUID, checkpointBId: UUID2 })

      expect(mockDiffCheckpoints).toHaveBeenCalledWith(UUID, UUID2)
      expect(result).toEqual(diffResult)
    })

    it('rejects non-uuid checkpoint ids', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.diff({ checkpointAId: 'bad', checkpointBId: 'bad' })).rejects.toThrow()
    })
  })

  describe('replay', () => {
    it('replays from a checkpoint', async () => {
      mockReplayFrom.mockResolvedValue({ success: true })

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.replay({ checkpointId: UUID })

      expect(mockReplayFrom).toHaveBeenCalled()
      expect(result).toEqual({ success: true })
    })
  })
})
