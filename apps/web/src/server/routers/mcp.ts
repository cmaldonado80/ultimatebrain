/**
 * MCP Router — Model Context Protocol server and tool registry.
 *
 * Manages MCP server instances with lazy initialization, and the tool registry
 * for discovering and invoking MCP-compliant tools from agents.
 */
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import type { Database } from '@solarc/db'
import { MCPServer, MCPRegistry } from '../services/mcp'

/** Shared registry + server singleton (created lazily per-request in real app) */
function createMCPStack(db: Database) {
  const registry = new MCPRegistry()
  const server = new MCPServer(db, registry)
  return { registry, server }
}

export const mcpRouter = router({
  // ── Server Info ─────────────────────────────────────────────────────

  serverInfo: protectedProcedure.query(async ({ ctx }) => {
    const { server } = createMCPStack(ctx.db)
    return server.getServerInfo()
  }),

  // ── Tool Catalog ──────────────────────────────────────────────────────

  /** List all registered MCP tools */
  listTools: protectedProcedure.query(async ({ ctx }) => {
    const { registry, server } = createMCPStack(ctx.db)
    await server.registerPlatformTools()
    await registry.discoverAll()
    return server.getToolDefinitions()
  }),

  /** Search tools by query */
  searchTools: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { registry, server } = createMCPStack(ctx.db)
      await server.registerPlatformTools()
      await registry.discoverAll()
      return registry.search(input.query).map((t) => ({
        name: t.name,
        description: t.description,
        source: t.source,
        inputSchema: t.inputSchema,
      }))
    }),

  /** Get registry stats */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const { registry, server } = createMCPStack(ctx.db)
    await server.registerPlatformTools()
    await registry.discoverAll()
    return registry.getStats()
  }),

  // ── Tool Execution ────────────────────────────────────────────────────

  /** Call a tool by name */
  callTool: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      arguments: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { registry, server } = createMCPStack(ctx.db)
      await server.registerPlatformTools()
      await registry.discoverAll()
      return server.callTool(input.name, input.arguments ?? {})
    }),

  // ── JSON-RPC Passthrough ──────────────────────────────────────────────

  /** Handle raw JSON-RPC request (for HTTP transport) */
  jsonRpc: protectedProcedure
    .input(z.object({
      jsonrpc: z.literal('2.0'),
      id: z.union([z.string(), z.number()]),
      method: z.string(),
      params: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { registry, server } = createMCPStack(ctx.db)
      await server.registerPlatformTools()
      await registry.discoverAll()
      return server.handleRequest(input)
    }),

  // ── External Server Management ────────────────────────────────────────

  /** List configured external MCP servers */
  listExternalServers: protectedProcedure.query(async ({ ctx }) => {
    const { registry } = createMCPStack(ctx.db)
    return registry.listExternalServers()
  }),

  /** Add an external MCP server */
  addExternalServer: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      url: z.string().url(),
      transport: z.enum(['stdio', 'http-sse']),
      command: z.string().optional(),
      args: z.array(z.string()).optional(),
      autoDiscover: z.boolean().default(true),
      enabled: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const { registry } = createMCPStack(ctx.db)
      registry.addExternalServer(input)
      if (input.enabled && input.autoDiscover) {
        await registry.discoverExternalTools(input.name)
      }
      return { success: true, name: input.name }
    }),

  /** Remove an external MCP server */
  removeExternalServer: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { registry } = createMCPStack(ctx.db)
      registry.removeExternalServer(input.name)
      return { success: true }
    }),

  /** Re-discover tools from all external servers */
  refreshDiscovery: protectedProcedure.mutation(async ({ ctx }) => {
    const { registry, server } = createMCPStack(ctx.db)
    await server.registerPlatformTools()
    const stats = await registry.discoverAll()
    return stats
  }),
})
