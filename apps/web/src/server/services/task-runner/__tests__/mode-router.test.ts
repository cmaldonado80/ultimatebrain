import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { createMockDb } from '../../../../../../../test/helpers/db-mock'
import type { Database } from '@solarc/db'

// Mock env module before importing ModeRouter (it transitively validates DATABASE_URL)
vi.mock('../../../../env', () => ({
  env: {
    DATABASE_URL: 'postgres://localhost:5432/test',
    NODE_ENV: 'test',
    BRAIN_VERSION: '1.0.0',
    BRAIN_NAME: 'TestBrain',
  },
}))

// Dynamic import after mock is set up
type ModeRouterClass = InstanceType<typeof import('../mode-router').ModeRouter>

describe('ModeRouter', () => {
  let db: ReturnType<typeof createMockDb>
  let router: ModeRouterClass
  let ModeRouter: typeof import('../mode-router').ModeRouter

  beforeAll(async () => {
    const mod = await import('../mode-router')
    ModeRouter = mod.ModeRouter
  })

  beforeEach(() => {
    db = createMockDb()
    router = new ModeRouter(db as unknown as Database)
  })

  describe('detectMode', () => {
    it('returns quick for easy tickets without project', async () => {
      db.query.tickets.findFirst.mockResolvedValue({
        id: 't1',
        complexity: 'easy',
        executionMode: null,
        projectId: null,
      })
      const mode = await router.detectMode('t1')
      expect(mode).toBe('quick')
    })

    it('returns autonomous for medium complexity tickets', async () => {
      db.query.tickets.findFirst.mockResolvedValue({
        id: 't1',
        complexity: 'medium',
        executionMode: null,
        projectId: null,
      })
      const mode = await router.detectMode('t1')
      expect(mode).toBe('autonomous')
    })

    it('returns deep_work for critical complexity', async () => {
      db.query.tickets.findFirst.mockResolvedValue({
        id: 't1',
        complexity: 'critical',
        executionMode: null,
        projectId: null,
      })
      const mode = await router.detectMode('t1')
      expect(mode).toBe('deep_work')
    })

    it('returns deep_work for project-level tickets', async () => {
      db.query.tickets.findFirst.mockResolvedValue({
        id: 't1',
        complexity: 'medium',
        executionMode: null,
        projectId: 'p1',
      })
      const mode = await router.detectMode('t1')
      expect(mode).toBe('deep_work')
    })

    it('respects explicit executionMode override', async () => {
      db.query.tickets.findFirst.mockResolvedValue({
        id: 't1',
        complexity: 'easy',
        executionMode: 'deep_work',
        projectId: null,
      })
      const mode = await router.detectMode('t1')
      expect(mode).toBe('deep_work')
    })

    it('throws for non-existent ticket', async () => {
      db.query.tickets.findFirst.mockResolvedValue(null)
      await expect(router.detectMode('missing')).rejects.toThrow('not found')
    })

    it('defaults to autonomous when executionMode is "autonomous"', async () => {
      db.query.tickets.findFirst.mockResolvedValue({
        id: 't1',
        complexity: 'hard',
        executionMode: 'autonomous',
        projectId: null,
      })
      const mode = await router.detectMode('t1')
      expect(mode).toBe('autonomous')
    })
  })
})
