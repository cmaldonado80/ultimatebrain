/**
 * Model Registry Router — catalog of models with auto-detected types.
 *
 * Every model in the system is registered with its type (vision, reasoning, agentic,
 * coder, embedding, flash, guard, judge, router, multimodal), provider, capabilities,
 * and cost info. Models are auto-typed on registration using the ModelTypeDetector.
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc'
import { modelRegistry } from '@solarc/db'
import { eq } from 'drizzle-orm'
import { ModelTypeDetector } from '../services/gateway/model-type-detector'

const detector = new ModelTypeDetector()

const modelTypeValues = [
  'vision',
  'reasoning',
  'agentic',
  'coder',
  'embedding',
  'flash',
  'guard',
  'judge',
  'router',
  'multimodal',
] as const

export const modelRegistryRouter = router({
  // ── List / Query ──────────────────────────────────────────────────

  list: protectedProcedure
    .input(
      z
        .object({
          provider: z.string().optional(),
          modelType: z.enum(modelTypeValues).optional(),
          activeOnly: z.boolean().default(true),
          limit: z.number().min(1).max(200).default(100),
          offset: z.number().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input?.provider) conditions.push(eq(modelRegistry.provider, input.provider))
      if (input?.modelType) conditions.push(eq(modelRegistry.modelType, input.modelType))
      if (input?.activeOnly !== false) conditions.push(eq(modelRegistry.isActive, true))
      const { and } = await import('drizzle-orm')
      return ctx.db.query.modelRegistry.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        limit: input?.limit ?? 100,
        offset: input?.offset ?? 0,
      })
    }),

  byId: protectedProcedure
    .input(z.object({ modelId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.modelRegistry.findFirst({
        where: eq(modelRegistry.modelId, input.modelId),
      })
    }),

  byType: protectedProcedure
    .input(z.object({ modelType: z.enum(modelTypeValues) }))
    .query(async ({ ctx, input }) => {
      const { and } = await import('drizzle-orm')
      return ctx.db.query.modelRegistry.findMany({
        where: and(eq(modelRegistry.modelType, input.modelType), eq(modelRegistry.isActive, true)),
      })
    }),

  // ── Registration ──────────────────────────────────────────────────

  register: protectedProcedure
    .input(
      z.object({
        modelId: z.string().min(1),
        displayName: z.string().optional(),
        provider: z.string().optional(),
        modelType: z.enum(modelTypeValues).optional(),
        contextWindow: z.number().optional(),
        maxOutputTokens: z.number().optional(),
        supportsVision: z.boolean().optional(),
        supportsTools: z.boolean().optional(),
        supportsStreaming: z.boolean().optional(),
        inputCostPerMToken: z.number().optional(),
        outputCostPerMToken: z.number().optional(),
        speedTier: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Auto-detect type if not provided
      const detected = detector.detect(input.modelId)

      const [model] = await ctx.db
        .insert(modelRegistry)
        .values({
          modelId: input.modelId,
          displayName: input.displayName ?? detected.displayName,
          provider: input.provider ?? detected.provider,
          modelType: input.modelType ?? detected.type,
          secondaryTypes: detected.secondaryTypes,
          contextWindow: input.contextWindow ?? detected.contextWindow,
          maxOutputTokens: input.maxOutputTokens ?? detected.maxOutputTokens,
          supportsVision: input.supportsVision ?? detected.supportsVision,
          supportsTools: input.supportsTools ?? detected.supportsTools,
          supportsStreaming: input.supportsStreaming ?? detected.supportsStreaming,
          inputCostPerMToken: input.inputCostPerMToken ?? detected.inputCostPerMToken,
          outputCostPerMToken: input.outputCostPerMToken ?? detected.outputCostPerMToken,
          speedTier: input.speedTier ?? detected.speedTier,
          detectedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: modelRegistry.modelId,
          set: {
            displayName: input.displayName ?? detected.displayName,
            provider: input.provider ?? detected.provider,
            modelType: input.modelType ?? detected.type,
            secondaryTypes: detected.secondaryTypes,
            contextWindow: input.contextWindow ?? detected.contextWindow,
            maxOutputTokens: input.maxOutputTokens ?? detected.maxOutputTokens,
            supportsVision: input.supportsVision ?? detected.supportsVision,
            supportsTools: input.supportsTools ?? detected.supportsTools,
            supportsStreaming: input.supportsStreaming ?? detected.supportsStreaming,
            inputCostPerMToken: input.inputCostPerMToken ?? detected.inputCostPerMToken,
            outputCostPerMToken: input.outputCostPerMToken ?? detected.outputCostPerMToken,
            speedTier: input.speedTier ?? detected.speedTier,
            detectedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning()

      return model
    }),

  update: protectedProcedure
    .input(
      z.object({
        modelId: z.string(),
        displayName: z.string().optional(),
        modelType: z.enum(modelTypeValues).optional(),
        isActive: z.boolean().optional(),
        speedTier: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { modelId, ...fields } = input
      const [updated] = await ctx.db
        .update(modelRegistry)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(modelRegistry.modelId, modelId))
        .returning()
      if (!updated)
        throw new TRPCError({ code: 'NOT_FOUND', message: `Model ${modelId} not found` })
      return updated
    }),

  remove: protectedProcedure
    .input(z.object({ modelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(modelRegistry)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(modelRegistry.modelId, input.modelId))
        .returning()
      if (!updated)
        throw new TRPCError({ code: 'NOT_FOUND', message: `Model ${input.modelId} not found` })
      return { deactivated: true }
    }),

  // ── Detection ─────────────────────────────────────────────────────

  detect: protectedProcedure.input(z.object({ modelId: z.string().min(1) })).query(({ input }) => {
    return detector.detect(input.modelId)
  }),

  // ── Bulk Seed ─────────────────────────────────────────────────────

  seedKnownModels: protectedProcedure.mutation(async ({ ctx }) => {
    const knownModels = detector.getKnownModels()
    let registered = 0

    for (const model of knownModels) {
      const detected = detector.detect(model.modelId)
      await ctx.db
        .insert(modelRegistry)
        .values({
          modelId: model.modelId,
          displayName: detected.displayName,
          provider: detected.provider,
          modelType: detected.type,
          secondaryTypes: detected.secondaryTypes,
          contextWindow: detected.contextWindow,
          maxOutputTokens: detected.maxOutputTokens,
          supportsVision: detected.supportsVision,
          supportsTools: detected.supportsTools,
          supportsStreaming: detected.supportsStreaming,
          inputCostPerMToken: detected.inputCostPerMToken,
          outputCostPerMToken: detected.outputCostPerMToken,
          speedTier: detected.speedTier,
          detectedAt: new Date(),
        })
        .onConflictDoNothing()
      registered++
    }

    return { registered, total: knownModels.length }
  }),
})
