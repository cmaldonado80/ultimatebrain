/**
 * Bidirectional MCP Server
 *
 * Exposes platform agents and workflows as MCP tools consumable by
 * Claude Desktop, Cursor, and other MCP-compatible clients.
 *
 * - Each agent → `solarc_agent_{agentId}(task, context)`
 * - Each flow → `solarc_flow_{flowName}(params)`
 * - Transport: JSON-RPC 2.0 over stdio or HTTP+SSE
 */
import type { Database } from '@solarc/db'
import { agents, flows } from '@solarc/db'
import { eq } from 'drizzle-orm'

import { logger } from '../../../lib/logger'
import { GatewayRouter } from '../gateway'
import type { MCPRegistry } from './registry'

// ── JSON-RPC 2.0 Types ──────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

// ── MCP Protocol Types ──────────────────────────────────────────────────

export interface MCPToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description?: string }>
    required?: string[]
  }
}

export interface MCPToolCallResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export interface MCPServerInfo {
  name: string
  version: string
  capabilities: {
    tools: boolean
    resources: boolean
    prompts: boolean
  }
}

// ── Transport ───────────────────────────────────────────────────────────

export type MCPTransport = 'stdio' | 'http-sse'

export interface SSEConnection {
  id: string
  send: (event: string, data: string) => void
  close: () => void
}

// ── Server ──────────────────────────────────────────────────────────────

export class MCPServer {
  private sseConnections = new Map<string, SSEConnection>()

  constructor(
    private db: Database,
    private registry: MCPRegistry,
  ) {}

  /** Server metadata returned on initialize */
  getServerInfo(): MCPServerInfo {
    return {
      name: 'solarc-brain',
      version: '1.0.0',
      capabilities: {
        tools: true,
        resources: false,
        prompts: false,
      },
    }
  }

  // ── Tool Registration ─────────────────────────────────────────────────

  /**
   * Scan DB for agents and flows, register each as an MCP tool.
   */
  async registerPlatformTools(): Promise<void> {
    const [dbAgents, dbFlows] = await Promise.all([
      this.db.query.agents.findMany({ limit: 200 }),
      this.db.query.flows.findMany({ limit: 200 }),
    ])

    // Register agents as tools
    for (const agent of dbAgents) {
      const toolName = `solarc_agent_${sanitizeId(agent.id)}`
      this.registry.register({
        name: toolName,
        description: `Invoke agent "${agent.name}": ${agent.description ?? 'No description'}`,
        source: 'platform',
        inputSchema: {
          type: 'object',
          properties: {
            task: { type: 'string', description: 'The task to delegate to this agent' },
            context: { type: 'string', description: 'Additional context or constraints' },
          },
          required: ['task'],
        },
        handler: async (params) => this.executeAgent(agent.id, params),
      })
    }

    // Register flows as tools
    for (const flow of dbFlows) {
      const toolName = `solarc_flow_${sanitizeId(flow.name)}`
      const flowSteps = (flow.steps as Array<{ type: string }>) ?? []
      this.registry.register({
        name: toolName,
        description: `Run flow "${flow.name}": ${flowSteps.length} steps`,
        source: 'platform',
        inputSchema: {
          type: 'object',
          properties: {
            params: { type: 'string', description: 'JSON parameters for the flow' },
          },
          required: [],
        },
        handler: async (params) => this.executeFlow(flow.id, params),
      })
    }
  }

  // ── JSON-RPC 2.0 Handler ──────────────────────────────────────────────

