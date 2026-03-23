import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { A2AEngine } from '../services/a2a'

let engine: A2AEngine | null = null
function getEngine(db: any) { return engine ??= new A2AEngine(db) }

export const a2aRouter = router({
  // === Agent Card Registry ===

  registerCard: publicProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      capabilities: z.unknown().optional(),
      authRequirements: z.unknown().optional(),
      endpoint: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { agentId, ...card } = input
      return getEngine(ctx.db).registerCard(agentId, card)
    }),

  card: publicProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getEngine(ctx.db).getCard(input.agentId)
    }),

  cards: publicProcedure.query(async ({ ctx }) => {
    return getEngine(ctx.db).listCards()
  }),

  removeCard: publicProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).removeCard(input.agentId)
    }),

  discover: publicProcedure
    .input(z.object({ skill: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return getEngine(ctx.db).discover(input.skill)
    }),

  // === Task Delegation ===

  delegate: publicProcedure
    .input(z.object({
      agentId: z.string(),
      task: z.string().min(1),
      context: z.record(z.unknown()).optional(),
      callbackUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).delegate(input)
    }),

  accept: publicProcedure
    .input(z.object({ delegationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).accept(input.delegationId)
    }),

  reject: publicProcedure
    .input(z.object({ delegationId: z.string().uuid(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).reject(input.delegationId, input.reason)
    }),

  completeDelegation: publicProcedure
    .input(z.object({ delegationId: z.string().uuid(), result: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).complete(input.delegationId, input.result)
    }),

  failDelegation: publicProcedure
    .input(z.object({ delegationId: z.string().uuid(), error: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).fail(input.delegationId, input.error)
    }),

  delegationStatus: publicProcedure
    .input(z.object({ delegationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getEngine(ctx.db).getStatus(input.delegationId)
    }),

  pendingDelegations: publicProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getEngine(ctx.db).pendingFor(input.agentId)
    }),
})
