import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HealingEngine } from '../healing-engine'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@solarc/db', () => ({
  agents: { id: 'id', name: 'name', status: 'status', updatedAt: 'updatedAt' },
  tickets: {
    id: 'id',
    status: 'status',
    updatedAt: 'updatedAt',
    assignedAgentId: 'assignedAgentId',
  },
  ticketExecution: {
    ticketId: 'ticketId',
    lockOwner: 'lockOwner',
    lockedAt: 'lockedAt',
    leaseUntil: 'leaseUntil',
  },
  brainEntities: { id: 'id', name: 'name', status: 'status' },
  healingLogs: {
    id: 'id',
    action: 'action',
    target: 'target',
    reason: 'reason',
    success: 'success',
    createdAt: 'createdAt',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  lte: (col: string, val: unknown) => ({ lte: { col, val } }),
  desc: (col: string) => ({ desc: col }),
  sql: (...args: unknown[]) => args,
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  const whereFn = vi.fn().mockReturnThis()
  const setFn = vi.fn().mockReturnValue({ where: whereFn })
  const limitFn = vi.fn().mockResolvedValue([])
  const orderByFn = vi.fn().mockReturnValue({ limit: limitFn })
  const fromFn = vi.fn().mockImplementation(() => ({
    where: whereFn,
    orderBy: orderByFn,
  }))
  const insertCatchFn = vi.fn().mockReturnValue(undefined)
  const insertValuesFn = vi.fn().mockReturnValue({ catch: insertCatchFn })

  return {
    query: {
      agents: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      brainEntities: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    select: vi.fn().mockReturnValue({ from: fromFn }),
    update: vi.fn().mockReturnValue({ set: setFn }),
    insert: vi.fn().mockReturnValue({
      values: insertValuesFn,
    }),
    _mock: { whereFn, setFn, fromFn, limitFn, orderByFn, insertValuesFn, insertCatchFn },
  } as unknown as ReturnType<typeof createMockDb>
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('HealingEngine', () => {
  let engine: HealingEngine
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
    engine = new HealingEngine(db)
  })

  // ── diagnose ──────────────────────────────────────────────────────────

  describe('diagnose', () => {
    it('should return healthy status when all checks pass', async () => {
      // All query defaults return empty arrays, stuckTickets/failedTickets return [{count:0}]
      const selectWhereFn = vi
        .fn()
        .mockResolvedValueOnce([]) // expired leases
        .mockResolvedValueOnce([{ count: 0 }]) // stuck tickets
        .mockResolvedValueOnce([{ count: 0 }]) // failed tickets
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })

      const report = await engine.diagnose()

      expect(report.overallStatus).toBe('healthy')
      expect(report.checks).toHaveLength(5)
      expect(report.checks.every((c: { status: string }) => c.status === 'pass')).toBe(true)
      expect(report.recommendations).toHaveLength(0)
    })

    it('should return degraded when agents are in error state (<=2)', async () => {
      db.query.agents.findMany.mockResolvedValue([{ id: 'a1', name: 'Agent 1', status: 'error' }])

      const selectWhereFn = vi
        .fn()
        .mockResolvedValueOnce([]) // expired leases
        .mockResolvedValueOnce([{ count: 0 }]) // stuck tickets
        .mockResolvedValueOnce([{ count: 0 }]) // failed tickets
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })

      const report = await engine.diagnose()

      expect(report.overallStatus).toBe('degraded')
      const agentCheck = report.checks.find(
        (c: { name: string }) => c.name === 'agents.error_state',
      )
      expect(agentCheck?.status).toBe('warn')
      expect(agentCheck?.message).toContain('1 agent(s) in error state')
      expect(report.recommendations[0]).toContain('agents in error state')
    })

    it('should return unhealthy when many agents are in error state (>2)', async () => {
      db.query.agents.findMany.mockResolvedValue([
        { id: 'a1', name: 'Agent 1', status: 'error' },
        { id: 'a2', name: 'Agent 2', status: 'error' },
        { id: 'a3', name: 'Agent 3', status: 'error' },
      ])

      const selectWhereFn = vi
        .fn()
        .mockResolvedValueOnce([]) // expired leases
        .mockResolvedValueOnce([{ count: 0 }]) // stuck tickets
        .mockResolvedValueOnce([{ count: 0 }]) // failed tickets
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })

      const report = await engine.diagnose()

      expect(report.overallStatus).toBe('unhealthy')
      const agentCheck = report.checks.find(
        (c: { name: string }) => c.name === 'agents.error_state',
      )
      expect(agentCheck?.status).toBe('fail')
    })

    it('should detect expired execution leases', async () => {
      const selectWhereFn = vi
        .fn()
        .mockResolvedValueOnce([{ ticketId: 't1', lockOwner: 'a1' }]) // expired leases
        .mockResolvedValueOnce([{ count: 0 }]) // stuck tickets
        .mockResolvedValueOnce([{ count: 0 }]) // failed tickets
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })

      const report = await engine.diagnose()

      expect(report.overallStatus).toBe('degraded')
      const leaseCheck = report.checks.find(
        (c: { name: string }) => c.name === 'tickets.expired_leases',
      )
      expect(leaseCheck?.status).toBe('warn')
      expect(leaseCheck?.message).toContain('1 expired execution lease(s)')
      expect(report.recommendations[0]).toContain('expired leases')
    })

    it('should detect stuck tickets', async () => {
      const selectWhereFn = vi
        .fn()
        .mockResolvedValueOnce([]) // expired leases
        .mockResolvedValueOnce([{ count: 5 }]) // stuck tickets (>3 => fail)
        .mockResolvedValueOnce([{ count: 0 }]) // failed tickets
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })

      const report = await engine.diagnose()

      expect(report.overallStatus).toBe('unhealthy')
      const stuckCheck = report.checks.find((c: { name: string }) => c.name === 'tickets.stuck')
      expect(stuckCheck?.status).toBe('fail')
      expect(stuckCheck?.message).toContain('5 ticket(s) stuck')
    })

    it('should detect degraded entities', async () => {
      db.query.brainEntities.findMany.mockResolvedValue([
        { id: 'e1', name: 'Entity 1', status: 'degraded' },
      ])

      const selectWhereFn = vi
        .fn()
        .mockResolvedValueOnce([]) // expired leases
        .mockResolvedValueOnce([{ count: 0 }]) // stuck tickets
        .mockResolvedValueOnce([{ count: 0 }]) // failed tickets
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })

      const report = await engine.diagnose()

      expect(report.overallStatus).toBe('degraded')
      const entityCheck = report.checks.find(
        (c: { name: string }) => c.name === 'entities.degraded',
      )
      expect(entityCheck?.status).toBe('warn')
      expect(entityCheck?.message).toContain('1 degraded')
    })

    it('should detect high recent ticket failure rate', async () => {
      const selectWhereFn = vi
        .fn()
        .mockResolvedValueOnce([]) // expired leases
        .mockResolvedValueOnce([{ count: 0 }]) // stuck tickets
        .mockResolvedValueOnce([{ count: 8 }]) // failed tickets (>5 => fail)
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })

      const report = await engine.diagnose()

      expect(report.overallStatus).toBe('unhealthy')
      const failedCheck = report.checks.find(
        (c: { name: string }) => c.name === 'tickets.recent_failures',
      )
      expect(failedCheck?.status).toBe('fail')
      expect(failedCheck?.message).toContain('8 ticket(s) failed')
      expect(report.recommendations).toEqual(
        expect.arrayContaining([expect.stringContaining('High ticket failure rate')]),
      )
    })

    it('should include timestamp and latencyMs in report', async () => {
      const selectWhereFn = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ count: 0 }])
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })

      const report = await engine.diagnose()

      expect(report.timestamp).toBeInstanceOf(Date)
      for (const check of report.checks) {
        expect(check.latencyMs).toBeGreaterThanOrEqual(0)
      }
    })
  })

  // ── healthCheck ─────────────────────────────────────────────────────────

  describe('healthCheck', () => {
    it('should return a HealthCheckOutput matching engine contract', async () => {
      const selectWhereFn = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ count: 0 }])
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })

      const output = await engine.healthCheck()

      expect(output).toHaveProperty('status')
      expect(output).toHaveProperty('checks')
      expect(output).toHaveProperty('timestamp')
      expect(output.status).toBe('healthy')
    })
  })

  // ── restartAgent ────────────────────────────────────────────────────────

  describe('restartAgent', () => {
    it('should update agent status to idle and clear locks', async () => {
      const result = await engine.restartAgent('agent-1', 'Manual restart')

      expect(result).toBe(true)
      expect(db.update).toHaveBeenCalledTimes(2)
      expect(db._mock.setFn).toHaveBeenCalledWith(expect.objectContaining({ status: 'idle' }))
      expect(db._mock.setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          lockOwner: null,
          lockedAt: null,
          leaseUntil: null,
        }),
      )
    })

    it('should log the restart action to the DB', async () => {
      await engine.restartAgent('agent-1', 'Health check triggered')

      // log() fires db.insert(healingLogs).values(...)
      expect(db.insert).toHaveBeenCalled()
      expect(db._mock.insertValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'restart_agent',
          target: 'agent-1',
          reason: 'Health check triggered',
          success: true,
        }),
      )
    })

    it('should return false on DB error', async () => {
      db.update.mockImplementation(() => {
        throw new Error('DB connection lost')
      })

      const result = await engine.restartAgent('agent-1', 'Retry after error')

      expect(result).toBe(false)
    })

    it('should log the failure when DB error occurs', async () => {
      db.update.mockImplementation(() => {
        throw new Error('DB connection lost')
      })

      await engine.restartAgent('agent-1', 'Retry after error')

      expect(db.insert).toHaveBeenCalled()
      expect(db._mock.insertValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'restart_agent',
          target: 'agent-1',
          success: false,
        }),
      )
    })
  })

  // ── clearExpiredLeases ──────────────────────────────────────────────────

  describe('clearExpiredLeases', () => {
    it('should return 0 when no expired leases exist', async () => {
      const selectWhereFn = vi.fn().mockResolvedValue([])
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })

      const count = await engine.clearExpiredLeases()

      expect(count).toBe(0)
    })

    it('should clear expired leases and requeue tickets', async () => {
      const expiredLeases = [
        { ticketId: 't1', lockOwner: 'a1' },
        { ticketId: 't2', lockOwner: 'a2' },
      ]
      const selectWhereFn = vi.fn().mockResolvedValue(expiredLeases)
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })

      const count = await engine.clearExpiredLeases()

      expect(count).toBe(2)
      // 2 leases * 2 updates each (ticketExecution + tickets)
      expect(db.update).toHaveBeenCalledTimes(4)
    })

    it('should log each cleared lease to the DB', async () => {
      const expiredLeases = [
        { ticketId: 't1', lockOwner: 'a1' },
        { ticketId: 't2', lockOwner: 'a2' },
      ]
      const selectWhereFn = vi.fn().mockResolvedValue(expiredLeases)
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })

      await engine.clearExpiredLeases()

      // log() is called once per lease
      expect(db._mock.insertValuesFn).toHaveBeenCalledTimes(2)
      expect(db._mock.insertValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'clear_lock', target: 't1' }),
      )
      expect(db._mock.insertValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'clear_lock', target: 't2' }),
      )
    })

    it('should set ticket status to queued and clear assignedAgentId', async () => {
      const expiredLeases = [{ ticketId: 't1', lockOwner: 'a1' }]
      const selectWhereFn = vi.fn().mockResolvedValue(expiredLeases)
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })

      await engine.clearExpiredLeases()

      expect(db._mock.setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'queued',
          assignedAgentId: null,
        }),
      )
    })
  })

  // ── requeueTicket ───────────────────────────────────────────────────────

  describe('requeueTicket', () => {
    it('should requeue a ticket and return true', async () => {
      const result = await engine.requeueTicket('t1', 'Manual requeue')

      expect(result).toBe(true)
      expect(db.update).toHaveBeenCalled()
      expect(db._mock.setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'queued',
          assignedAgentId: null,
        }),
      )
    })

    it('should log the requeue action to the DB', async () => {
      await engine.requeueTicket('t1', 'Retry failed ticket')

      expect(db.insert).toHaveBeenCalled()
      expect(db._mock.insertValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'requeue_ticket',
          target: 't1',
          reason: 'Retry failed ticket',
          success: true,
        }),
      )
    })

    it('should return false on DB error', async () => {
      db.update.mockImplementation(() => {
        throw new Error('DB write failed')
      })

      const result = await engine.requeueTicket('t1', 'Error retry')

      expect(result).toBe(false)
    })

    it('should log failure on DB error', async () => {
      db.update.mockImplementation(() => {
        throw new Error('DB write failed')
      })

      await engine.requeueTicket('t1', 'Error retry')

      expect(db.insert).toHaveBeenCalled()
      expect(db._mock.insertValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'requeue_ticket',
          target: 't1',
          success: false,
        }),
      )
    })
  })

  // ── autoHeal ────────────────────────────────────────────────────────────

  describe('autoHeal', () => {
    it('should run diagnose and clear expired leases', async () => {
      // diagnose queries
      const selectWhereFn = vi
        .fn()
        .mockResolvedValueOnce([]) // diagnose: expired leases
        .mockResolvedValueOnce([{ count: 0 }]) // diagnose: stuck tickets
        .mockResolvedValueOnce([{ count: 0 }]) // diagnose: failed tickets
        .mockResolvedValueOnce([]) // clearExpiredLeases: no expired
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })
      // autoHeal also calls findMany for error agents
      db.query.agents.findMany.mockResolvedValue([])

      const { report, actions } = await engine.autoHeal()

      expect(report.overallStatus).toBe('healthy')
      expect(actions).toHaveLength(0)
    })

    it('should restart error agents during autoHeal', async () => {
      const selectWhereFn = vi
        .fn()
        .mockResolvedValueOnce([]) // diagnose: expired leases
        .mockResolvedValueOnce([{ count: 0 }]) // diagnose: stuck tickets
        .mockResolvedValueOnce([{ count: 0 }]) // diagnose: failed tickets
        .mockResolvedValueOnce([]) // clearExpiredLeases
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })

      // First call in diagnose returns error agents, second call in autoHeal also returns them
      db.query.agents.findMany
        .mockResolvedValueOnce([{ id: 'a1', name: 'Agent 1', status: 'error' }]) // diagnose
        .mockResolvedValueOnce([{ id: 'a1', name: 'Agent 1', status: 'error' }]) // autoHeal loop

      const { actions } = await engine.autoHeal()

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual(
        expect.objectContaining({
          action: 'restart_agent',
          target: 'Agent 1',
          success: true,
        }),
      )
    })

    it('should include clear_lock action when expired leases exist', async () => {
      const selectWhereFn = vi
        .fn()
        .mockResolvedValueOnce([]) // diagnose: expired leases
        .mockResolvedValueOnce([{ count: 0 }]) // diagnose: stuck tickets
        .mockResolvedValueOnce([{ count: 0 }]) // diagnose: failed tickets
        .mockResolvedValueOnce([{ ticketId: 't1', lockOwner: 'a1' }]) // clearExpiredLeases: 1 expired
      const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
      db.select.mockReturnValue({ from: selectFromFn })
      db.query.agents.findMany.mockResolvedValue([])

      const { actions } = await engine.autoHeal()

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual(
        expect.objectContaining({
          action: 'clear_lock',
          target: '1 leases',
          success: true,
        }),
      )
    })
  })

  // ── getHealingLog ───────────────────────────────────────────────────────

  describe('getHealingLog', () => {
    it('should return empty log when DB has no entries', async () => {
      // Default mock: select().from().orderBy().limit() resolves to []
      const log = await engine.getHealingLog()
      expect(log).toEqual([])
    })

    it('should return mapped log entries from DB', async () => {
      const now = new Date()
      const limitFn = vi.fn().mockResolvedValue([
        {
          action: 'restart_agent',
          target: 'a1',
          reason: 'Reason 1',
          createdAt: now,
          success: true,
        },
        {
          action: 'requeue_ticket',
          target: 't1',
          reason: 'Reason 2',
          createdAt: now,
          success: true,
        },
      ])
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn })
      const fromFn = vi.fn().mockReturnValue({ orderBy: orderByFn })
      db.select.mockReturnValue({ from: fromFn })

      const log = await engine.getHealingLog()

      expect(log).toHaveLength(2)
      expect(log[0].action).toBe('restart_agent')
      expect(log[1].action).toBe('requeue_ticket')
    })

    it('should pass limit parameter to DB query', async () => {
      const limitFn = vi.fn().mockResolvedValue([])
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn })
      const fromFn = vi.fn().mockReturnValue({ orderBy: orderByFn })
      db.select.mockReturnValue({ from: fromFn })

      await engine.getHealingLog(2)

      expect(limitFn).toHaveBeenCalledWith(2)
    })

    it('should default to 50 entries', async () => {
      const limitFn = vi.fn().mockResolvedValue([])
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn })
      const fromFn = vi.fn().mockReturnValue({ orderBy: orderByFn })
      db.select.mockReturnValue({ from: fromFn })

      const log = await engine.getHealingLog()

      expect(log).toEqual([])
      expect(limitFn).toHaveBeenCalledWith(50)
    })

    it('should include timestamp in log entries', async () => {
      const now = new Date()
      const limitFn = vi
        .fn()
        .mockResolvedValue([
          { action: 'restart_agent', target: 'a1', reason: 'Test', createdAt: now, success: true },
        ])
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn })
      const fromFn = vi.fn().mockReturnValue({ orderBy: orderByFn })
      db.select.mockReturnValue({ from: fromFn })

      const log = await engine.getHealingLog()
      expect(log[0].timestamp).toBeInstanceOf(Date)
    })
  })
})
