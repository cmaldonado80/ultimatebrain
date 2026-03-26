/**
 * Agents Router — CRUD for AI agent instances.
 *
 * Agents have types (executor/reviewer/planner/specialist), belong to workspaces,
 * and are assigned to tickets for execution. Supports capability and model configuration.
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc'
import { agents, traces } from '@solarc/db'
import { eq, and, desc } from 'drizzle-orm'

export const agentsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(500).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.agents.findMany({
        limit: input.limit,
        offset: input.offset,
      })
    }),
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.agents.findFirst({ where: eq(agents.id, input.id) })
    }),
  byWorkspace: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        limit: z.number().min(1).max(500).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.agents.findMany({
        where: eq(agents.workspaceId, input.workspaceId),
        orderBy: desc(agents.createdAt),
        limit: input.limit,
        offset: input.offset,
      })
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.string().optional(),
        workspaceId: z.string().uuid().optional(),
        model: z.string().optional(),
        requiredModelType: z
          .enum([
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
          ])
          .optional(),
        description: z.string().optional(),
        skills: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        soul: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().min(1).max(200000).optional(),
        toolAccess: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [agent] = await ctx.db.insert(agents).values(input).returning()
      if (!agent)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create agent' })
      return agent
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        type: z.string().optional(),
        model: z.string().optional(),
        requiredModelType: z
          .enum([
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
          ])
          .optional(),
        description: z.string().optional(),
        skills: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        isWsOrchestrator: z.boolean().optional(),
        status: z
          .enum(['idle', 'planning', 'executing', 'reviewing', 'error', 'offline'])
          .optional(),
        soul: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().min(1).max(200000).optional(),
        toolAccess: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input

      // Prevent unsetting orchestrator flag on the last orchestrator
      if (fields.isWsOrchestrator === false) {
        const existing = await ctx.db.query.agents.findFirst({ where: eq(agents.id, id) })
        if (existing?.isWsOrchestrator && existing.workspaceId) {
          const orchestrators = await ctx.db.query.agents.findMany({
            where: and(
              eq(agents.workspaceId, existing.workspaceId),
              eq(agents.isWsOrchestrator, true),
            ),
          })
          if (orchestrators.length <= 1)
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Cannot remove orchestrator role from the last orchestrator in a workspace',
            })
        }
      }

      const [updated] = await ctx.db
        .update(agents)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(agents.id, id))
        .returning()
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' })
      return updated
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.agents.findFirst({ where: eq(agents.id, input.id) })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' })

      // Prevent deleting the last orchestrator from a workspace
      if (existing.isWsOrchestrator && existing.workspaceId) {
        const orchestrators = await ctx.db.query.agents.findMany({
          where: and(
            eq(agents.workspaceId, existing.workspaceId),
            eq(agents.isWsOrchestrator, true),
          ),
        })
        if (orchestrators.length <= 1)
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot delete the last orchestrator agent from a workspace',
          })
      }

      await ctx.db.delete(agents).where(eq(agents.id, input.id))
      return { deleted: true }
    }),

  /** Export an agent as a portable manifest JSON */
  exportAgent: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const agent = await ctx.db.query.agents.findFirst({ where: eq(agents.id, input.id) })
      if (!agent) throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' })

      return {
        version: '1.0' as const,
        name: agent.name,
        description: agent.description ?? undefined,
        soul: agent.soul ?? undefined,
        type: agent.type ?? undefined,
        requiredCapability: (agent.requiredModelType as string) ?? 'reasoning',
        preferredModel: agent.model ?? undefined,
        skills: agent.skills ?? [],
        tags: agent.tags ?? [],
        temperature: agent.temperature ?? undefined,
        maxTokens: agent.maxTokens ?? undefined,
      }
    }),

  /** Import an agent from a portable manifest JSON */
  importAgent: protectedProcedure
    .input(
      z.object({
        version: z.literal('1.0'),
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.string().optional(),
        requiredCapability: z.string().default('reasoning'),
        preferredModel: z.string().optional(),
        skills: z.array(z.string()).default([]),
        tags: z.array(z.string()).default([]),
        soul: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().min(1).max(200000).optional(),
        workspaceId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
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
      ]
      const reqType = modelTypeValues.includes(input.requiredCapability)
        ? (input.requiredCapability as
            | 'vision'
            | 'reasoning'
            | 'agentic'
            | 'coder'
            | 'embedding'
            | 'flash'
            | 'guard'
            | 'judge'
            | 'router'
            | 'multimodal')
        : 'reasoning'

      const [agent] = await ctx.db
        .insert(agents)
        .values({
          name: input.name,
          description: input.description,
          type: input.type,
          model: input.preferredModel,
          requiredModelType: reqType,
          skills: input.skills,
          tags: input.tags,
          soul: input.soul,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
          workspaceId: input.workspaceId,
        })
        .returning()
      if (!agent)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to import agent' })
      return agent
    }),

  /** Get agent with recent traces for the detail page */
  agentWithTraces: protectedProcedure
    .input(z.object({ id: z.string().uuid(), traceLimit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const agent = await ctx.db.query.agents.findFirst({ where: eq(agents.id, input.id) })
      if (!agent) throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' })

      const recentTraces = await ctx.db.query.traces
        .findMany({
          where: eq(traces.agentId, input.id),
          orderBy: desc(traces.createdAt),
          limit: input.traceLimit,
        })
        .catch(() => [])

      return { ...agent, recentTraces }
    }),
})