  /**
   * Handle an incoming JSON-RPC request (works for both stdio and HTTP).
   */
  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      switch (request.method) {
        case 'initialize':
          return this.jsonRpcOk(request.id, {
            protocolVersion: '2024-11-05',
            serverInfo: this.getServerInfo(),
            capabilities: this.getServerInfo().capabilities,
          })

        case 'tools/list':
          return this.jsonRpcOk(request.id, {
            tools: this.getToolDefinitions(),
          })

        case 'tools/call': {
          const toolName = request.params?.name as string
          const args = (request.params?.arguments ?? {}) as Record<string, unknown>
          const result = await this.callTool(toolName, args)
          return this.jsonRpcOk(request.id, result)
        }

        case 'ping':
          return this.jsonRpcOk(request.id, {})

        default:
          return this.jsonRpcError(request.id, -32601, `Method not found: ${request.method}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return this.jsonRpcError(request.id, -32603, message)
    }
  }

  /**
   * Handle a batch of JSON-RPC requests.
   */
  async handleBatch(requests: JsonRpcRequest[]): Promise<JsonRpcResponse[]> {
    return Promise.all(requests.map((r) => this.handleRequest(r)))
  }

  // ── Tool Execution ────────────────────────────────────────────────────

  /** List all tools in MCP protocol format */
  getToolDefinitions(): MCPToolDefinition[] {
    return this.registry.listAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }))
  }

  /** Call a registered tool by name */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const tool = this.registry.get(name)
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Tool not found: ${name}` }],
        isError: true,
      }
    }

    try {
      const result = await tool.handler(args)
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      }
    } catch (err) {
      return {
        content: [
          { type: 'text', text: `Tool error: ${err instanceof Error ? err.message : String(err)}` },
        ],
        isError: true,
      }
    }
  }

  // ── SSE Transport ─────────────────────────────────────────────────────

  /** Register an SSE connection for streaming */
  addSSEConnection(conn: SSEConnection): void {
    this.sseConnections.set(conn.id, conn)
  }

  /** Remove an SSE connection */
  removeSSEConnection(id: string): void {
    this.sseConnections.delete(id)
  }

  /** Broadcast a notification to all SSE clients */
  broadcastNotification(method: string, params: Record<string, unknown> = {}): void {
    const notification: JsonRpcNotification = { jsonrpc: '2.0', method, params }
    const data = JSON.stringify(notification)
    for (const conn of this.sseConnections.values()) {
      try {
        conn.send('message', data)
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          `[MCP] SSE send failed for connection ${conn.id}, removing:`,
        )
        this.sseConnections.delete(conn.id)
      }
    }
  }

  // ── Stdio Transport ───────────────────────────────────────────────────

  /**
   * Start listening on stdin/stdout for JSON-RPC messages.
   * Used when the MCP server is launched as a child process.
   */
  startStdioTransport(): void {
    let buffer = ''

    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', async (chunk: string) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        try {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) {
            const responses = await this.handleBatch(parsed)
            process.stdout.write(JSON.stringify(responses) + '\n')
          } else {
            const response = await this.handleRequest(parsed)
            process.stdout.write(JSON.stringify(response) + '\n')
          }
        } catch (err) {
          logger.warn(
            { err: err instanceof Error ? err : undefined },
            '[MCP] Stdio JSON parse error:',
          )
          const errorResp = this.jsonRpcError(-1, -32700, 'Parse error')
          process.stdout.write(JSON.stringify(errorResp) + '\n')
        }
      }
    })
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private async executeAgent(agentId: string, params: Record<string, unknown>): Promise<unknown> {
    // Load agent from DB
    const agent = await this.db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    })
    if (!agent) return { status: 'error', error: `Agent ${agentId} not found` }

    const task = String(params['task'] ?? '')
    const context = String(params['context'] ?? '')

    // Build system prompt from agent soul
    const soul = agent.soul ?? `You are ${agent.name}. ${agent.description ?? ''}`
    const messages = [
      { role: 'system', content: soul },
      { role: 'user', content: context ? `Context: ${context}\n\nTask: ${task}` : task },
    ]

    // Resolve model and call gateway
    const gateway = new GatewayRouter(this.db)
    let model = agent.model ?? undefined
    if (!model && agent.requiredModelType) {
      const resolved = await gateway.resolveModelForCapability(agent.requiredModelType)
      if (resolved) model = resolved.model
    }

    const result = await gateway.chat({ model, messages })
    return {
      status: 'completed',
      agentId,
      agentName: agent.name,
      task,
      result: result.content,
    }
  }

  private async executeFlow(flowId: string, params: Record<string, unknown>): Promise<unknown> {
    // Load flow definition from DB
    const flow = await this.db.query.flows.findFirst({
      where: eq(flows.id, flowId),
    })

    if (!flow) {
      return { status: 'error', error: `Flow ${flowId} not found` }
    }

    // Return flow metadata — full FlowEngine execution to be wired separately
    return {
      status: 'acknowledged',
      flowId,
      flowName: (flow as { name?: string }).name ?? flowId,
      params,
      message: 'Flow execution queued. Full FlowEngine integration pending.',
    }
  }

  private jsonRpcOk(id: string | number, result: unknown): JsonRpcResponse {
    return { jsonrpc: '2.0', id, result }
  }

  private jsonRpcError(id: string | number, code: number, message: string): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: { code, message } }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
}
