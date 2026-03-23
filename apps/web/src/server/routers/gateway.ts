import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure, protectedProcedure } from '../trpc'
import { gatewayMetrics } from '@solarc/db'
import { LlmChatInput, LlmEmbedInput } from '@solarc/engine-contracts'
import { GatewayRouter, GatewayError } from '../services/gateway'

/**
 * Singleton gateway instance — initialized lazily with db from context.
 * In production this would be managed by a DI container.
 */
let gatewayInstance: GatewayRouter | null = null

function getGateway(db: any): GatewayRouter {
  if (!gatewayInstance) {
    gatewayInstance = new GatewayRouter(db)
  }
  return gatewayInstance
}

export const gatewayRouter = router({
  /** Send a chat request through the AI gateway */
  chat: protectedProcedure
    .input(LlmChatInput)
    .mutation(async ({ ctx, input }) => {
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
  embed: protectedProcedure
    .input(LlmEmbedInput)
    .mutation(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      return gw.embed(input.text, input.model)
    }),

  /** Get recent gateway metrics (paginated) */
  metrics: publicProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.gatewayMetrics.findMany({
        limit: input?.limit ?? 100,
        orderBy: (m, { desc }) => [desc(m.createdAt)],
      })
    }),

  /** Record a metric manually (for external providers or testing) */
  record: protectedProcedure
    .input(z.object({
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
    }))
    .mutation(async ({ ctx, input }) => {
      const [metric] = await ctx.db.insert(gatewayMetrics).values(input).returning()
      if (!metric) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to record metric' })
      return metric
    }),

  /** Get provider health (circuit breaker states) */
  health: publicProcedure.query(async ({ ctx }) => {
    const gw = getGateway(ctx.db)
    return gw.getHealth()
  }),

  /** Get cost summary for an agent */
  agentCost: publicProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      return gw.costTracker.getUsage(input.agentId, 'agent')
    }),

  /** Check budget status for an agent */
  budgetStatus: publicProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      return gw.costTracker.checkBudget(input.agentId)
    }),

  /** Set budget for an agent */
  setBudget: protectedProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      softLimitUsd: z.number().positive(),
      hardLimitUsd: z.number().positive(),
      period: z.enum(['daily', 'weekly', 'monthly']),
    }))
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
    .input(z.object({
      agentId: z.string().uuid(),
      maxTokens: z.number().positive(),
      refillRatePerSecond: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      gw.rateLimiter.setAgentLimit(input.agentId, {
        maxTokens: input.maxTokens,
        refillRatePerSecond: input.refillRatePerSecond,
      })
      return { success: true }
    }),

  /** Get rate limit capacity for an agent */
  rateLimitStatus: publicProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      return gw.rateLimiter.getAgentCapacity(input.agentId)
    }),

  /** Store an API key (encrypted) */
  storeKey: protectedProcedure
    .input(z.object({
      provider: z.string(),
      apiKey: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)
      await gw.keyVault.storeKey(input.provider, input.apiKey)
      return { success: true }
    }),

  /** Rotate an API key */
  rotateKey: protectedProcedure
    .input(z.object({
      provider: z.string(),
      newApiKey: z.string().min(1),
    }))
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
    const { CostTracker } = require('../services/gateway')
    return CostTracker.getPricing()
  }),

  /** Prune expired cache entries */
  pruneCache: protectedProcedure.mutation(async ({ ctx }) => {
    const gw = getGateway(ctx.db)
    const pruned = await gw.cache.prune()
    return { pruned }
  }),
})
