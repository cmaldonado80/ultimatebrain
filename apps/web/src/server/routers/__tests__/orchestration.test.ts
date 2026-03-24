import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock service layer
// ---------------------------------------------------------------------------

const mockTicketEngine = {
  getReadyTickets: vi.fn(),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  renewLease: vi.fn(),
  transition: vi.fn(),
  assignAgent: vi.fn(),
  addDependency: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  getExpiredLeases: vi.fn(),
}

const mockCronEngine = {
  list: vi.fn(),
  createJob: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  delete: vi.fn(),
  getDueJobs: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}

const mockSwarmEngine = {
  form: vi.fn(),
  get: vi.fn(),
  complete: vi.fn(),
  disband: vi.fn(),
  addMember: vi.fn(),
  removeMember: vi.fn(),
  listActive: vi.fn(),
}

const mockReceiptManager = {
  start: vi.fn(),
  recordAction: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  rollback: vi.fn(),
  getFull: vi.fn(),
  list: vi.fn(),
  recordAnomaly: vi.fn(),
}

vi.mock('../../services/orchestration', () => ({
  TicketExecutionEngine: vi.fn().mockImplementation(() => mockTicketEngine),
  CronEngine: vi.fn().mockImplementation(() => mockCronEngine),
  SwarmEngine: vi.fn().mockImplementation(() => mockSwarmEngine),
  ReceiptManager: vi.fn().mockImplementation(() => mockReceiptManager),
}))

vi.mock('@solarc/db', () => ({}))
vi.mock('drizzle-orm', () => ({}))

// Import after mocks are set up
const { orchestrationRouter } = await import('../orchestration')

