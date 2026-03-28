import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TicketExecutionEngine } from '../ticket-engine'

// --- Mock helpers ---

function createMockTx() {
  return {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  }
}

function createMockDb(overrides: Record<string, unknown> = {}) {
  const tx = createMockTx()

  return {
    query: {
      tickets: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      ticketExecution: {
        findFirst: vi.fn(),
      },
      agents: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    transaction: vi.fn(async (fn: (tx: ReturnType<typeof createMockTx>) => Promise<void>) => {
      await fn(tx as any)
    }),
    _tx: tx,
    ...overrides,
  } as any
}

describe('TicketExecutionEngine', () => {
  let db: ReturnType<typeof createMockDb>
  let engine: TicketExecutionEngine

  beforeEach(() => {
    db = createMockDb()
    engine = new TicketExecutionEngine(db)
  })

  describe('transition', () => {
    it('should transition a ticket from queued to in_progress', async () => {
      db.query.tickets.findFirst.mockResolvedValue({
        id: 'ticket-1',
        status: 'queued',
      })

      await engine.transition('ticket-1', 'in_progress', 'agent-1')

      expect(db.transaction).toHaveBeenCalledOnce()
      // Verify the transaction callback was invoked (insert history + update ticket)
      expect(db._tx.insert).toHaveBeenCalled()
      expect(db._tx.update).toHaveBeenCalled()
    })

    it('should throw when ticket is not found', async () => {
      db.query.tickets.findFirst.mockResolvedValue(undefined)

      await expect(engine.transition('nonexistent', 'in_progress')).rejects.toThrow(
        'Ticket nonexistent not found',
      )
    })

    it('should throw on invalid status transition', async () => {
      db.query.tickets.findFirst.mockResolvedValue({
        id: 'ticket-1',
        status: 'done',
      })

      await expect(engine.transition('ticket-1', 'in_progress')).rejects.toThrow(
        'Invalid transition: done → in_progress',
      )
    })

    it('should allow backlog to queued transition', async () => {
      db.query.tickets.findFirst.mockResolvedValue({
        id: 'ticket-2',
        status: 'backlog',
      })

      await engine.transition('ticket-2', 'queued')

      expect(db.transaction).toHaveBeenCalledOnce()
    })
  })

  describe('acquireLock', () => {
    it('should create a new lock when none exists', async () => {
      db.query.ticketExecution.findFirst.mockResolvedValue(undefined)

      const result = await engine.acquireLock('ticket-1', 'agent-1', 300)

      expect(result).toBe(true)
      expect(db.insert).toHaveBeenCalled()
    })

    it('should claim an expired lock', async () => {
      const pastDate = new Date(Date.now() - 60_000)
      db.query.ticketExecution.findFirst.mockResolvedValue({
        ticketId: 'ticket-1',
        lockOwner: 'agent-old',
        leaseUntil: pastDate,
      })

      const result = await engine.acquireLock('ticket-1', 'agent-2')

      expect(result).toBe(true)
      expect(db.update).toHaveBeenCalled()
    })

    it('should reject lock acquisition when another agent holds a valid lease', async () => {
      // Atomic update returns empty (lock held by another agent, conditions not met)
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      })
      // Insert fails due to conflict (row already exists for this ticketId)
      db.insert.mockReturnValue({
        values: vi.fn().mockRejectedValue(new Error('duplicate key')),
      })

      const result = await engine.acquireLock('ticket-1', 'agent-2')

      expect(result).toBe(false)
    })

    it('should return true when the same agent already owns the lock', async () => {
      const futureDate = new Date(Date.now() + 300_000)
      db.query.ticketExecution.findFirst.mockResolvedValue({
        ticketId: 'ticket-1',
        lockOwner: 'agent-1',
        leaseUntil: futureDate,
      })

      const result = await engine.acquireLock('ticket-1', 'agent-1')

      expect(result).toBe(true)
    })
  })

  describe('complete', () => {
    it('should mark a ticket as done and release the lock', async () => {
      await engine.complete('ticket-1', 'Task finished successfully', 'agent-1')

      expect(db.transaction).toHaveBeenCalledOnce()
      // The tx should have updated ticket status, inserted history, and released lock
      expect(db._tx.update).toHaveBeenCalled()
      expect(db._tx.insert).toHaveBeenCalled()
    })
  })
})
