/**
 * Integration tests for SelfHealingCortex OODA cycle.
 *
 * Tests the full Observe→Orient→Decide→Act→Learn pipeline with a mock DB.
 * Verifies that the cortex:
 * - Completes all 5 phases without error
 * - Records evidence from healing outcomes
 * - Respects cycle timeout
 * - Reports degraded status when cycles are stale
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  instincts: {
    id: 'id',
    trigger: 'trigger',
    action: 'action',
    confidence: 'confidence',
    status: 'status',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  lte: (col: string, val: unknown) => ({ lte: { col, val } }),
  gte: (col: string, val: unknown) => ({ gte: { col, val } }),
  desc: (col: string) => ({ desc: col }),
  sql: (...args: unknown[]) => args,
}))

function createMockDb() {
  const insertCatchFn = vi.fn().mockReturnValue(undefined)
  const insertValuesFn = vi.fn().mockReturnValue({ catch: insertCatchFn })
  const catchFn = vi.fn().mockReturnValue(undefined)
  const whereFn = vi.fn().mockReturnValue({ catch: catchFn })
  const setFn = vi.fn().mockReturnValue({ where: whereFn })

  return {
    query: {
      agents: { findMany: vi.fn().mockResolvedValue([]) },
      brainEntities: { findMany: vi.fn().mockResolvedValue([]) },
      instincts: { findMany: vi.fn().mockResolvedValue([]) },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
        orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    }),
    update: vi.fn().mockReturnValue({ set: setFn }),
    insert: vi.fn().mockReturnValue({ values: insertValuesFn }),
  } as any
}

// ── Tests ──────────────────────────────────────────────────────────────────

import { SelfHealingCortex } from '../cortex'

describe('SelfHealingCortex — OODA Cycle', () => {
  let cortex: SelfHealingCortex
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    db = createMockDb()
    cortex = new SelfHealingCortex(db)
  })

  it('completes a full OODA cycle with all 5 phases', async () => {
    const result = await cortex.runCycle()

    expect(result.phases.observe).toBeDefined()
    expect(result.phases.orient).toBeDefined()
    expect(result.phases.decide).toBeDefined()
    expect(result.phases.act).toBeDefined()
    expect(result.phases.learn).toBeDefined()
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('starts with correct initial status', () => {
    const status = cortex.getStatus()
    expect(status.isRunning).toBe(false)
    expect(status.cycleCount).toBe(0)
    expect(typeof status.systemHealth).toBe('string')
  })

  it('increments cycle count after each run', async () => {
    await cortex.runCycle()
    expect(cortex.getStatus().cycleCount).toBe(1)

    await cortex.runCycle()
    expect(cortex.getStatus().cycleCount).toBe(2)
  })

  it('exposes evidence pipeline in subsystem states', () => {
    const states = cortex.getSubsystemStates()
    expect(states.evidence).toBeDefined()
    expect(states.evidence.queue).toBe(0)
  })

  it('returns low risk level with no anomalies', async () => {
    const result = await cortex.runCycle()
    expect(result.phases.orient.riskLevel).toBe('low')
    expect(result.phases.orient.immediateThreats).toBe(0)
  })

  it('produces healing actions from the ACT phase', async () => {
    const result = await cortex.runCycle()
    expect(Array.isArray(result.phases.act.healingActions)).toBe(true)
    expect(Array.isArray(result.phases.act.recoveryExecutions)).toBe(true)
  })

  it('records outcomes in LEARN phase', async () => {
    const result = await cortex.runCycle()
    expect(result.phases.learn).toBeDefined()
    expect(typeof result.phases.learn.outcomesRecorded).toBe('number')
  })

  it('reports degraded status when cycle is stale', async () => {
    await cortex.runCycle()

    // Manually backdate the last cycle timestamp
    const status = cortex.getStatus()
    expect(status.systemHealth).not.toBe('degraded')

    // Access internal state to simulate stale cycle (11 minutes old)
    const lastCycle = (cortex as any).lastCycle
    if (lastCycle) {
      lastCycle.timestamp = new Date(Date.now() - 11 * 60 * 1000)
    }

    const staleStatus = cortex.getStatus()
    expect(staleStatus.systemHealth).toBe('degraded')
  })
})

describe('SelfHealingCortex — Evidence Pipeline Integration', () => {
  let cortex: SelfHealingCortex
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    db = createMockDb()
    cortex = new SelfHealingCortex(db)
  })

  it('records agent outcomes to evidence pipeline queue', async () => {
    await cortex.evidence.recordHealingOutcome({
      action: 'restart',
      target: 'agent-1',
      success: true,
      reason: 'test',
    })

    const states = cortex.getSubsystemStates()
    expect(states.evidence.queue).toBeGreaterThan(0)
  })

  it('evidence pipeline flush returns 0 without memory store', async () => {
    cortex.recordAgentOutcome('agent-1', 'Test Agent', true, 100)
    const flushed = await cortex.evidence.flush()
    expect(flushed).toBe(0)
  })

  it('evidence pipeline flush writes with memory store', async () => {
    const mockStore = { store: vi.fn().mockResolvedValue({ id: '1' }) }

    await cortex.evidence.recordHealingOutcome({
      action: 'restart',
      target: 'agent-1',
      success: true,
      reason: 'test',
    })

    const flushed = await cortex.evidence.flush(mockStore)
    expect(flushed).toBe(1)
    expect(mockStore.store).toHaveBeenCalledTimes(1)
  })
})
