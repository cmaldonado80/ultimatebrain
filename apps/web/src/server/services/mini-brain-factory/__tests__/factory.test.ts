import { describe, it, expect } from 'vitest'
import { MiniBrainFactory } from '../factory'

describe('MiniBrainFactory', () => {
  const factory = new MiniBrainFactory()

  describe('getTemplate()', () => {
    it('should return astrology template', () => {
      const template = factory.getTemplate('astrology')
      expect(template).toBeTruthy()
      expect(template?.id).toBe('astrology')
      expect(template?.domain).toBeTruthy()
      expect(template?.agents.length).toBeGreaterThan(0)
      expect(template?.engines.length).toBeGreaterThan(0)
    })

    it('should return hospitality template', () => {
      const template = factory.getTemplate('hospitality')
      expect(template).toBeTruthy()
      expect(template?.agents.length).toBeGreaterThan(0)
    })

    it('should return null for unknown template', () => {
      expect(factory.getTemplate('nonexistent' as never)).toBeNull()
    })
  })

  describe('listTemplates()', () => {
    it('should return all 6 templates', () => {
      const templates = factory.getTemplates()
      expect(templates.length).toBe(6)
      const ids = templates.map((t) => t.id)
      expect(ids).toContain('astrology')
      expect(ids).toContain('hospitality')
      expect(ids).toContain('healthcare')
      expect(ids).toContain('legal')
      expect(ids).toContain('marketing')
      expect(ids).toContain('soc-ops')
    })
  })

  describe('findDevelopmentTemplate()', () => {
    it('should find exact match', () => {
      const devTemplate = factory.findDevelopmentTemplate('astrology', 'personal-astrology')
      expect(devTemplate).toBeTruthy()
      expect(devTemplate?.agents.length).toBeGreaterThan(0)
    })

    it('should find prefix match', () => {
      const devTemplate = factory.findDevelopmentTemplate('astrology', 'personal')
      expect(devTemplate).toBeTruthy()
    })

    it('should return null for no match', () => {
      const devTemplate = factory.findDevelopmentTemplate('astrology', 'zzz-nonexistent')
      expect(devTemplate).toBeNull()
    })
  })

  describe('getDevelopmentTemplates()', () => {
    it('should return development templates for astrology', () => {
      const devTemplates = factory.getDevelopmentTemplates('astrology')
      expect(devTemplates.length).toBeGreaterThan(0)
    })

    it('should return empty for unknown domain', () => {
      const devTemplates = factory.getDevelopmentTemplates('nonexistent' as never)
      expect(devTemplates).toEqual([])
    })
  })

  describe('template agent definitions', () => {
    it('should have name, role, and capabilities for each agent', () => {
      const template = factory.getTemplate('astrology')!
      for (const agent of template.agents) {
        expect(agent.name).toBeTruthy()
        expect(agent.role).toBeTruthy()
        expect(Array.isArray(agent.capabilities)).toBe(true)
      }
    })
  })
})
