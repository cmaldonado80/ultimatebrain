import { describe, expect, it, vi } from 'vitest'

// Mock all ephemeris engines to avoid native dependency issues
vi.mock('../../engines/swiss-ephemeris/engine', () => ({
  julianDay: vi.fn().mockReturnValue(2460000),
  calcAllPlanets: vi.fn().mockReturnValue([]),
  calcHouses: vi.fn().mockReturnValue({ houses: [], ascendant: 0, mc: 0 }),
  calcAspects: vi.fn().mockReturnValue([]),
}))
vi.mock('../../engines/swiss-ephemeris/lunar', () => ({
  moonPhase: vi.fn().mockReturnValue({ phase: 'Full Moon', illumination: 1, angle: 180 }),
}))
vi.mock('../../engines/swiss-ephemeris/vedic', () => ({
  panchanga: vi.fn().mockReturnValue({}),
  vimshottariDasha: vi.fn().mockReturnValue([]),
  rashiStrength: vi.fn().mockReturnValue({}),
}))
vi.mock('../../engines/swiss-ephemeris/composite', () => ({
  synastryAspects: vi.fn().mockReturnValue([]),
}))
vi.mock('../../engines/swiss-ephemeris/predictive', () => ({
  solarReturn: vi.fn().mockReturnValue({}),
  transitCalendar: vi.fn().mockReturnValue([]),
  annualProfections: vi.fn().mockReturnValue({}),
}))

const { AGENT_TOOLS } = await import('../tool-executor')

describe('ChatToolExecutor', () => {
  describe('AGENT_TOOLS', () => {
    it('should be an array of tool definitions', () => {
      expect(Array.isArray(AGENT_TOOLS)).toBe(true)
      expect(AGENT_TOOLS.length).toBeGreaterThan(0)
    })

    it('should have valid Anthropic tool schema for each tool', () => {
      for (const tool of AGENT_TOOLS) {
        expect(tool).toHaveProperty('name')
        expect(tool).toHaveProperty('description')
        expect(tool).toHaveProperty('input_schema')
        expect(tool.input_schema.type).toBe('object')
        expect(typeof tool.name).toBe('string')
        expect(typeof tool.description).toBe('string')
      }
    })

    it('should include ephemeris tools', () => {
      const names = AGENT_TOOLS.map((t) => t.name)
      expect(names).toContain('ephemeris_natal_chart')
      expect(names).toContain('ephemeris_current_transits')
      expect(names).toContain('ephemeris_moon_phase')
    })

    it('should include memory tools', () => {
      const names = AGENT_TOOLS.map((t) => t.name)
      expect(names).toContain('memory_search')
      expect(names).toContain('memory_store')
    })

    it('should have unique tool names', () => {
      const names = AGENT_TOOLS.map((t) => t.name)
      const unique = new Set(names)
      expect(unique.size).toBe(names.length)
    })

    it('should have required fields in input schemas', () => {
      for (const tool of AGENT_TOOLS) {
        expect(tool.input_schema).toHaveProperty('properties')
        if (tool.input_schema.required) {
          expect(Array.isArray(tool.input_schema.required)).toBe(true)
        }
      }
    })
  })
})
