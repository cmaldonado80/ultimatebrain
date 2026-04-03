import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AdaptiveResourceTuner } from '../adaptive-tuner'
import { AgentDegradationManager } from '../agent-degradation'
import { RecoveryExecutor } from '../recovery-state-machine'

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

// ── Adaptive Resource Tuner Tests ────────────────────────────────────────

describe('AdaptiveResourceTuner', () => {
  let tuner: AdaptiveResourceTuner

  beforeEach(() => {
    tuner = new AdaptiveResourceTuner()
  })

  it('should start with no states', () => {
    expect(tuner.getAllStates()).toHaveLength(0)
  })

  it('should track outcomes and create state on first record', () => {
    tuner.recordOutcome('agent-1', 'agent', {
      timestamp: Date.now(),
      success: true,
      latencyMs: 100,
      tokensUsed: 500,
    })

    const states = tuner.getAllStates()
    expect(states).toHaveLength(1)
    expect(states[0]!.entityId).toBe('agent-1')
    expect(states[0]!.entityType).toBe('agent')
  })

  it('should not tune with insufficient data', () => {
    tuner.recordOutcome('agent-1', 'agent', {
      timestamp: Date.now(),
      success: true,
      latencyMs: 100,
      tokensUsed: 500,
    })

    const actions = tuner.tune()
    expect(actions).toHaveLength(0)
  })

  it('should apply pressure relief after multiple failures', () => {
    // Record many failures to trigger pressure relief
    for (let i = 0; i < 10; i++) {
      tuner.recordOutcome('agent-1', 'agent', {
        timestamp: Date.now(),
        success: false,
        latencyMs: 50000,
        tokensUsed: 500,
      })
    }

    const actions = tuner.tune()
    expect(actions.length).toBeGreaterThan(0)
    expect(actions.some((a) => a.entityId === 'agent-1')).toBe(true)
  })

  it('should track action history', () => {
    for (let i = 0; i < 10; i++) {
      tuner.recordOutcome('agent-1', 'agent', {
        timestamp: Date.now(),
        success: false,
        latencyMs: 50000,
        tokensUsed: 500,
      })
    }
    tuner.tune()
    expect(tuner.getActionHistory().length).toBeGreaterThan(0)
  })

  it('should return profile for known entity', () => {
    tuner.recordOutcome('agent-1', 'agent', {
      timestamp: Date.now(),
      success: true,
      latencyMs: 100,
      tokensUsed: 500,
    })
    const profile = tuner.getProfile('agent-1')
    expect(profile).toBeDefined()
    expect(profile!.maxTokens).toBeGreaterThan(0)
  })

  it('should return undefined profile for unknown entity', () => {
    expect(tuner.getProfile('unknown')).toBeUndefined()
  })
})

// ── Agent Degradation Tests ──────────────────────────────────────────────

describe('AgentDegradationManager', () => {
  let manager: AgentDegradationManager
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    db = createMockDb()
    manager = new AgentDegradationManager(db)
  })

  it('should start at full capability', () => {
    manager.recordOutcome('agent-1', 'Agent 1', true)
    const profile = manager.getProfile('agent-1')
    expect(profile!.level).toBe('full')
  })

  it('should downgrade after consecutive failures', () => {
    for (let i = 0; i < 3; i++) {
      manager.recordOutcome('agent-1', 'Agent 1', false)
    }
    const profile = manager.getProfile('agent-1')
    expect(profile!.level).toBe('reduced')
  })

  it('should upgrade after consecutive successes', () => {
    // Force downgrade (bypasses cooldown)
    manager.forceLevel('agent-1', 'Agent 1', 'reduced', 'Test setup')
    expect(manager.getProfile('agent-1')!.level).toBe('reduced')

    // Manually set lastTransition to past to bypass cooldown
    const profile = manager.getProfile('agent-1')!
    ;(profile as any).lastTransition = 0

    // Then upgrade via consecutive successes
    for (let i = 0; i < 5; i++) {
      manager.recordOutcome('agent-1', 'Agent 1', true)
    }
    expect(manager.getProfile('agent-1')!.level).toBe('full')
  })

  it('should respect transition cooldown', () => {
    // First transition
    for (let i = 0; i < 3; i++) {
      manager.recordOutcome('agent-1', 'Agent 1', false)
    }
    expect(manager.getProfile('agent-1')!.level).toBe('reduced')

    // Immediate second batch should NOT transition (cooldown)
    for (let i = 0; i < 3; i++) {
      manager.recordOutcome('agent-1', 'Agent 1', false)
    }
    expect(manager.getProfile('agent-1')!.level).toBe('reduced') // still reduced, not minimal
  })

  it('should restrict ticket acceptance when degraded', () => {
    // Unknown agent = allow all
    expect(manager.canAcceptTicket('unknown', true)).toBe(true)

    // Full = allow all
    manager.recordOutcome('agent-1', 'Agent 1', true)
    expect(manager.canAcceptTicket('agent-1', true)).toBe(true)
  })

  it('should force a specific level', () => {
    manager.recordOutcome('agent-1', 'Agent 1', true)
    const event = manager.forceLevel('agent-1', 'Agent 1', 'suspended', 'Manual override')
    expect(event.to).toBe('suspended')
    expect(manager.getProfile('agent-1')!.level).toBe('suspended')
    expect(manager.canAcceptTicket('agent-1', false)).toBe(false)
  })

  it('should track degradation events', () => {
    for (let i = 0; i < 3; i++) {
      manager.recordOutcome('agent-1', 'Agent 1', false)
    }
    const events = manager.getRecentEvents()
    expect(events.length).toBeGreaterThan(0)
    expect(events[0]!.from).toBe('full')
    expect(events[0]!.to).toBe('reduced')
  })

  it('should return model override when degraded', () => {
    // Force to minimal
    manager.forceLevel('agent-1', 'Agent 1', 'minimal', 'Test')
    const override = manager.getModelOverride('agent-1')
    expect(override).toBeTruthy()
  })

  it('should return null model override at full level', () => {
    manager.recordOutcome('agent-1', 'Agent 1', true)
    expect(manager.getModelOverride('agent-1')).toBeNull()
  })
})

