import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

function createMockDb() {
  return {} as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('@solarc/db', () => ({
  default: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
}))

const mockBrowse = vi.fn()
const mockGetInstalled = vi.fn()
const mockInstall = vi.fn()
const mockUninstall = vi.fn()

vi.mock('../../services/skills/marketplace', () => ({
  SkillMarketplace: vi.fn().mockImplementation(() => ({
    browse: mockBrowse,
    getInstalled: mockGetInstalled,
    install: mockInstall,
    uninstall: mockUninstall,
  })),
}))

const { skillsRouter } = await import('../skills')

import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) =>
  t.createCallerFactory(skillsRouter as Parameters<typeof t.createCallerFactory>[0])(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('skills router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('browse', () => {
    it('returns all skills', async () => {
      const skills = [
        { name: 'code-review', category: 'dev', description: 'Review code' },
        { name: 'deploy', category: 'ops', description: 'Deploy apps' },
      ]
      mockBrowse.mockResolvedValue(skills)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.browse()

      expect(result).toEqual(skills)
    })

    it('filters by category', async () => {
      const skills = [
        { name: 'code-review', category: 'dev', description: 'Review code' },
        { name: 'deploy', category: 'ops', description: 'Deploy apps' },
      ]
      mockBrowse.mockResolvedValue(skills)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.browse({ category: 'dev' })

      expect(result).toEqual([skills[0]])
    })

    it('filters by search query', async () => {
      const skills = [
        { name: 'code-review', category: 'dev', description: 'Review code' },
        { name: 'deploy', category: 'ops', description: 'Deploy apps' },
      ]
      mockBrowse.mockResolvedValue(skills)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.browse({ search: 'deploy' })

      expect(result).toEqual([skills[1]])
    })
  })

  describe('installed', () => {
    it('returns installed skills', async () => {
      const installed = [{ skillId: 'code-review', status: 'active' }]
      mockGetInstalled.mockResolvedValue(installed)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.installed()

      expect(result).toEqual(installed)
    })
  })

  describe('install', () => {
    it('installs a skill with permissions', async () => {
      const installResult = { skillId: 'code-review', status: 'installed' }
      mockInstall.mockResolvedValue(installResult)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.install({
        skillId: 'code-review',
        approvedPermissions: ['read', 'write'],
      })

      expect(mockInstall).toHaveBeenCalledWith('code-review', ['read', 'write'])
      expect(result).toEqual(installResult)
    })
  })

  describe('uninstall', () => {
    it('uninstalls a skill', async () => {
      mockUninstall.mockResolvedValue({ success: true })

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.uninstall({ skillId: 'code-review' })

      expect(mockUninstall).toHaveBeenCalledWith('code-review')
      expect(result).toEqual({ success: true })
    })
  })

  describe('auth', () => {
    it('rejects unauthenticated requests', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.installed()).rejects.toThrow()
    })
  })
})
