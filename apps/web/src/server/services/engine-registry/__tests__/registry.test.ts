import { beforeEach, describe, expect, it } from 'vitest'

import { EngineRegistry } from '../registry'

describe('EngineRegistry', () => {
  let registry: EngineRegistry

  beforeEach(() => {
    registry = new EngineRegistry()
  })

  describe('listEngines()', () => {
    it('should return all registered engines', () => {
      const engines = registry.listEngines()
      expect(engines.length).toBeGreaterThan(0)
      expect(engines[0]).toHaveProperty('id')
      expect(engines[0]).toHaveProperty('name')
      expect(engines[0]).toHaveProperty('status')
    })
  })

  describe('getEngine()', () => {
    it('should return engine by id', () => {
      const engine = registry.getEngine('llm')
      expect(engine).toBeTruthy()
      expect(engine?.id).toBe('llm')
    })

    it('should return null for unknown engine', () => {
      expect(registry.getEngine('nonexistent' as never)).toBeNull()
    })
  })

  describe('updateStatus()', () => {
    it('should update engine health status', () => {
      registry.updateStatus('llm', 'degraded')
      const engine = registry.getEngine('llm')
      expect(engine?.status).toBe('degraded')
    })
  })

  describe('connectApp()', () => {
    it('should register an app connection to an engine', () => {
      registry.connectApp('app-1', 'TestApp', 'llm')
      const engine = registry.getEngine('llm')
      expect(engine?.connectedApps).toContain('app-1')
    })
  })

  describe('disconnectApp()', () => {
    it('should remove an app connection', () => {
      registry.connectApp('app-1', 'TestApp', 'llm')
      registry.disconnectApp('app-1', 'llm')
      const engine = registry.getEngine('llm')
      expect(engine?.connectedApps).not.toContain('app-1')
    })
  })

  describe('recordRequest()', () => {
    it('should track request metrics', () => {
      registry.connectApp('app-1', 'TestApp', 'llm')
      registry.recordRequest('app-1', 'llm', 150, false)
      registry.recordRequest('app-1', 'llm', 200, false)

      const usage = registry.getAppUsage('app-1')
      const llmUsage = usage.find((u) => u.engineId === 'llm')
      expect(llmUsage?.requestCount).toBe(2)
      expect(llmUsage?.errorCount).toBe(0)
    })

    it('should track errors', () => {
      registry.connectApp('app-1', 'TestApp', 'llm')
      registry.recordRequest('app-1', 'llm', 500, true)

      const usage = registry.getAppUsage('app-1')
      const llmUsage = usage.find((u) => u.engineId === 'llm')
      expect(llmUsage?.errorCount).toBe(1)
    })
  })

  describe('setRateLimit()', () => {
    it('should set rate limit for app-engine pair', () => {
      registry.connectApp('app-1', 'TestApp', 'llm')
      registry.setRateLimit('app-1', 'llm', 100)

      const usage = registry.getAppUsage('app-1')
      const llmUsage = usage.find((u) => u.engineId === 'llm')
      expect(llmUsage?.rateLimit).toBe(100)
    })
  })

  describe('listByCategory()', () => {
    it('should filter engines by category', () => {
      const system = registry.listByCategory('system')
      expect(system.length).toBeGreaterThan(0)
      for (const e of system) {
        expect(e.category).toBe('system')
      }
    })
  })
})