// Minimal tRPC caller factory
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: any
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) => t.createCallerFactory(orchestrationRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID1 = '550e8400-e29b-41d4-a716-446655440000'
const UUID2 = '660e8400-e29b-41d4-a716-446655440001'
const authedCtx = () => ({ db: {}, session: { userId: 'user-1' } })
const unauthCtx = () => ({ db: {}, session: null })

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('orchestration router', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // === Ticket Execution ===

  describe('readyTickets', () => {
    it('returns ready tickets for a workspace', async () => {
      const tickets = [{ id: UUID1, status: 'queued' }]
      mockTicketEngine.getReadyTickets.mockResolvedValue(tickets)

      const trpc = caller(authedCtx())
      const result = await trpc.readyTickets({ workspaceId: UUID1 })

      expect(mockTicketEngine.getReadyTickets).toHaveBeenCalledWith(UUID1)
      expect(result).toEqual(tickets)
    })

    it('works without input', async () => {
      mockTicketEngine.getReadyTickets.mockResolvedValue([])

      const trpc = caller(authedCtx())
      const result = await trpc.readyTickets()

      expect(mockTicketEngine.getReadyTickets).toHaveBeenCalledWith(undefined)
      expect(result).toEqual([])
    })

    // TODO: re-enable when auth is wired up
    it.skip('rejects unauthenticated calls', async () => {
      const trpc = caller(unauthCtx())
      await expect(trpc.readyTickets()).rejects.toThrow()
    })
  })

  describe('acquireLock', () => {
    it('acquires a lock on a ticket', async () => {
      const lock = { ticketId: UUID1, agentId: UUID2, expiresAt: '2026-01-01T00:00:00Z' }
      mockTicketEngine.acquireLock.mockResolvedValue(lock)

      const trpc = caller(authedCtx())
      const result = await trpc.acquireLock({ ticketId: UUID1, agentId: UUID2, leaseSeconds: 120 })

      expect(mockTicketEngine.acquireLock).toHaveBeenCalledWith(UUID1, UUID2, 120)
      expect(result).toEqual(lock)
    })

    it('rejects non-uuid ticketId', async () => {
      const trpc = caller(authedCtx())
      await expect(trpc.acquireLock({ ticketId: 'bad', agentId: UUID2 })).rejects.toThrow()
    })

    it('rejects leaseSeconds below 30', async () => {
      const trpc = caller(authedCtx())
      await expect(
        trpc.acquireLock({ ticketId: UUID1, agentId: UUID2, leaseSeconds: 5 }),
      ).rejects.toThrow()
    })

    // TODO: re-enable when auth is wired up
    it.skip('rejects unauthenticated calls', async () => {
      const trpc = caller(unauthCtx())
      await expect(trpc.acquireLock({ ticketId: UUID1, agentId: UUID2 })).rejects.toThrow()
    })
  })

  describe('releaseLock', () => {
    it('releases a lock on a ticket', async () => {
      mockTicketEngine.releaseLock.mockResolvedValue({ success: true })

      const trpc = caller(authedCtx())
      const result = await trpc.releaseLock({ ticketId: UUID1, agentId: UUID2 })

      expect(mockTicketEngine.releaseLock).toHaveBeenCalledWith(UUID1, UUID2)
      expect(result).toEqual({ success: true })
    })
  })

  describe('transition', () => {
    it('transitions a ticket status', async () => {
      const updated = { id: UUID1, status: 'in_progress' }
      mockTicketEngine.transition.mockResolvedValue(updated)

      const trpc = caller(authedCtx())
      const result = await trpc.transition({
        ticketId: UUID1,
        status: 'in_progress',
        agentId: UUID2,
      })

      expect(mockTicketEngine.transition).toHaveBeenCalledWith(UUID1, 'in_progress', UUID2)
      expect(result).toEqual(updated)
    })

    it('rejects invalid status values', async () => {
      const trpc = caller(authedCtx())
      await expect(
        trpc.transition({ ticketId: UUID1, status: 'invalid_status' as any }),
      ).rejects.toThrow()
    })
  })

  describe('completeTicket', () => {
    it('completes a ticket with a result', async () => {
      const completed = { id: UUID1, status: 'done', result: 'All tests pass' }
      mockTicketEngine.complete.mockResolvedValue(completed)

      const trpc = caller(authedCtx())
      const result = await trpc.completeTicket({
        ticketId: UUID1,
        result: 'All tests pass',
        agentId: UUID2,
      })

      expect(mockTicketEngine.complete).toHaveBeenCalledWith(UUID1, 'All tests pass', UUID2)
      expect(result).toEqual(completed)
    })
  })

  // === Cron Jobs ===

  describe('createCronJob', () => {
    it('creates a cron job', async () => {
      const job = { id: UUID1, name: 'nightly-build', schedule: '0 0 * * *' }
      mockCronEngine.createJob.mockResolvedValue(job)

      const trpc = caller(authedCtx())
      const result = await trpc.createCronJob({ name: 'nightly-build', schedule: '0 0 * * *' })

      expect(mockCronEngine.createJob).toHaveBeenCalled()
      expect(result).toEqual(job)
    })

    it('rejects empty name', async () => {
      const trpc = caller(authedCtx())
      await expect(trpc.createCronJob({ name: '', schedule: '0 0 * * *' })).rejects.toThrow()
    })

    it('rejects schedule shorter than 9 characters', async () => {
      const trpc = caller(authedCtx())
      await expect(trpc.createCronJob({ name: 'test', schedule: '* *' })).rejects.toThrow()
    })
  })

  // === Swarms ===

  describe('formSwarm', () => {
    it('forms a new swarm', async () => {
      const swarm = { id: UUID1, task: 'refactor auth', agents: [] }
      mockSwarmEngine.form.mockResolvedValue(swarm)

      const trpc = caller(authedCtx())
      const result = await trpc.formSwarm({ task: 'refactor auth', minAgents: 2 })

      expect(mockSwarmEngine.form).toHaveBeenCalled()
      expect(result).toEqual(swarm)
    })

    it('rejects empty task', async () => {
      const trpc = caller(authedCtx())
      await expect(trpc.formSwarm({ task: '' })).rejects.toThrow()
    })
  })

  // === Receipts ===

  describe('startReceipt', () => {
    it('starts a new receipt', async () => {
      const receipt = { id: UUID1, status: 'running' }
      mockReceiptManager.start.mockResolvedValue(receipt)

      const trpc = caller(authedCtx())
      const result = await trpc.startReceipt({ agentId: UUID2, trigger: 'manual' })

      expect(mockReceiptManager.start).toHaveBeenCalledWith({ agentId: UUID2, trigger: 'manual' })
      expect(result).toEqual(receipt)
    })

    // TODO: re-enable when auth is wired up
    it.skip('rejects unauthenticated calls', async () => {
      const trpc = caller(unauthCtx())
      await expect(trpc.startReceipt({})).rejects.toThrow()
    })
  })

  describe('receipt', () => {
    it('returns a full receipt by id', async () => {
      const receipt = { id: UUID1, status: 'completed', actions: [] }
      mockReceiptManager.getFull.mockResolvedValue(receipt)

      const trpc = caller(authedCtx())
      const result = await trpc.receipt({ id: UUID1 })

      expect(mockReceiptManager.getFull).toHaveBeenCalledWith(UUID1)
      expect(result).toEqual(receipt)
    })

    it('rejects non-uuid id', async () => {
      const trpc = caller(authedCtx())
      await expect(trpc.receipt({ id: 'not-uuid' })).rejects.toThrow()
    })
  })
})
