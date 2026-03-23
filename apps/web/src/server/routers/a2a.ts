import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { A2AEngine, AgentCardGenerator, A2ARegistry } from '../services/a2a'

let engine: A2AEngine | null = null
function getEngine(db: any) { return engine ??= new A2AEngine(db) }

export const a2aRouter = router({
  // === Agent Card Registry ===

  registerCard: protectedProcedure
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

  card: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getEngine(ctx.db).getCard(input.agentId)
    }),

  cards: protectedProcedure.query(async ({ ctx }) => {
    return getEngine(ctx.db).listCards()
  }),

  removeCard: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).removeCard(input.agentId)
    }),

  discover: protectedProcedure
    .input(z.object({ skill: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return getEngine(ctx.db).discover(input.skill)
    }),

  // === Task Delegation ===

  delegate: protectedProcedure
    .input(z.object({
      agentId: z.string(),
      task: z.string().min(1),
      context: z.record(z.unknown()).optional(),
      callbackUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).delegate(input)
    }),

  accept: protectedProcedure
    .input(z.object({ delegationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).accept(input.delegationId)
    }),

  reject: protectedProcedure
    .input(z.object({ delegationId: z.string().uuid(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).reject(input.delegationId, input.reason)
    }),

  completeDelegation: protectedProcedure
    .input(z.object({ delegationId: z.string().uuid(), result: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).complete(input.delegationId, input.result)
    }),

  failDelegation: protectedProcedure
    .input(z.object({ delegationId: z.string().uuid(), error: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return getEngine(ctx.db).fail(input.delegationId, input.error)
    }),

  delegationStatus: protectedProcedure
    .input(z.object({ delegationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getEngine(ctx.db).getStatus(input.delegationId)
    }),

  pendingDelegations: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getEngine(ctx.db).pendingFor(input.agentId)
    }),

  // === Phase 9: Agent Card Generation ===

  /** Generate well-known card for a single agent */
  generateCard: protectedProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      baseUrl: z.string().url(),
      version: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const generator = new AgentCardGenerator(ctx.db)
      const card = await generator.generateForAgent(input.agentId, {
        baseUrl: input.baseUrl,
        authType: 'bearer',
        version: input.version,
      })
      await generator.persistCard(input.agentId, card)
      return card
    }),

  /** Generate and persist cards for all active agents */
  generateAllCards: protectedProcedure
    .input(z.object({ baseUrl: z.string().url(), version: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const generator = new AgentCardGenerator(ctx.db)
      const cards = await generator.generateAll({ baseUrl: input.baseUrl, version: input.version })
      for (const [agentId, card] of Object.entries(cards)) {
        await generator.persistCard(agentId, card)
      }
      return { generated: Object.keys(cards).length, cards }
    }),

  // === Phase 9: External Agent Registry ===

  /** Register an external agent by its base URL */
  registerExternal: protectedProcedure
    .input(z.object({ agentBaseUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const registry = new A2ARegistry(ctx.db)
      return registry.register(input.agentBaseUrl)
    }),

  /** List all registered external agents */
  listExternal: protectedProcedure.query(async ({ ctx }) => {
    const registry = new A2ARegistry(ctx.db)
    return registry.list()
  }),

  /** Find external agents by skill */
  findExternalBySkill: protectedProcedure
    .input(z.object({ skill: z.string() }))
    .query(async ({ ctx, input }) => {
      const registry = new A2ARegistry(ctx.db)
      return registry.findBySkill(input.skill)
    }),

  /** Run health checks on all registered external agents */
  healthCheckAll: protectedProcedure.mutation(async ({ ctx }) => {
    const registry = new A2ARegistry(ctx.db)
    return registry.runHealthChecks()
  }),

  /** Deregister an external agent */
  deregisterExternal: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const registry = new A2ARegistry(ctx.db)
      await registry.deregister(input.agentId)
      return { success: true }
    }),
})
