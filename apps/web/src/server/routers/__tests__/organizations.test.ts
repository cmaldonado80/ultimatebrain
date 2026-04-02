import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('@solarc/db', () => ({
  organizations: { id: 'id', name: 'name', slug: 'slug' },
  organizationMembers: { userId: 'userId', organizationId: 'organizationId' },
  users: { id: 'id' },
  userRoles: { userId: 'userId' },
}))

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (col: string, val: string) => ({ col, val }),
}))

vi.mock('../../services/platform/audit', () => ({
  auditEvent: vi.fn(),
}))

const { organizationsRouter } = await import('../organizations')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('organizations router', () => {
  it('should be defined', () => {
    expect(organizationsRouter).toBeDefined()
  })

  it('should have list procedure', () => {
    expect(organizationsRouter.list).toBeDefined()
  })

  it('should have byId procedure', () => {
    expect(organizationsRouter.byId).toBeDefined()
  })

  it('should have create procedure', () => {
    expect(organizationsRouter.create).toBeDefined()
  })

  it('should have update procedure', () => {
    expect(organizationsRouter.update).toBeDefined()
  })
})
