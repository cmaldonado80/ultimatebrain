import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MCPRegistry, type RegisteredTool, type ExternalMCPServer } from '../registry'

function makeTool(
  name: string,
  source: 'platform' | 'openclaw' | 'external' = 'platform',
): RegisteredTool {
  return {
    name,
    description: `Test tool: ${name}`,
    source,
    inputSchema: {
      type: 'object',
      properties: { input: { type: 'string', description: 'test input' } },
      required: ['input'],
    },
    handler: vi.fn().mockResolvedValue(`result-${name}`),
  }
}

describe('MCPRegistry', () => {
  let registry: MCPRegistry

  beforeEach(() => {
    registry = new MCPRegistry()
  })

  describe('tool management', () => {
    it('should register and retrieve a tool', () => {
      const tool = makeTool('test-tool')
      registry.register(tool)

      expect(registry.get('test-tool')).toBe(tool)
    })

    it('should list all registered tools', () => {
      registry.register(makeTool('a'))
      registry.register(makeTool('b'))
      registry.register(makeTool('c'))

      expect(registry.listAll()).toHaveLength(3)
    })

    it('should overwrite on re-register', () => {
      const tool1 = makeTool('same-name')
      const tool2 = makeTool('same-name')
      tool2.description = 'updated'

      registry.register(tool1)
      registry.register(tool2)

      expect(registry.listAll()).toHaveLength(1)
      expect(registry.get('same-name')?.description).toBe('updated')
    })

    it('should unregister a tool', () => {
      registry.register(makeTool('x'))
      expect(registry.unregister('x')).toBe(true)
      expect(registry.get('x')).toBeUndefined()
    })

    it('should return false when unregistering nonexistent tool', () => {
      expect(registry.unregister('nonexistent')).toBe(false)
    })

    it('should filter tools by source', () => {
      registry.register(makeTool('p1', 'platform'))
      registry.register(makeTool('p2', 'platform'))
      registry.register(makeTool('e1', 'external'))
      registry.register(makeTool('o1', 'openclaw'))

      expect(registry.listBySource('platform')).toHaveLength(2)
      expect(registry.listBySource('external')).toHaveLength(1)
      expect(registry.listBySource('openclaw')).toHaveLength(1)
    })
  })

  describe('search', () => {
    it('should search tools by name and description', () => {
      registry.register(makeTool('search-memory'))
      registry.register(makeTool('store-memory'))
      registry.register(makeTool('ephemeris-natal'))

      const results = registry.search('memory')
      expect(results).toHaveLength(2)
    })
  })

  describe('external servers', () => {
    const server: ExternalMCPServer = {
      name: 'test-server',
      url: 'http://localhost:3001',
      transport: 'http-sse',
      autoDiscover: true,
      enabled: true,
    }

    it('should add and list external servers', () => {
      registry.addExternalServer(server)
      const servers = registry.listExternalServers()

      expect(servers).toHaveLength(1)
      expect(servers[0].name).toBe('test-server')
    })

    it('should remove external server by name', () => {
      registry.addExternalServer(server)
      registry.removeExternalServer('test-server')

      expect(registry.listExternalServers()).toHaveLength(0)
    })
  })

  describe('stats', () => {
    it('should return correct stats', () => {
      registry.register(makeTool('p1', 'platform'))
      registry.register(makeTool('p2', 'platform'))
      registry.register(makeTool('e1', 'external'))
      registry.addExternalServer({
        name: 's1',
        url: 'http://localhost:3001',
        transport: 'http-sse',
        autoDiscover: true,
        enabled: true,
      })

      const stats = registry.getStats()
      expect(stats.totalTools).toBe(3)
      expect(stats.bySource.platform).toBe(2)
      expect(stats.bySource.external).toBe(1)
      expect(stats.externalServers).toBe(1)
    })
  })
})
