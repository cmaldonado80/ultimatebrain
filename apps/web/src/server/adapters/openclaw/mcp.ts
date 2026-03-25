/**
 * OpenClaw MCP Adapter — Proxy MCP tool discovery and invocation.
 *
 * Routes MCP tool calls through OpenClaw's native MCP client, giving the Brain
 * access to 1,000+ community MCP servers without managing connections directly.
 */
import type { OpenClawClient } from './client'

// ── Types ────────────────────────────────────────────────────────────

export interface McpServer {
  name: string
  transport: 'stdio' | 'http' | 'sse'
  status: 'connected' | 'disconnected' | 'error'
  tools: McpTool[]
}

export interface McpTool {
  name: string
  description: string
  server: string
  inputSchema?: Record<string, unknown>
}

export interface McpToolResult {
  status: 'completed' | 'failed'
  output?: unknown
  error?: string
}

// ── Adapter ──────────────────────────────────────────────────────────

export class OpenClawMcp {
  private cachedServers: McpServer[] = []
  private cachedTools: McpTool[] = []
  private lastRefresh: Date | null = null
  private readonly CACHE_TTL_MS = 5 * 60 * 1000

  constructor(private client: OpenClawClient) {}

  /**
   * Discover all MCP servers and their tools from the OpenClaw daemon.
   */
  async discoverTools(forceRefresh = false): Promise<McpTool[]> {
    if (
      !forceRefresh &&
      this.cachedTools.length > 0 &&
      this.lastRefresh &&
      Date.now() - this.lastRefresh.getTime() < this.CACHE_TTL_MS
    ) {
      return this.cachedTools
    }

    if (!this.client.isConnected()) {
      return this.cachedTools
    }

    return new Promise((resolve) => {
      const requestId = crypto.randomUUID()
      const timeout = setTimeout(() => {
        this.client.removeAllListeners(`response:${requestId}`)
        console.warn('[OpenClaw MCP] Discovery timed out, returning cached')
        resolve(this.cachedTools)
      }, 15_000)

      this.client.once(`response:${requestId}`, (data: { servers: McpServer[] }) => {
        clearTimeout(timeout)
        this.cachedServers = data.servers
        this.cachedTools = data.servers.flatMap((s) =>
          s.tools.map((t) => ({ ...t, server: s.name })),
        )
        this.lastRefresh = new Date()
        resolve(this.cachedTools)
      })

      this.client.once(`error:${requestId}`, () => {
        clearTimeout(timeout)
        resolve(this.cachedTools)
      })

      try {
        this.client.send({ type: 'mcp.tools.list', requestId })
      } catch {
        clearTimeout(timeout)
        resolve(this.cachedTools)
      }
    })
  }

  /**
   * Invoke an MCP tool on a specific server through OpenClaw.
   */
  async invokeTool(
    server: string,
    tool: string,
    params: Record<string, unknown>,
  ): Promise<McpToolResult> {
    if (!this.client.isConnected()) {
      throw new Error('OpenClaw daemon not connected')
    }

    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID()
      const timeout = setTimeout(() => {
        this.client.removeAllListeners(`response:${requestId}`)
        reject(new Error(`MCP tool invocation timed out after 60s: ${server}/${tool}`))
      }, 60_000)

      this.client.once(`response:${requestId}`, (data: McpToolResult) => {
        clearTimeout(timeout)
        resolve(data)
      })

      this.client.once(`error:${requestId}`, (err: { message: string }) => {
        clearTimeout(timeout)
        reject(new Error(`MCP tool failed: ${err.message}`))
      })

      this.client.send({
        type: 'mcp.tools.invoke',
        requestId,
        server,
        tool,
        params,
      })
    })
  }

  /** Get discovered MCP servers. */
  getServers(): McpServer[] {
    return this.cachedServers
  }

  /** Get all discovered tools (flat list). */
  getCachedTools(): McpTool[] {
    return this.cachedTools
  }
}
