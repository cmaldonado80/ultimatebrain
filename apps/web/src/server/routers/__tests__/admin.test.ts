import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('@solarc/db', () => ({
  organizations: { id: 'id', createdAt: 'createdAt' },
  organizationMembers: { organizationId: 'organizationId' },
  users: { id: 'id', createdAt: 'createdAt' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
}))

vi.mock('../../services/platform/permissions', () => ({
  assertPermission: vi.fn(),
}))

const { adminRouter } = await import('../admin')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('admin router', () => {
  it('should be defined', () => {
    expect(adminRouter).toBeDefined()
  })

  it('should have listAllOrgs procedure', () => {
    expect(adminRouter.listAllOrgs).toBeDefined()
  })

  it('should have getOrgById procedure', () => {
    expect(adminRouter.getOrgById).toBeDefined()
  })

  it('should have listOrgMembers procedure', () => {
    expect(adminRouter.listOrgMembers).toBeDefined()
  })

  it('should have listAllUsers procedure', () => {
    expect(adminRouter.listAllUsers).toBeDefined()
  })
})
