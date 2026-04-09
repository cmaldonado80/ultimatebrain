/**
 * Gateway Router — LLM gateway with routing, cost tracking, and metrics.
 *
 * Central nervous system for all LLM calls. Provides chat and embedding endpoints,
 * request cost tracking, per-model metrics, and health checks.
 */
import type { Database } from '@solarc/db'
import { agents, gatewayMetrics, ollamaModels } from '@solarc/db'
import { LlmChatInput, LlmEmbedInput } from '@solarc/engine-contracts'
import { TRPCError } from '@trpc/server'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { CostTracker, GatewayError, GatewayRouter } from '../services/gateway'
import { protectedProcedure, publicProcedure, router } from '../trpc'

/**
 * Singleton gateway instance — initialized lazily with db from context.
 * In production this would be managed by a DI container.
 */
let gatewayInstance: GatewayRouter | null = null

function getGateway(db: Database): GatewayRouter {
  if (!gatewayInstance) {
    gatewayInstance = new GatewayRouter(db)
  }
  return gatewayInstance
}

export const gatewayRouter = router({
  /** Send a chat request through the AI gateway */
  chat: protectedProcedure.input(LlmChatInput).mutation(async ({ ctx, input }) => {
    const gw = getGateway(ctx.db)
    try {
      return await gw.chat(input)
    } catch (err) {
      if (err instanceof GatewayError) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `[${err.code}] ${err.message}` })
      }
      throw err
    }
  }),

  /** Generate an embedding */
  embed: protectedProcedure.input(LlmEmbedInput).mutation(async ({ ctx, input }) => {
    const gw = getGateway(ctx.db)
    return gw.embed(input.text, input.model)
  }),

  /** Get recent gateway metrics (paginated) */
  metrics: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.gatewayMetrics.findMany({
        limit: input?.limit ?? 100,
        orderBy: (m, { desc }) => [desc(m.createdAt)],
      })
    }),

  /** Record a metric manually (for external providers or testing) */
  record: protectedProcedure
    .input(
      z.object({
        provider: z.string(),
        model: z.string(),
        agentId: z.string().uuid().optional(),
        ticketId: z.string().uuid().optional(),
        tokensIn: z.number().optional(),
        tokensOut: z.number().optional(),
        latencyMs: z.number().optional(),
        costUsd: z.number().optional(),
        cached: z.boolean().optional(),
        error: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [metric] = await ctx.db.insert(gatewayMetrics).values(input).returning()
      if (!metric)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to record metric' })
      return metric
    }),

  /** Get provider health (circuit breaker states) */
  health: publicProcedure.query(async ({ ctx }) => {
    const gw = getGateway(ctx.db)
    return gw.getHealth()
  }),

  /** Get cost summary for an agent */
  agentCost: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      return gw.costTracker.getUsage(input.agentId, 'agent')
    }),

  /** Check budget status for an agent */
  budgetStatus: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      return gw.costTracker.checkBudget(input.agentId)
    }),

  /** Set budget for an agent */
  setBudget: protectedProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        softLimitUsd: z.number().positive(),
        hardLimitUsd: z.number().positive(),
        period: z.enum(['daily', 'weekly', 'monthly']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      gw.costTracker.setBudget(input.agentId, {
        softLimitUsd: input.softLimitUsd,
        hardLimitUsd: input.hardLimitUsd,
        period: input.period,
      })
      return { success: true }
    }),

  /** Set rate limit for an agent */
  setRateLimit: protectedProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        maxTokens: z.number().positive(),
        refillRatePerSecond: z.number().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      gw.rateLimiter.setAgentLimit(input.agentId, {
        maxTokens: input.maxTokens,
        refillRatePerSecond: input.refillRatePerSecond,
      })
      return { success: true }
    }),

  /** Get rate limit capacity for an agent */
  rateLimitStatus: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      return gw.rateLimiter.getAgentCapacity(input.agentId)
    }),

  /** Set rate limit for a workspace */
  setWorkspaceLimit: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        maxTokens: z.number().positive(),
        refillRatePerSecond: z.number().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      gw.rateLimiter.setWorkspaceLimit(input.workspaceId, {
        maxTokens: input.maxTokens,
        refillRatePerSecond: input.refillRatePerSecond,
      })
      return { success: true }
    }),

  /** Get rate limit capacity for a workspace */
  workspaceLimitStatus: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      return gw.rateLimiter.getWorkspaceCapacity(input.workspaceId)
    }),

  /** Store an API key (encrypted) */
  storeKey: protectedProcedure
    .input(
      z.object({
        provider: z.string(),
        apiKey: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      await gw.keyVault.storeKey(input.provider, input.apiKey)
      return { success: true }
    }),

  /** Rotate an API key */
  rotateKey: protectedProcedure
    .input(
      z.object({
        provider: z.string(),
        newApiKey: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      await gw.keyVault.rotateKey(input.provider, input.newApiKey)
      return { success: true }
    }),

  /** List providers with stored keys */
  listProviders: protectedProcedure.query(async ({ ctx }) => {
    const gw = getGateway(ctx.db)
    return gw.keyVault.listProviders()
  }),

  /** Delete an API key */
  deleteKey: protectedProcedure
    .input(z.object({ provider: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      await gw.keyVault.deleteKey(input.provider)
      return { success: true }
    }),

  /** Reset circuit breaker for a provider */
  resetCircuit: protectedProcedure
    .input(z.object({ provider: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      gw.circuitBreaker.reset(input.provider)
      return { success: true }
    }),

  /** Get pricing table */
  pricing: publicProcedure.query(() => {
    return CostTracker.getPricing()
  }),

  /** Aggregated cost summary for the ops dashboard */
  costSummary: protectedProcedure.query(async ({ ctx }) => {
    try {
      const allMetrics = await ctx.db.query.gatewayMetrics.findMany({
        limit: 10000,
        orderBy: (m, { desc: d }) => [d(m.createdAt)],
      })

      const totalCostUsd = allMetrics.reduce((s, m) => s + (m.costUsd ?? 0), 0)
      const totalTokensIn = allMetrics.reduce((s, m) => s + (m.tokensIn ?? 0), 0)
      const totalTokensOut = allMetrics.reduce((s, m) => s + (m.tokensOut ?? 0), 0)
      const avgLatencyMs =
        allMetrics.length > 0
          ? Math.round(allMetrics.reduce((s, m) => s + (m.latencyMs ?? 0), 0) / allMetrics.length)
          : 0
      const cachedCount = allMetrics.filter((m) => m.cached).length
      const cacheHitRate = allMetrics.length > 0 ? cachedCount / allMetrics.length : 0

      // Group by provider
      const byProviderMap = new Map<string, { cost: number; tokens: number; count: number }>()
      for (const m of allMetrics) {
        const entry = byProviderMap.get(m.provider) ?? { cost: 0, tokens: 0, count: 0 }
        entry.cost += m.costUsd ?? 0
        entry.tokens += (m.tokensIn ?? 0) + (m.tokensOut ?? 0)
        entry.count++
        byProviderMap.set(m.provider, entry)
      }
      const byProvider = [...byProviderMap.entries()].map(([provider, v]) => ({ provider, ...v }))

      // Group by model
      const byModelMap = new Map<string, { cost: number; tokens: number; count: number }>()
      for (const m of allMetrics) {
        const entry = byModelMap.get(m.model) ?? { cost: 0, tokens: 0, count: 0 }
        entry.cost += m.costUsd ?? 0
        entry.tokens += (m.tokensIn ?? 0) + (m.tokensOut ?? 0)
        entry.count++
        byModelMap.set(m.model, entry)
      }
      const byModel = [...byModelMap.entries()].map(([model, v]) => ({ model, ...v }))

      // Top agents by cost
      const byAgentMap = new Map<string, { cost: number; tokens: number; count: number }>()
      for (const m of allMetrics) {
        if (!m.agentId) continue
        const entry = byAgentMap.get(m.agentId) ?? { cost: 0, tokens: 0, count: 0 }
        entry.cost += m.costUsd ?? 0
        entry.tokens += (m.tokensIn ?? 0) + (m.tokensOut ?? 0)
        entry.count++
        byAgentMap.set(m.agentId, entry)
      }
      const topAgentsRaw = [...byAgentMap.entries()]
        .map(([agentId, v]) => ({ agentId, ...v }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 10)

      // Resolve agent names
      const agentIds = topAgentsRaw.map((a) => a.agentId)
      const agentRows =
        agentIds.length > 0
          ? await ctx.db
              .select({ id: agents.id, name: agents.name })
              .from(agents)
              .where(
                sql`${agents.id} IN (${sql.join(
                  agentIds.map((id) => sql`${id}`),
                  sql`, `,
                )})`,
              )
          : []
      const agentNameMap = new Map(agentRows.map((a) => [a.id, a.name]))
      const topAgents = topAgentsRaw.map((a) => ({
        ...a,
        agentName: agentNameMap.get(a.agentId) ?? a.agentId.slice(0, 8),
      }))

      return {
        totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
        totalTokensIn,
        totalTokensOut,
        totalCalls: allMetrics.length,
        avgLatencyMs,
        cacheHitRate: Math.round(cacheHitRate * 100),
        byProvider,
        byModel,
        topAgents,
      }
    } catch {
      return {
        totalCostUsd: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        totalCalls: 0,
        avgLatencyMs: 0,
        cacheHitRate: 0,
        byProvider: [],
        byModel: [],
        topAgents: [],
      }
    }
  }),

  /** Prune expired cache entries */
  pruneCache: protectedProcedure.mutation(async ({ ctx }) => {
    const gw = getGateway(ctx.db)
    const pruned = await gw.cache.prune()
    return { pruned }
  }),

  /** List configured Ollama Cloud models */
  ollamaModels: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await ctx.db.select().from(ollamaModels).orderBy(ollamaModels.addedAt)
    } catch {
      return []
    }
  }),

  /** Add an Ollama Cloud model (saves to DB registry) */
  addOllamaModel: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(ollamaModels)
        .values({ name: input.name.trim() })
        .returning()
      return row
    }),

  /** Remove an Ollama Cloud model */
  removeOllamaModel: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(ollamaModels).where(eq(ollamaModels.id, input.id))
      return { success: true }
    }),

  /** Pull/register a model from Ollama. Cloud models (name ends with :cloud) are
   *  registered directly since /api/pull is not supported on ollama.com. */
  pullOllamaModel: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const modelName = input.name.trim()
      const isCloudModel = modelName.endsWith(':cloud') || modelName.includes('-cloud')

      // Save to DB registry if not already there
      const existing = await ctx.db.query.ollamaModels.findFirst({
        where: eq(ollamaModels.name, modelName),
      })
      if (!existing) {
        await ctx.db.insert(ollamaModels).values({ name: modelName })
      }

      // Cloud models don't need pulling — they run on ollama.com's infra
      if (isCloudModel) {
        return { status: 'registered', model: modelName }
      }

      // Local models: pull via /api/pull
      const gw = getGateway(ctx.db)
      const ollamaAdapter = gw.getOllamaAdapter()
      if (!ollamaAdapter) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ollama adapter not available' })
      }

      const storedUrl = await gw.keyVault.getKey('ollama_url')
      ollamaAdapter.resolvedUrl = process.env.OLLAMA_BASE_URL ?? storedUrl ?? null
      const apiKey = process.env.OLLAMA_API_KEY ?? (await gw.keyVault.getKey('ollama')) ?? null

      const result = await ollamaAdapter.pullModel(modelName, apiKey ?? undefined)

      if (result.error) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.error })
      }

      return { status: result.status, model: modelName }
    }),

  /** List models available on the connected Ollama instance. */
  listOllamaAvailable: protectedProcedure.query(async ({ ctx }) => {
    const gw = getGateway(ctx.db)
    const ollamaAdapter = gw.getOllamaAdapter()
    if (!ollamaAdapter) return []

    const storedUrl = await gw.keyVault.getKey('ollama_url')
    ollamaAdapter.resolvedUrl = process.env.OLLAMA_BASE_URL ?? storedUrl ?? null
    const apiKey = process.env.OLLAMA_API_KEY ?? (await gw.keyVault.getKey('ollama')) ?? null

    return ollamaAdapter.listModels(apiKey ?? undefined)
  }),
})
