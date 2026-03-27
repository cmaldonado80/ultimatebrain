import { describe, it, expect } from 'vitest'
import {
  BRAIN_AGENTS,
  BRAIN_SKILLS,
  BRAIN_COMMANDS,
  BRAIN_HOOKS,
  BRAIN_MCPS,
  getAllPreInstalledComponents,
} from '../catalog'

describe('AITMPL Catalog', () => {
  describe('BRAIN_AGENTS', () => {
    it('should have 12 agents', () => {
      expect(BRAIN_AGENTS.length).toBe(12)
    })

    it('should have required fields on every agent', () => {
      for (const agent of BRAIN_AGENTS) {
        expect(agent.type).toBe('agent')
        expect(agent.name).toBeTruthy()
        expect(agent.description).toBeTruthy()
        expect(agent.soul).toBeTruthy()
        expect(typeof agent.trustScore).toBe('number')
        expect(Array.isArray(agent.capabilities)).toBe(true)
        expect(Array.isArray(agent.guardrails)).toBe(true)
      }
    })

    it('should have trust scores between 0 and 1', () => {
      for (const agent of BRAIN_AGENTS) {
        expect(agent.trustScore).toBeGreaterThanOrEqual(0)
        expect(agent.trustScore).toBeLessThanOrEqual(1)
      }
    })

    it('should have unique agent names', () => {
      const names = BRAIN_AGENTS.map((a) => a.name)
      expect(new Set(names).size).toBe(names.length)
    })

    it('should include both aitmpl and custom sourced agents', () => {
      const sources = new Set(BRAIN_AGENTS.map((a) => a.source))
      expect(sources.has('aitmpl')).toBe(true)
      expect(sources.has('custom')).toBe(true)
    })
  })

  describe('BRAIN_SKILLS', () => {
    it('should have 12 skills', () => {
      expect(BRAIN_SKILLS.length).toBe(12)
    })

    it('should have required fields on every skill', () => {
      for (const skill of BRAIN_SKILLS) {
        expect(skill.type).toBe('skill')
        expect(skill.name).toBeTruthy()
        expect(skill.description).toBeTruthy()
        expect(Array.isArray(skill.permissions)).toBe(true)
        expect(typeof skill.enabled).toBe('boolean')
      }
    })

    it('should have unique skill names', () => {
      const names = BRAIN_SKILLS.map((s) => s.name)
      expect(new Set(names).size).toBe(names.length)
    })
  })

  describe('BRAIN_COMMANDS', () => {
    it('should have 18 commands', () => {
      expect(BRAIN_COMMANDS.length).toBe(18)
    })

    it('should have trigger and handler on every command', () => {
      for (const cmd of BRAIN_COMMANDS) {
        expect(cmd.type).toBe('command')
        expect(cmd.trigger).toBeTruthy()
        expect(cmd.trigger.startsWith('/')).toBe(true)
        expect(cmd.handler).toBeTruthy()
        expect(Array.isArray(cmd.contexts)).toBe(true)
        expect(cmd.contexts.length).toBeGreaterThan(0)
      }
    })

    it('should have unique command names', () => {
      const names = BRAIN_COMMANDS.map((c) => c.name)
      expect(new Set(names).size).toBe(names.length)
    })
  })

  describe('BRAIN_HOOKS', () => {
    it('should have 8 hooks', () => {
      expect(BRAIN_HOOKS.length).toBe(8)
    })

    it('should have event and handler on every hook', () => {
      for (const hook of BRAIN_HOOKS) {
        expect(hook.type).toBe('hook')
        expect(hook.event).toBeTruthy()
        expect(hook.handler).toBeTruthy()
        expect(typeof hook.enabled).toBe('boolean')
      }
    })
  })

  describe('BRAIN_MCPS', () => {
    it('should have 14 MCP servers', () => {
      expect(BRAIN_MCPS.length).toBe(14)
    })

    it('should have endpoint and transport on every MCP', () => {
      for (const mcp of BRAIN_MCPS) {
        expect(mcp.type).toBe('mcp')
        expect(mcp.name).toBeTruthy()
        expect(mcp.endpoint).toBeTruthy()
        expect(mcp.transport).toBeTruthy()
        expect(typeof mcp.rateLimit).toBe('number')
      }
    })

    it('should have unique MCP names', () => {
      const names = BRAIN_MCPS.map((m) => m.name)
      expect(new Set(names).size).toBe(names.length)
    })

    it('should have valid install modes', () => {
      for (const mcp of BRAIN_MCPS) {
        expect(['pre-installed', 'one-click']).toContain(mcp.installMode)
      }
    })
  })

  describe('getAllPreInstalledComponents()', () => {
    it('should return all categories with correct totals', () => {
      const catalog = getAllPreInstalledComponents()
      expect(catalog.agents).toBe(BRAIN_AGENTS)
      expect(catalog.skills).toBe(BRAIN_SKILLS)
      expect(catalog.commands).toBe(BRAIN_COMMANDS)
      expect(catalog.hooks).toBe(BRAIN_HOOKS)
      expect(catalog.mcps).toBe(BRAIN_MCPS)
      expect(catalog.totals.total).toBe(
        BRAIN_AGENTS.length +
          BRAIN_SKILLS.length +
          BRAIN_COMMANDS.length +
          BRAIN_HOOKS.length +
          BRAIN_MCPS.length,
      )
    })

    it('should have individual category counts matching arrays', () => {
      const catalog = getAllPreInstalledComponents()
      expect(catalog.totals.agents).toBe(12)
      expect(catalog.totals.skills).toBe(12)
      expect(catalog.totals.commands).toBe(18)
      expect(catalog.totals.hooks).toBe(8)
      expect(catalog.totals.mcps).toBe(14)
    })
  })
})
