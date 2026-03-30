import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('@solarc/db', () => ({
  modelRegistry: { id: 'id', provider: 'provider', modelType: 'modelType' },
  ollamaModels: { id: 'id' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
}))

vi.mock('../../services/gateway/model-type-detector', () => ({
  ModelTypeDetector: vi.fn().mockImplementation(() => ({
    detect: vi.fn().mockReturnValue('reasoning'),
  })),
}))

const { modelRegistryRouter } = await import('../model-registry')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('model-registry router', () => {
  it('should be defined', () => {
    expect(modelRegistryRouter).toBeDefined()
  })

  it('should have availableModels procedure', () => {
    expect(modelRegistryRouter.availableModels).toBeDefined()
  })

  it('should have byType procedure', () => {
    expect(modelRegistryRouter.byType).toBeDefined()
  })

  it('should have list procedure', () => {
    expect(modelRegistryRouter.list).toBeDefined()
  })

  it('should have byId procedure', () => {
    expect(modelRegistryRouter.byId).toBeDefined()
  })
})
