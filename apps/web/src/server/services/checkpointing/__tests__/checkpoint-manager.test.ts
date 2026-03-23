import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockDb } from '../../../../../../../test/helpers/db-mock'
import { CheckpointManager, type CreateCheckpointInput } from '../checkpoint-manager'
import type { Database } from '@solarc/db'

describe('CheckpointManager', () => {
  let db: ReturnType<typeof createMockDb>
  let manager: CheckpointManager

  beforeEach(() => {
    db = createMockDb()
    manager = new CheckpointManager(db as unknown as Database)
  })

  const baseInput: CreateCheckpointInput = {
    entityType: 'ticket',
    entityId: 't1',
    stepIndex: 0,
    state: { status: 'running' },
    metadata: { trigger: 'status_change' },
  }

  describe('save', () => {
    it('saves checkpoint with granularity "all"', async () => {
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'cp-1' }]),
        }),
      })

      const id = await manager.save({ ...baseInput, granularity: 'all' })
      expect(id).toBe('cp-1')
      expect(db.insert).toHaveBeenCalled()
    })

    it('returns null when granularity is "none"', async () => {
      const id = await manager.save({ ...baseInput, granularity: 'none' })
      expect(id).toBeNull()
      expect(db.insert).not.toHaveBeenCalled()
    })

    it('saves milestone triggers when granularity is "milestones"', async () => {
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'cp-2' }]),
        }),
      })

      const id = await manager.save({
        ...baseInput,
        metadata: { trigger: 'status_change' },
        granularity: 'milestones',
      })
      expect(id).toBe('cp-2')
    })

    it('skips non-milestone triggers when granularity is "milestones"', async () => {
      const id = await manager.save({
        ...baseInput,
        metadata: { trigger: 'llm_call' },
        granularity: 'milestones',
      })
      expect(id).toBeNull()
      expect(db.insert).not.toHaveBeenCalled()
    })

    it('skips tool_invocation trigger when granularity is "milestones"', async () => {
      const id = await manager.save({
        ...baseInput,
        metadata: { trigger: 'tool_invocation' },
        granularity: 'milestones',
      })
      expect(id).toBeNull()
    })

    it('defaults granularity to "all" when not specified', async () => {
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'cp-3' }]),
        }),
      })

      const id = await manager.save(baseInput) // no granularity field
      expect(id).toBe('cp-3')
    })
  })
})
