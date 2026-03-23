import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockDb } from '../../../../../../../test/helpers/db-mock'
import { TimeTravelEngine } from '../time-travel'
import type { Database } from '@solarc/db'
import type { CheckpointRecord } from '../checkpoint-manager'

describe('TimeTravelEngine', () => {
  let db: ReturnType<typeof createMockDb>
  let engine: TimeTravelEngine

  const now = new Date('2026-01-01T00:00:00Z')
  const later = new Date('2026-01-01T00:05:00Z')

  const cpA: CheckpointRecord = {
    id: 'cp-a',
    entityType: 'ticket',
    entityId: 't1',
    stepIndex: 0,
    state: { status: 'queued', priority: 'medium' },
    metadata: { trigger: 'status_change' },
    createdAt: now,
  }

  const cpB: CheckpointRecord = {
    id: 'cp-b',
    entityType: 'ticket',
    entityId: 't1',
    stepIndex: 3,
    state: { status: 'running', priority: 'medium', assignee: 'agent-1' },
    metadata: { trigger: 'llm_call' },
    createdAt: later,
  }

  beforeEach(() => {
    db = createMockDb()
    engine = new TimeTravelEngine(db as unknown as Database)
  })

  describe('diffCheckpoints', () => {
    it('detects added, changed, and unchanged fields', async () => {
      // Mock the checkpoint manager's get method (called via db.query)
      db.query.checkpoints = {
        findFirst: vi.fn()
          .mockResolvedValueOnce(cpA) // first call for cpA
          .mockResolvedValueOnce(cpB), // second call for cpB
        findMany: vi.fn(),
      }

      const diff = await engine.diffCheckpoints('cp-a', 'cp-b')

      expect(diff.stepDelta).toBe(3)
      expect(diff.timeDeltaMs).toBe(5 * 60 * 1000) // 5 minutes
      expect(diff.changes).toContainEqual({
        field: 'status',
        before: 'queued',
        after: 'running',
        type: 'changed',
      })
      expect(diff.changes).toContainEqual({
        field: 'assignee',
        before: undefined,
        after: 'agent-1',
        type: 'added',
      })
      // priority didn't change, so it should not be in changes
      expect(diff.changes.find((c) => c.field === 'priority')).toBeUndefined()
    })

    it('detects removed fields', async () => {
      const cpWithExtra: CheckpointRecord = {
        ...cpA,
        state: { status: 'queued', tempField: 'abc' },
      }
      const cpWithout: CheckpointRecord = {
        ...cpB,
        state: { status: 'running' },
      }

      db.query.checkpoints = {
        findFirst: vi.fn()
          .mockResolvedValueOnce(cpWithExtra)
          .mockResolvedValueOnce(cpWithout),
        findMany: vi.fn(),
      }

      const diff = await engine.diffCheckpoints('cp-a', 'cp-b')
      expect(diff.changes).toContainEqual({
        field: 'tempField',
        before: 'abc',
        after: undefined,
        type: 'removed',
      })
    })

    it('generates a summary string', async () => {
      db.query.checkpoints = {
        findFirst: vi.fn()
          .mockResolvedValueOnce(cpA)
          .mockResolvedValueOnce(cpB),
        findMany: vi.fn(),
      }

      const diff = await engine.diffCheckpoints('cp-a', 'cp-b')
      expect(diff.summary).toContain('+1 field')
      expect(diff.summary).toContain('~1 changed')
    })

    it('throws for missing checkpoint A', async () => {
      db.query.checkpoints = {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(cpB),
        findMany: vi.fn(),
      }

      await expect(engine.diffCheckpoints('missing', 'cp-b')).rejects.toThrow('not found')
    })
  })

  describe('getTimeline', () => {
    it('returns timeline with correct metadata', async () => {
      db.query.checkpoints = {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([cpA, cpB]),
      }

      const timeline = await engine.getTimeline('ticket', 't1')
      expect(timeline.totalCheckpoints).toBe(2)
      expect(timeline.firstAt).toEqual(now)
      expect(timeline.lastAt).toEqual(later)
      expect(timeline.checkpoints[0].dotColor).toBe('green') // status_change
      expect(timeline.checkpoints[1].dotColor).toBe('blue')  // llm_call
    })

    it('returns null dates for empty timeline', async () => {
      db.query.checkpoints = {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      }

      const timeline = await engine.getTimeline('ticket', 't1')
      expect(timeline.totalCheckpoints).toBe(0)
      expect(timeline.firstAt).toBeNull()
      expect(timeline.lastAt).toBeNull()
    })
  })

  describe('replayFrom', () => {
    it('creates a new branch from checkpoint state', async () => {
      db.query.checkpoints = {
        findFirst: vi.fn().mockResolvedValue(cpA),
        findMany: vi.fn(),
      }
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'new-cp' }]),
        }),
      })

      const result = await engine.replayFrom('cp-a', {
        paramOverrides: { priority: 'high' },
        branchLabel: 'hotfix',
      })

      expect(result.originalCheckpointId).toBe('cp-a')
      expect(result.restoredState.status).toBe('queued')
      expect(result.restoredState.priority).toBe('high') // overridden
      expect(result.appliedOverrides).toEqual({ priority: 'high' })
      expect(result.branchId).toBeTruthy()
    })

    it('throws for missing checkpoint', async () => {
      db.query.checkpoints = {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
      }

      await expect(engine.replayFrom('missing')).rejects.toThrow('not found')
    })
  })
})
