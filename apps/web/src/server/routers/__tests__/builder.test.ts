import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('@solarc/db', () => ({
  improvementProposals: { id: 'id', domain: 'domain' },
  productEvents: { id: 'id' },
}))

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  desc: (col: string) => ({ desc: col }),
  eq: (col: string, val: string) => ({ col, val }),
}))

vi.mock('../../services/builder/blueprint-generator', () => ({
  generateBlueprint: vi.fn().mockResolvedValue({ domain: 'test', layers: [] }),
}))

vi.mock('../../services/builder/execution-engine', () => ({
  generateExecutionPlan: vi.fn().mockResolvedValue({ steps: [] }),
  executeAction: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('../../services/builder/gap-detector', () => ({
  detectGaps: vi.fn().mockResolvedValue({ gaps: [] }),
}))

vi.mock('../../services/builder/proposal-generator', () => ({
  generateProposals: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../services/builder/system-inspector', () => ({
  inspectDomainState: vi.fn().mockResolvedValue({ entities: [] }),
}))

vi.mock('../../services/platform/audit', () => ({
  auditEvent: vi.fn(),
}))

vi.mock('../../services/platform/permissions', () => ({
  assertPermission: vi.fn(),
}))

const { builderRouter } = await import('../builder')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('builder router', () => {
  it('should be defined', () => {
    expect(builderRouter).toBeDefined()
  })

  it('should have generateBlueprint procedure', () => {
    expect(builderRouter.generateBlueprint).toBeDefined()
  })

  it('should have inspectDomain procedure', () => {
    expect(builderRouter.inspectDomain).toBeDefined()
  })

  it('should have getGapReport procedure', () => {
    expect(builderRouter.getGapReport).toBeDefined()
  })

  it('should have getExecutionPlan procedure', () => {
    expect(builderRouter.getExecutionPlan).toBeDefined()
  })

  it('should have getProposals procedure', () => {
    expect(builderRouter.getRoadmap).toBeDefined()
  })
})
