import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('@solarc/db', () => ({
  brainEntities: { id: 'id', tier: 'tier' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
}))

vi.mock('../../services/engine-registry/registry', () => ({
  EngineRegistry: vi.fn().mockImplementation(() => ({
    list: vi.fn().mockReturnValue([]),
    get: vi.fn(),
    updateStatus: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
    recordRequest: vi.fn(),
    listByCategory: vi.fn().mockReturnValue([]),
  })),
}))

const { engineRegistryRouter } = await import('../engine-registry')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('engine-registry router', () => {
  it('should be defined', () => {
    expect(engineRegistryRouter).toBeDefined()
  })

  it('should have list procedure', () => {
    expect(engineRegistryRouter.list).toBeDefined()
  })

  it('should have registerEngine procedure', () => {
    expect(engineRegistryRouter.registerEngine).toBeDefined()
  })

  it('should have healthCheck procedure', () => {
    expect(engineRegistryRouter.healthCheck).toBeDefined()
  })

  it('should have listByCategory procedure', () => {
    expect(engineRegistryRouter.listByCategory).toBeDefined()
  })
})
