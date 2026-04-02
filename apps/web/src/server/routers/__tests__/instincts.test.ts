import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('@solarc/db', () => ({
  instincts: { id: 'id', scope: 'scope', domain: 'domain', createdAt: 'createdAt' },
  instinctObservations: { id: 'id', instinctId: 'instinctId', createdAt: 'createdAt' },
}))

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  desc: (col: string) => ({ desc: col }),
  eq: (col: string, val: string) => ({ col, val }),
}))

const { instinctsRouter } = await import('../instincts')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('instincts router', () => {
  it('should be defined', () => {
    expect(instinctsRouter).toBeDefined()
  })

  it('should have list procedure', () => {
    expect(instinctsRouter.list).toBeDefined()
  })

  it('should have create procedure', () => {
    expect(instinctsRouter.create).toBeDefined()
  })

  it('should have byId procedure', () => {
    expect(instinctsRouter.byId).toBeDefined()
  })
})
