/**
 * Worker job handler tests — verify job handlers execute services correctly.
 *
 * We test the handler functions in isolation by mocking the pg-boss
 * `work()` callback interface and verifying each handler calls the
 * expected service method(s).
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'

// === Mocked service modules ===

const mockProcessPromotions = vi.fn().mockResolvedValue({ promoted: 3, rejected: 1 })
const mockDecayConfidence = vi.fn().mockResolvedValue({ decayed: 2 })
const mockRunCycle = vi.fn().mockResolvedValue({
  timestamp: new Date(),
  durationMs: 450,
  phases: {
    observe: { predictiveReport: {}, metricsCollected: true },
    orient: { riskLevel: 'low', immediateThreats: 0, instinctMatches: 0 },
    decide: { recoveryPlansQueued: 0, tuningActionsPlanned: 0, degradationsPending: 0 },
    act: {
      healingActions: [],
      recoveryExecutions: [],
      tuningActions: [],
      instinctExecutions: [],
      degradationEvents: [],
    },
    learn: { outcomesRecorded: 0, confidenceUpdates: 0 },
  },
})
const mockRunInstinctPipeline = vi.fn().mockResolvedValue({
  observationsProcessed: 10,
  candidatesCreated: 2,
  confidenceUpdated: 5,
  decayed: 1,
  promoted: 1,
})

// Mock all service imports so worker module doesn't need a real DB
vi.mock('../../../web/src/server/services/evals/runner', () => ({
  EvalRunner: vi.fn().mockImplementation(() => ({
    runDataset: vi.fn().mockResolvedValue({ runId: 'r1', overallScore: 0.85, passRate: 0.9 }),
  })),
}))

vi.mock('../../../web/src/server/services/healing/cortex', () => ({
  SelfHealingCortex: vi.fn().mockImplementation(() => ({
    runCycle: mockRunCycle,
  })),
}))

vi.mock('../../../web/src/server/services/healing/healing-engine', () => ({
  HealingEngine: vi.fn().mockImplementation(() => ({
    diagnose: vi
      .fn()
      .mockResolvedValue({ overallStatus: 'healthy', checks: [], recommendations: [] }),
  })),
}))

vi.mock('../../../web/src/server/services/instincts/instinct-pipeline', () => ({
  runInstinctPipeline: mockRunInstinctPipeline,
}))

vi.mock('../../../web/src/server/services/instincts/evolve', () => ({
  InstinctEvolver: vi.fn().mockImplementation(() => ({
    findRelatedClusters: vi.fn().mockReturnValue([]),
    evolveToSkill: vi.fn().mockResolvedValue(null),
  })),
}))

vi.mock('../../../web/src/server/services/instincts/observer', () => ({
  InstinctObserver: vi.fn().mockImplementation(() => ({
    flush: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('../../../web/src/server/services/memory/memory-service', () => ({
  MemoryService: vi.fn().mockImplementation(() => ({
    processPromotions: mockProcessPromotions,
    decayConfidence: mockDecayConfidence,
  })),
}))

vi.mock('../../../web/src/server/services/orchestration/cron-engine', () => ({
  CronEngine: vi.fn().mockImplementation(() => ({
    getDueJobs: vi.fn().mockResolvedValue([]),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  })),
}))

vi.mock('../../../web/src/server/services/orchestration/ticket-engine', () => ({
  TicketExecutionEngine: vi.fn().mockImplementation(() => ({
    transition: vi.fn(),
  })),
}))

vi.mock('../../../web/src/server/services/task-runner/mode-router', () => ({
  ModeRouter: vi.fn().mockImplementation(() => ({
    route: vi.fn().mockResolvedValue({ mode: 'autonomous', latencyMs: 100 }),
  })),
}))

// Capture job handlers registered via boss.work()
type JobHandler = (jobs: Array<{ data: unknown }>) => Promise<void>
const handlers = new Map<string, JobHandler>()
const schedules = new Map<string, string>()

vi.mock('pg-boss', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    work: vi.fn(async (name: string, handler: JobHandler) => {
      handlers.set(name, handler)
    }),
    schedule: vi.fn(async (name: string, cron: string) => {
      schedules.set(name, cron)
    }),
  })),
}))

vi.mock('@solarc/db', () => ({
  createDb: vi.fn().mockReturnValue({
    query: {
      instincts: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  }),
}))

describe('Worker Job Handlers', () => {
  // Import the worker module — this registers all handlers
  beforeAll(async () => {
    await import('../index')
    // Give the main() promise time to resolve
    await new Promise((r) => setTimeout(r, 50))
  })

  it('registers all expected job handlers', () => {
    expect(handlers.has('ticket:execute')).toBe(true)
    expect(handlers.has('cron:execute')).toBe(true)
    expect(handlers.has('memory:compact')).toBe(true)
    expect(handlers.has('eval:run')).toBe(true)
    expect(handlers.has('health:check')).toBe(true)
    expect(handlers.has('instinct:observe')).toBe(true)
    expect(handlers.has('healing:cycle')).toBe(true)
    expect(handlers.has('instinct:pipeline')).toBe(true)
    expect(handlers.has('instinct:evolve')).toBe(true)
  })

  it('registers periodic schedules', () => {
    expect(schedules.get('healing:cycle')).toBe('*/10 * * * *')
    expect(schedules.get('instinct:pipeline')).toBe('0 2 * * *')
    expect(schedules.get('instinct:evolve')).toBe('0 3 * * 0')
  })

  it('memory:compact calls both processPromotions and decayConfidence', async () => {
    const handler = handlers.get('memory:compact')!
    await handler([{ data: { workspaceId: 'ws-1' } }])

    expect(mockProcessPromotions).toHaveBeenCalled()
    expect(mockDecayConfidence).toHaveBeenCalled()
  })

  it('healing:cycle calls cortex.runCycle()', async () => {
    const handler = handlers.get('healing:cycle')!
    await handler([{ data: {} }])

    expect(mockRunCycle).toHaveBeenCalled()
  })

  it('instinct:pipeline calls runInstinctPipeline()', async () => {
    const handler = handlers.get('instinct:pipeline')!
    await handler([{ data: {} }])

    expect(mockRunInstinctPipeline).toHaveBeenCalled()
  })
})
