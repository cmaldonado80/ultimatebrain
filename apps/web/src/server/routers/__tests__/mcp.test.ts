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

const mockGetServerInfo = vi.fn()
const mockGetToolDefinitions = vi.fn()
const mockRegisterPlatformTools = vi.fn()
const mockCallTool = vi.fn()
const mockSearch = vi.fn()
const mockGetStats = vi.fn()
const mockDiscoverAll = vi.fn()
const mockListExternalServers = vi.fn()
const mockAddExternalServer = vi.fn()
const mockRemoveExternalServer = vi.fn()
const mockDiscoverExternalTools = vi.fn()

vi.mock('../../services/mcp', () => ({
  MCPRegistry: vi.fn().mockImplementation(() => ({
    search: mockSearch,
    getStats: mockGetStats,
    discoverAll: mockDiscoverAll,
    listExternalServers: mockListExternalServers,
    addExternalServer: mockAddExternalServer,
    removeExternalServer: mockRemoveExternalServer,
    discoverExternalTools: mockDiscoverExternalTools,
  })),
  MCPServer: vi.fn().mockImplementation(() => ({
    getServerInfo: mockGetServerInfo,
    getToolDefinitions: mockGetToolDefinitions,
    registerPlatformTools: mockRegisterPlatformTools,
    callTool: mockCallTool,
    handleRequest: vi.fn(),
  })),
}))

const { mcpRouter } = await import('../mcp')

import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) =>
  t.createCallerFactory(mcpRouter as Parameters<typeof t.createCallerFactory>[0])(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mcp router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('serverInfo', () => {
    it('returns server info', async () => {
      const info = { name: 'mcp-server', version: '1.0.0' }
      mockGetServerInfo.mockResolvedValue(info)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.serverInfo()

      expect(result).toEqual(info)
    })
  })

  describe('listTools', () => {
    it('returns all registered tools', async () => {
      const tools = [{ name: 'search', description: 'Search the web' }]
      mockRegisterPlatformTools.mockResolvedValue(undefined)
      mockDiscoverAll.mockResolvedValue(undefined)
      mockGetToolDefinitions.mockResolvedValue(tools)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.listTools()

      expect(result).toEqual(tools)
    })
  })

  describe('searchTools', () => {
    it('searches tools by query', async () => {
      const tools = [
        { name: 'web-search', description: 'Search', source: 'builtin', inputSchema: {} },
      ]
      mockRegisterPlatformTools.mockResolvedValue(undefined)
      mockDiscoverAll.mockResolvedValue(undefined)
      mockSearch.mockReturnValue(tools)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.searchTools({ query: 'search' })

      expect(mockSearch).toHaveBeenCalledWith('search')
      expect(result).toEqual(tools)
    })

    it('rejects empty query', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.searchTools({ query: '' })).rejects.toThrow()
    })
  })

  describe('callTool', () => {
    it('calls a tool by name', async () => {
      const toolResult = { content: 'result' }
      mockRegisterPlatformTools.mockResolvedValue(undefined)
      mockDiscoverAll.mockResolvedValue(undefined)
      mockCallTool.mockResolvedValue(toolResult)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.callTool({ name: 'search', arguments: { q: 'test' } })

      expect(mockCallTool).toHaveBeenCalledWith('search', { q: 'test' })
      expect(result).toEqual(toolResult)
    })

    it('rejects empty tool name', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.callTool({ name: '' })).rejects.toThrow()
    })
  })

  describe('addExternalServer', () => {
    it('adds an external MCP server', async () => {
      mockAddExternalServer.mockReturnValue(undefined)
      mockDiscoverExternalTools.mockResolvedValue(undefined)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.addExternalServer({
        name: 'my-server',
        url: 'https://mcp.example.com',
        transport: 'http-sse',
      })

      expect(result).toEqual({ success: true, name: 'my-server' })
    })

    it('rejects invalid url', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.addExternalServer({ name: 'bad', url: 'not-a-url', transport: 'stdio' }),
      ).rejects.toThrow()
    })
  })

  describe('auth', () => {
    it('rejects unauthenticated requests', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.serverInfo()).rejects.toThrow()
    })
  })
})
