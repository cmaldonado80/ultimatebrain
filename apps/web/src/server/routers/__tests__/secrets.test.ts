import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('../../services/platform/permissions', () => ({
  assertPermission: vi.fn(),
}))

vi.mock('../../services/platform/secret-manager', () => ({
  listSecrets: vi.fn().mockResolvedValue([]),
  getSecretMetadata: vi.fn().mockResolvedValue(null),
  createSecret: vi.fn().mockResolvedValue({ id: 'secret-1' }),
  rotateSecret: vi.fn().mockResolvedValue({ id: 'secret-1' }),
  activateSecret: vi.fn().mockResolvedValue({ success: true }),
  revokeSecret: vi.fn().mockResolvedValue({ success: true }),
  rollbackRotation: vi.fn().mockResolvedValue({ success: true }),
}))

const { secretsRouter } = await import('../secrets')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('secrets router', () => {
  it('should be defined', () => {
    expect(secretsRouter).toBeDefined()
  })

  it('should have list procedure', () => {
    expect(secretsRouter.list).toBeDefined()
  })

  it('should have rotate procedure', () => {
    expect(secretsRouter.rotate).toBeDefined()
  })

  it('should have activate procedure', () => {
    expect(secretsRouter.activate).toBeDefined()
  })

  it('should have revoke procedure', () => {
    expect(secretsRouter.revoke).toBeDefined()
  })
})