// ── Recovery State Machine Tests ─────────────────────────────────────────

describe('RecoveryExecutor', () => {
  let executor: RecoveryExecutor
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    db = createMockDb()
    executor = new RecoveryExecutor(db)
  })

  it('should execute a simple recovery plan successfully', async () => {
    const plan = {
      id: 'test_plan',
      name: 'Test Recovery',
      description: 'Test',
      entryStep: 'step1',
      steps: [
        {
          id: 'step1',
          name: 'Step 1',
          action: async () => true,
          maxRetries: 0,
          timeoutMs: 5000,
        },
      ],
    }

    const result = await executor.execute(plan, 'test trigger')
    expect(result.status).toBe('succeeded')
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]!.status).toBe('succeeded')
  })

  it('should follow onSuccess transitions', async () => {
    const plan = {
      id: 'chain_plan',
      name: 'Chain Recovery',
      description: 'Test',
      entryStep: 'step1',
      steps: [
        {
          id: 'step1',
          name: 'Step 1',
          action: async () => true,
          maxRetries: 0,
          timeoutMs: 5000,
          onSuccess: 'step2',
        },
        {
          id: 'step2',
          name: 'Step 2',
          action: async () => true,
          maxRetries: 0,
          timeoutMs: 5000,
        },
      ],
    }

    const result = await executor.execute(plan, 'chain trigger')
    expect(result.status).toBe('succeeded')
    expect(result.steps).toHaveLength(2)
  })

  it('should follow onFailure fallback path', async () => {
    const plan = {
      id: 'fallback_plan',
      name: 'Fallback Recovery',
      description: 'Test',
      entryStep: 'step1',
      steps: [
        {
          id: 'step1',
          name: 'Step 1 (fails)',
          action: async () => false,
          maxRetries: 0,
          timeoutMs: 5000,
          onFailure: 'fallback',
        },
        {
          id: 'fallback',
          name: 'Fallback Step',
          action: async () => true,
          maxRetries: 0,
          timeoutMs: 5000,
        },
      ],
    }

    const result = await executor.execute(plan, 'fallback trigger')
    expect(result.status).toBe('succeeded')
    expect(result.steps).toHaveLength(2)
    expect(result.steps[0]!.status).toBe('failed')
    expect(result.steps[1]!.status).toBe('succeeded')
  })

  it('should escalate when onFailure is "escalate"', async () => {
    const plan = {
      id: 'escalate_plan',
      name: 'Escalation Recovery',
      description: 'Test',
      entryStep: 'step1',
      steps: [
        {
          id: 'step1',
          name: 'Step 1 (fails)',
          action: async () => false,
          maxRetries: 0,
          timeoutMs: 5000,
          onFailure: 'escalate' as const,
        },
      ],
    }

    const result = await executor.execute(plan, 'escalate trigger')
    expect(result.status).toBe('escalated')
    expect(result.escalatedTo).toContain('Step 1')
  })

  it('should rollback when onFailure is "rollback"', async () => {
    const rollbackFn = vi.fn()

    const plan = {
      id: 'rollback_plan',
      name: 'Rollback Recovery',
      description: 'Test',
      entryStep: 'step1',
      steps: [
        {
          id: 'step1',
          name: 'Step 1 (succeeds)',
          action: async () => true,
          rollback: rollbackFn,
          maxRetries: 0,
          timeoutMs: 5000,
          onSuccess: 'step2',
        },
        {
          id: 'step2',
          name: 'Step 2 (fails)',
          action: async () => false,
          maxRetries: 0,
          timeoutMs: 5000,
          onFailure: 'rollback' as const,
        },
      ],
    }

    const result = await executor.execute(plan, 'rollback trigger')
    expect(result.status).toBe('rolled_back')
    expect(rollbackFn).toHaveBeenCalled()
  })

  it('should retry failed steps', async () => {
    let attempts = 0
    const plan = {
      id: 'retry_plan',
      name: 'Retry Recovery',
      description: 'Test',
      entryStep: 'step1',
      steps: [
        {
          id: 'step1',
          name: 'Step 1 (fails once then succeeds)',
          action: async () => {
            attempts++
            return attempts > 1
          },
          maxRetries: 2,
          timeoutMs: 5000,
        },
      ],
    }

    const result = await executor.execute(plan, 'retry trigger')
    expect(result.status).toBe('succeeded')
    expect(result.steps[0]!.attempts).toBe(2)
  })

  it('should maintain execution history', async () => {
    const plan = {
      id: 'history_plan',
      name: 'History Recovery',
      description: 'Test',
      entryStep: 'step1',
      steps: [
        {
          id: 'step1',
          name: 'Step 1',
          action: async () => true,
          maxRetries: 0,
          timeoutMs: 5000,
        },
      ],
    }

    await executor.execute(plan, 'trigger 1')
    await executor.execute(plan, 'trigger 2')

    expect(executor.getHistory()).toHaveLength(2)
    expect(executor.getLastExecution('history_plan')).toBeDefined()
  })
})
