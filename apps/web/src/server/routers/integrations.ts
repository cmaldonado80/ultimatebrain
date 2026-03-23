import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { ChannelService, WebhookService, ArtifactService, ModelFallbackService } from '../services/integrations'

let channelSvc: ChannelService | null = null
let webhookSvc: WebhookService | null = null
let artifactSvc: ArtifactService | null = null
let fallbackSvc: ModelFallbackService | null = null

function getChannels(db: any) { return channelSvc ??= new ChannelService(db) }
function getWebhooks(db: any) { return webhookSvc ??= new WebhookService(db) }
function getArtifacts(db: any) { return artifactSvc ??= new ArtifactService(db) }
function getFallbacks(db: any) { return fallbackSvc ??= new ModelFallbackService(db) }

export const integrationsRouter = router({
  // === Channels ===

  createChannel: publicProcedure
    .input(z.object({
      type: z.string().min(1),
      config: z.record(z.unknown()).optional(),
      enabled: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getChannels(ctx.db).create(input)
    }),

  channels: publicProcedure
    .input(z.object({ enabledOnly: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getChannels(ctx.db).list(input?.enabledOnly)
    }),

  toggleChannel: publicProcedure
    .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return getChannels(ctx.db).toggle(input.id, input.enabled)
    }),

  deleteChannel: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getChannels(ctx.db).delete(input.id)
    }),

  // === Webhooks ===

  createWebhook: publicProcedure
    .input(z.object({
      source: z.string().optional(),
      url: z.string().url(),
      secret: z.string().optional(),
      enabled: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getWebhooks(ctx.db).create(input)
    }),

  webhooks: publicProcedure
    .input(z.object({ enabledOnly: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getWebhooks(ctx.db).list(input?.enabledOnly)
    }),

  toggleWebhook: publicProcedure
    .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return getWebhooks(ctx.db).toggle(input.id, input.enabled)
    }),

  deleteWebhook: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getWebhooks(ctx.db).delete(input.id)
    }),

  dispatchWebhook: publicProcedure
    .input(z.object({
      type: z.string().min(1),
      payload: z.unknown(),
      source: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getWebhooks(ctx.db).dispatch(
        { type: input.type, payload: input.payload },
        input.source,
      )
    }),

  // === Artifacts ===

  createArtifact: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      content: z.string().optional(),
      type: z.string().optional(),
      ticketId: z.string().uuid().optional(),
      agentId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getArtifacts(ctx.db).create(input)
    }),

  artifact: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getArtifacts(ctx.db).get(input.id)
    }),

  artifactsByTicket: publicProcedure
    .input(z.object({ ticketId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getArtifacts(ctx.db).listByTicket(input.ticketId)
    }),

  artifactsByAgent: publicProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getArtifacts(ctx.db).listByAgent(input.agentId)
    }),

  deleteArtifact: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getArtifacts(ctx.db).delete(input.id)
    }),

  // === Model Fallbacks ===

  setFallbackChain: publicProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      chain: z.array(z.string()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return getFallbacks(ctx.db).setChain(input.agentId, input.chain)
    }),

  fallbackChain: publicProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getFallbacks(ctx.db).getChain(input.agentId)
    }),

  allFallbackChains: publicProcedure.query(async ({ ctx }) => {
    return getFallbacks(ctx.db).listAll()
  }),

  resolveNextModel: publicProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      failedModel: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return getFallbacks(ctx.db).resolveNext(input.agentId, input.failedModel)
    }),

  deleteFallbackChain: publicProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getFallbacks(ctx.db).delete(input.agentId)
    }),
})
