/**
 * MCP Tool Registry
 *
 * Consolidates tools from three sources:
 * 1. Platform agents & flows (registered by MCPServer.registerPlatformTools)
 * 2. OpenClaw skills (scanned from skill definitions)
 * 3. External MCP servers (discovered via configuration)
 *
 * Exposes a unified tool catalog to all agents and the MCP server.
 */

export type ToolSource = 'platform' | 'openclaw' | 'external'

export interface RegisteredTool {
  name: string
  description: string
  source: ToolSource
  /** External MCP server URL (for external tools) */
  serverUrl?: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description?: string }>
    required?: string[]
  }
  /** Execute the tool */
  handler: (params: Record<string, unknown>) => Promise<unknown>
}

export interface ExternalMCPServer {
  name: string
  url: string
  transport: 'stdio' | 'http-sse'
  /** Command to start stdio server (if applicable) */
  command?: string
  args?: string[]
  /** Whether to auto-discover tools on startup */
  autoDiscover: boolean
  enabled: boolean
}

export interface RegistryStats {
  totalTools: number
  bySource: Record<ToolSource, number>
  externalServers: number
}

export class MCPRegistry {
  private tools = new Map<string, RegisteredTool>()
  private externalServers = new Map<string, ExternalMCPServer>()

  // ── Tool Management ───────────────────────────────────────────────────

  /** Register a single tool */
  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.name)) {
      // Overwrite — latest registration wins (allows refresh)
    }
    this.tools.set(tool.name, tool)
  }

  /** Unregister a tool by name */
  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  /** Get a tool by name */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name)
  }

  /** List all registered tools */
  listAll(): RegisteredTool[] {
    return Array.from(this.tools.values())
  }

  /** List tools filtered by source */
  listBySource(source: ToolSource): RegisteredTool[] {
    return this.listAll().filter((t) => t.source === source)
  }

  /** Search tools by name or description */
  search(query: string): RegisteredTool[] {
    const q = query.toLowerCase()
    return this.listAll().filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    )
  }

  /** Clear all tools (useful for refresh) */
  clear(): void {
    this.tools.clear()
  }

  /** Clear tools from a specific source */
  clearSource(source: ToolSource): void {
    for (const [name, tool] of this.tools) {
      if (tool.source === source) this.tools.delete(name)
    }
  }

  // ── External Server Management ────────────────────────────────────────

  /** Add an external MCP server configuration */
  addExternalServer(server: ExternalMCPServer): void {
    this.externalServers.set(server.name, server)
  }

  /** Remove an external server and its tools */
  removeExternalServer(name: string): void {
    this.externalServers.delete(name)
    // Remove all tools from this server
    for (const [toolName, tool] of this.tools) {
      if (tool.source === 'external' && tool.serverUrl === name) {
        this.tools.delete(toolName)
      }
    }
  }

  /** List configured external servers */
  listExternalServers(): ExternalMCPServer[] {
    return Array.from(this.externalServers.values())
  }

  // ── OpenClaw Skill & MCP Discovery ───────────────────────────────────

  /**
   * Discover OpenClaw skills and MCP tools, registering them as callable tools.
   * Uses live discovery from the OpenClaw daemon when connected, falls back to
   * cached results when disconnected.
   */
  async discoverOpenClawSkills(): Promise<number> {
    let count = 0

    try {
      const { getOpenClawClient } = await import('../../adapters/openclaw/bootstrap')
      const client = getOpenClawClient()
      if (!client || !client.isConnected()) return 0

      // Discover skills
      const { OpenClawSkills } = await import('../../adapters/openclaw/skills')
      const skillsAdapter = new OpenClawSkills(client)
      const skills = await skillsAdapter.discoverSkills()

      for (const skill of skills) {
        const toolName = `openclaw_${skill.name.replace(/[^a-zA-Z0-9_]/g, '_')}`
        this.register({
          name: toolName,
          description: skill.description,
          source: 'openclaw',
          inputSchema: {
            type: 'object',
            properties: Object.fromEntries(
              Object.entries(skill.params ?? {}).map(([k, v]) => [
                k,
                { type: v.type, description: v.description },
              ]),
            ),
            required: Object.entries(skill.params ?? {})
              .filter(([, v]) => v.required)
              .map(([k]) => k),
          },
          handler: async (params) => skillsAdapter.invokeSkill(skill.name, params),
        })
        count++
      }

      // Discover MCP tools
      const { OpenClawMcp } = await import('../../adapters/openclaw/mcp')
      const mcpAdapter = new OpenClawMcp(client)
      const tools = await mcpAdapter.discoverTools()

      for (const tool of tools) {
        const toolName = `openclaw_mcp_${tool.server}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, '_')
        this.register({
          name: toolName,
          description: `[MCP: ${tool.server}] ${tool.description}`,
          source: 'openclaw',
          inputSchema: {
            type: 'object',
            properties: (tool.inputSchema?.properties ?? {}) as Record<
              string,
              { type: string; description?: string }
            >,
            required: (tool.inputSchema?.required ?? []) as string[],
          },
          handler: async (params) => mcpAdapter.invokeTool(tool.server, tool.name, params),
        })
        count++
      }
    } catch (err) {
      console.warn('[MCPRegistry] OpenClaw discovery failed:', err)
    }

    return count
  }

  // ── External MCP Server Discovery ─────────────────────────────────────

  /**
   * Connect to an external MCP server and discover its tools.
   * Registers discovered tools with source='external'.
   */
  async discoverExternalTools(serverName: string): Promise<number> {
    const server = this.externalServers.get(serverName)
    if (!server) throw new Error(`External server not found: ${serverName}`)
    if (!server.enabled) return 0

    // Stub — real impl:
    // 1. Connect to the server via stdio or HTTP+SSE
    // 2. Send `initialize` JSON-RPC request
    // 3. Send `tools/list` to get available tools
    // 4. Register each tool with a handler that proxies to the external server

    // For now, register a placeholder showing the mechanism works
    this.register({
      name: `external_${sanitizeId(serverName)}_ping`,
      description: `Ping external MCP server "${serverName}"`,
      source: 'external',
      serverUrl: serverName,
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async () => ({
        status: 'ok',
        server: serverName,
        url: server.url,
      }),
    })

    return 1 // placeholder count
  }

  /**
   * Discover tools from all enabled external servers.
   */
  async discoverAllExternal(): Promise<number> {
    let total = 0
    for (const [name, server] of this.externalServers) {
      if (server.enabled && server.autoDiscover) {
        total += await this.discoverExternalTools(name)
      }
    }
    return total
  }

  // ── Full Discovery ────────────────────────────────────────────────────

  /**
   * Run full discovery: OpenClaw skills + all external MCP servers.
   * Platform tools are registered separately by MCPServer.registerPlatformTools().
   */
  async discoverAll(): Promise<RegistryStats> {
    this.clearSource('openclaw')
    this.clearSource('external')

    await this.discoverOpenClawSkills()
    await this.discoverAllExternal()

    return this.getStats()
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  getStats(): RegistryStats {
    const tools = this.listAll()
    return {
      totalTools: tools.length,
      bySource: {
        platform: tools.filter((t) => t.source === 'platform').length,
        openclaw: tools.filter((t) => t.source === 'openclaw').length,
        external: tools.filter((t) => t.source === 'external').length,
      },
      externalServers: this.externalServers.size,
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
}
