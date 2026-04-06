/**
 * Integrations Router — external service connectors and fallback management.
 *
 * Manages communication channels, webhooks, artifact storage, and model fallback
 * chains for resilient external system integration.
 */
import type { Database } from '@solarc/db'
import { z } from 'zod'

import {
  ArtifactService,
  ChannelService,
  ModelFallbackService,
  WebhookService,
} from '../services/integrations'
import { protectedProcedure, router } from '../trpc'

let channelSvc: ChannelService | null = null
let webhookSvc: WebhookService | null = null
let artifactSvc: ArtifactService | null = null
let fallbackSvc: ModelFallbackService | null = null

function getChannels(db: Database) {
  return (channelSvc ??= new ChannelService(db))
}
function getWebhooks(db: Database) {
  return (webhookSvc ??= new WebhookService(db))
}
function getArtifacts(db: Database) {
  return (artifactSvc ??= new ArtifactService(db))
}
function getFallbacks(db: Database) {
  return (fallbackSvc ??= new ModelFallbackService(db))
}

export const integrationsRouter = router({
  // === Channels ===

  createChannel: protectedProcedure
    .input(
      z.object({
        type: z.string().min(1),
        config: z.record(z.unknown()).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getChannels(ctx.db).create(input)
    }),

  channels: protectedProcedure
    .input(z.object({ enabledOnly: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getChannels(ctx.db).list(input?.enabledOnly)
    }),

  toggleChannel: protectedProcedure
    .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return getChannels(ctx.db).toggle(input.id, input.enabled)
    }),

  deleteChannel: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getChannels(ctx.db).delete(input.id)
    }),

  // === Webhooks ===

  createWebhook: protectedProcedure
    .input(
      z.object({
        source: z.string().optional(),
        url: z.string().url(),
        secret: z.string().optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getWebhooks(ctx.db).create(input)
    }),

  webhooks: protectedProcedure
    .input(z.object({ enabledOnly: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getWebhooks(ctx.db).list(input?.enabledOnly)
    }),

  toggleWebhook: protectedProcedure
    .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return getWebhooks(ctx.db).toggle(input.id, input.enabled)
    }),

  deleteWebhook: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getWebhooks(ctx.db).delete(input.id)
    }),

  dispatchWebhook: protectedProcedure
    .input(
      z.object({
        type: z.string().min(1),
        payload: z.unknown(),
        source: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getWebhooks(ctx.db).dispatch(
        { type: input.type, payload: input.payload },
        input.source,
      )
    }),

  // === Artifacts ===

  createArtifact: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        content: z.string().optional(),
        type: z.string().optional(),
        ticketId: z.string().uuid().optional(),
        agentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getArtifacts(ctx.db).create(input)
    }),

  artifact: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getArtifacts(ctx.db).get(input.id)
    }),

  artifactsByTicket: protectedProcedure
    .input(z.object({ ticketId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getArtifacts(ctx.db).listByTicket(input.ticketId)
    }),

  artifactsByAgent: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getArtifacts(ctx.db).listByAgent(input.agentId)
    }),

  deleteArtifact: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getArtifacts(ctx.db).delete(input.id)
    }),

  /** List all artifacts with optional type filter */
  allArtifacts: protectedProcedure
    .input(
      z
        .object({ type: z.string().optional(), limit: z.number().min(1).max(100).default(50) })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.artifacts.findMany({
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit: input?.limit ?? 50,
      })
    }),

  /** Update artifact content (for iteration) */
  updateArtifact: protectedProcedure
    .input(z.object({ id: z.string().uuid(), content: z.string(), name: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { artifacts } = await import('@solarc/db')
      const { eq } = await import('drizzle-orm')
      await ctx.db
        .update(artifacts)
        .set({
          content: input.content,
          ...(input.name ? { name: input.name } : {}),
          updatedAt: new Date(),
        })
        .where(eq(artifacts.id, input.id))

      // Verify artifact integrity
      const { verifyAndEscalate } = await import('../services/orchestration/artifact-verifier')
      const updated = await ctx.db.query.artifacts.findFirst({ where: eq(artifacts.id, input.id) })
      if (updated?.content) {
        await verifyAndEscalate(ctx.db, input.id, updated.name, updated.content)
      }

      return { updated: true }
    }),

  // === Model Fallbacks ===

  setFallbackChain: protectedProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        chain: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getFallbacks(ctx.db).setChain(input.agentId, input.chain)
    }),

  fallbackChain: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getFallbacks(ctx.db).getChain(input.agentId)
    }),

  allFallbackChains: protectedProcedure.query(async ({ ctx }) => {
    return getFallbacks(ctx.db).listAll()
  }),

  resolveNextModel: protectedProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        failedModel: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return getFallbacks(ctx.db).resolveNext(input.agentId, input.failedModel)
    }),

  deleteFallbackChain: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getFallbacks(ctx.db).delete(input.agentId)
    }),
})
