import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('@solarc/db', () => ({
  deploymentWorkflows: { id: 'id', status: 'status', createdAt: 'createdAt' },
}))

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  desc: (col: string) => ({ desc: col }),
  eq: (col: string, val: string) => ({ col, val }),
}))

vi.mock('../../services/platform/deployment-workflow', () => ({
  advanceWorkflow: vi.fn(),
  cancelWorkflow: vi.fn(),
  confirmManualStep: vi.fn(),
  getWorkflowWithEntity: vi.fn(),
  retryStep: vi.fn(),
}))

vi.mock('../../services/platform/permissions', () => ({
  assertPermission: vi.fn(),
}))

const { deploymentsRouter } = await import('../deployments')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deployments router', () => {
  it('should be defined', () => {
    expect(deploymentsRouter).toBeDefined()
  })

  it('should have list procedure', () => {
    expect(deploymentsRouter.list).toBeDefined()
  })

  it('should have byId procedure', () => {
    expect(deploymentsRouter.byId).toBeDefined()
  })
})
