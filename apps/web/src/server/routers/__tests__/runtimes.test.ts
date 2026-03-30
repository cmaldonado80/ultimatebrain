import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('@solarc/db', () => ({
  brainEntities: { id: 'id', tier: 'tier', environment: 'environment', createdAt: 'createdAt' },
}))

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  desc: (col: string) => ({ desc: col }),
  eq: (col: string, val: string) => ({ col, val }),
}))

vi.mock('../../services/platform/audit', () => ({
  auditEvent: vi.fn(),
}))

vi.mock('../../services/platform/permissions', () => ({
  assertPermission: vi.fn(),
}))

const { runtimesRouter } = await import('../runtimes')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runtimes router', () => {
  it('should be defined', () => {
    expect(runtimesRouter).toBeDefined()
  })

  it('should have getRuntimes procedure', () => {
    expect(runtimesRouter.getRuntimes).toBeDefined()
  })

  it('should have getRuntime procedure', () => {
    expect(runtimesRouter.getRuntime).toBeDefined()
  })

  it('should have registerEndpoint procedure', () => {
    expect(runtimesRouter.registerEndpoint).toBeDefined()
  })
})
