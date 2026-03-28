import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SkillMarketplace } from '../marketplace'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@solarc/db', () => ({
  skillsMarketplace: { id: 'id', installed: 'installed' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  const whereFn = vi.fn().mockResolvedValue(undefined)
  const setFn = vi.fn().mockReturnValue({ where: whereFn })
  const returningFn = vi.fn().mockResolvedValue([
    {
      id: 'skill-db-1',
      name: 'Web Search',
      sourceUrl: 'openclaw://skills/web-search',
      version: '1.2.0',
      installed: true,
      config: null,
      createdAt: new Date(),
    },
  ])
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })

  return {
    query: {
      skillsMarketplace: {
        findFirst: vi.fn().mockResolvedValue(undefined),
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    insert: vi.fn().mockReturnValue({ values: valuesFn }),
    update: vi.fn().mockReturnValue({ set: setFn }),
    _mock: { whereFn, setFn, valuesFn, returningFn },
  } as any
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SkillMarketplace', () => {
  let marketplace: SkillMarketplace
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
    marketplace = new SkillMarketplace(db)
  })

  // ── browse ────────────────────────────────────────────────────────────

  describe('browse', () => {
    it('should return all available skills from the catalog', async () => {
      const skills = await marketplace.browse()

      expect(skills.length).toBeGreaterThan(0)
      expect(skills[0]).toHaveProperty('id')
      expect(skills[0]).toHaveProperty('name')
      expect(skills[0]).toHaveProperty('installed')
    })

    it('should filter by category', async () => {
      const skills = await marketplace.browse({ category: 'coding' })

      expect(skills.length).toBeGreaterThan(0)
      skills.forEach((s) => expect(s.category).toBe('coding'))
    })

    it('should filter by source', async () => {
      const skills = await marketplace.browse({ source: 'openclaw' })

      expect(skills.length).toBeGreaterThan(0)
      skills.forEach((s) => expect(s.source).toBe('openclaw'))
    })

    it('should search by name or description', async () => {
      const skills = await marketplace.browse({ search: 'search' })

      expect(skills.length).toBeGreaterThan(0)
      skills.forEach((s) => {
        const matchesSearch =
          s.name.toLowerCase().includes('search') || s.description.toLowerCase().includes('search')
        expect(matchesSearch).toBe(true)
      })
    })

    it('should return empty array when search matches nothing', async () => {
      const skills = await marketplace.browse({ search: 'zzz_nonexistent_zzz' })

      expect(skills).toHaveLength(0)
    })

    it('should mark installed skills based on database state', async () => {
      db.query.skillsMarketplace.findMany.mockResolvedValue([
        { id: 'db-1', name: 'Web Search', installed: true, config: null, createdAt: new Date() },
      ])

      const skills = await marketplace.browse()
      const webSearch = skills.find((s) => s.name === 'Web Search')

      expect(webSearch).toBeDefined()
      expect(webSearch!.installed).toBe(true)
    })
  })

  // ── getSkill ──────────────────────────────────────────────────────────

  describe('getSkill', () => {
    it('should return a skill by ID', async () => {
      const skill = await marketplace.getSkill('oc-web-search')

      expect(skill).toBeDefined()
      expect(skill!.name).toBe('Web Search')
    })

    it('should return null for non-existent skill', async () => {
      const skill = await marketplace.getSkill('nonexistent')

      expect(skill).toBeNull()
    })
  })

  // ── install ───────────────────────────────────────────────────────────

  describe('install', () => {
    it('should install a skill with approved permissions', async () => {
      const result = await marketplace.install('oc-web-search', ['network:fetch'])

      expect(db.insert).toHaveBeenCalled()
      expect(result.installed).toBe(true)
      expect(result.name).toBe('Web Search')
    })

    it('should throw when skill is not found', async () => {
      await expect(marketplace.install('nonexistent', [])).rejects.toThrow(
        'Skill not found: nonexistent',
      )
    })

    it('should throw when required permissions are missing', async () => {
      await expect(
        marketplace.install('oc-web-search', []), // requires network:fetch
      ).rejects.toThrow('Missing required permissions: network:fetch')
    })

    it('should throw for partial permission approval', async () => {
      // oc-code-review requires file:read and llm:invoke
      await expect(
        marketplace.install('oc-code-review', ['file:read']), // missing llm:invoke
      ).rejects.toThrow('Missing required permissions')
    })
  })

  // ── uninstall ─────────────────────────────────────────────────────────

  describe('uninstall', () => {
    it('should mark skill as uninstalled', async () => {
      await marketplace.uninstall('skill-db-1')

      expect(db.update).toHaveBeenCalled()
      expect(db._mock.setFn).toHaveBeenCalledWith({ installed: false })
    })
  })

  // ── assignToAgent ─────────────────────────────────────────────────────

  describe('assignToAgent', () => {
    it('should assign skill to an agent', async () => {
      db.query.skillsMarketplace.findFirst.mockResolvedValue({
        id: 'skill-db-1',
        config: { assignedAgents: [], enabled: true },
      })

      await marketplace.assignToAgent('skill-db-1', 'agent-1')

      expect(db.update).toHaveBeenCalled()
    })

    it('should not duplicate agent assignment', async () => {
      db.query.skillsMarketplace.findFirst.mockResolvedValue({
        id: 'skill-db-1',
        config: { assignedAgents: ['agent-1'], enabled: true },
      })

      await marketplace.assignToAgent('skill-db-1', 'agent-1')

      const setCall = db._mock.setFn.mock.calls[0][0]
      expect(setCall.config.assignedAgents).toEqual(['agent-1'])
    })

    it('should throw when skill not found', async () => {
      db.query.skillsMarketplace.findFirst.mockResolvedValue(undefined)

      await expect(marketplace.assignToAgent('nonexistent', 'agent-1')).rejects.toThrow(
        'Skill not found',
      )
    })
  })

  // ── unassignFromAgent ─────────────────────────────────────────────────

  describe('unassignFromAgent', () => {
    it('should remove agent from assigned list', async () => {
      db.query.skillsMarketplace.findFirst.mockResolvedValue({
        id: 'skill-db-1',
        config: { assignedAgents: ['agent-1', 'agent-2'], enabled: true },
      })

      await marketplace.unassignFromAgent('skill-db-1', 'agent-1')

      const setCall = db._mock.setFn.mock.calls[0][0]
      expect(setCall.config.assignedAgents).toEqual(['agent-2'])
    })

    it('should throw when skill not found', async () => {
      db.query.skillsMarketplace.findFirst.mockResolvedValue(undefined)

      await expect(marketplace.unassignFromAgent('nonexistent', 'agent-1')).rejects.toThrow(
        'Skill not found',
      )
    })
  })

  // ── toggleEnabled ─────────────────────────────────────────────────────

  describe('toggleEnabled', () => {
    it('should toggle enabled from true to false', async () => {
      db.query.skillsMarketplace.findFirst.mockResolvedValue({
        id: 'skill-db-1',
        config: { enabled: true, assignedAgents: [] },
      })

      const result = await marketplace.toggleEnabled('skill-db-1')

      expect(result).toBe(false)
    })

    it('should toggle enabled from false to true', async () => {
      db.query.skillsMarketplace.findFirst.mockResolvedValue({
        id: 'skill-db-1',
        config: { enabled: false, assignedAgents: [] },
      })

      const result = await marketplace.toggleEnabled('skill-db-1')

      expect(result).toBe(true)
    })

    it('should throw when skill not found', async () => {
      db.query.skillsMarketplace.findFirst.mockResolvedValue(undefined)

      await expect(marketplace.toggleEnabled('nonexistent')).rejects.toThrow('Skill not found')
    })
  })
})
