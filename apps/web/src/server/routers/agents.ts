/**
 * Agents Router — CRUD for AI agent instances.
 *
 * Agents have types (executor/reviewer/planner/specialist), belong to workspaces,
 * and are assigned to tickets for execution. Supports capability and model configuration.
 */
import { agents, traces } from '@solarc/db'
import { TRPCError } from '@trpc/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { computeAgentScorecard } from '../services/intelligence/agent-scorecard'
import { AGENT_SOULS } from '../services/orchestration/agents'
import { protectedProcedure, router } from '../trpc'

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

  /** Bulk-assign Ollama cloud models to all agents that don't have an explicit model set */
  bulkAssignModels: protectedProcedure.mutation(async ({ ctx }) => {
    const MODEL_MAP: Record<string, string> = {
      orchestrator: 'deepseek-v3.2:cloud',
      reviewer: 'deepseek-v3.2:cloud',
      planner: 'deepseek-v3.2:cloud',
      specialist: 'qwen3.5:cloud',
      executor: 'qwen3.5:cloud',
      coder: 'qwen3.5:cloud',
      vision: 'llama-3.2-11b-vision:cloud',
      guard: 'llama-guard-3:cloud',
    }
    const allAgents = await ctx.db.query.agents.findMany()
    let updated = 0
    for (const agent of allAgents) {
      if (agent.model) continue // already has explicit model
      const model = MODEL_MAP[agent.type ?? ''] ?? 'qwen3.5:cloud'
      await ctx.db
        .update(agents)
        .set({ model, updatedAt: new Date() })
        .where(eq(agents.id, agent.id))
      updated++
    }
    return { updated, total: allAgents.length }
  }),

  /** Sync agent souls from .md files into the database */
  syncSouls: protectedProcedure.mutation(async ({ ctx }) => {
    const allAgents = await ctx.db.query.agents.findMany()
    const orchestratorSoul = AGENT_SOULS.get('workflow-orchestrator')
    let synced = 0
    let skipped = 0
    for (const agent of allAgents) {
      // Match by agent name (kebab-case slug)
      const slug = agent.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      let soulDef = AGENT_SOULS.get(slug) ?? AGENT_SOULS.get(agent.name)

      // Orchestrators get the workflow-orchestrator soul if no specific match
      if (
        !soulDef &&
        (agent.type === 'orchestrator' || agent.isWsOrchestrator) &&
        orchestratorSoul
      ) {
        soulDef = orchestratorSoul
      }

      if (!soulDef) {
        skipped++
        continue
      }
      // Only update if soul content differs
      if (agent.soul === soulDef.soul) {
        skipped++
        continue
      }
      await ctx.db
        .update(agents)
        .set({
          soul: soulDef.soul,
          model: soulDef.model !== 'sonnet' ? soulDef.model : agent.model,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, agent.id))
      synced++
    }
    return { synced, skipped, totalAgents: allAgents.length, totalSouls: AGENT_SOULS.size }
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

  // === Agent Performance ===

  /** Get performance scorecard for a single agent */
  getAgentScorecard: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return computeAgentScorecard(ctx.db, input.agentId)
    }),

  /** Get ranked agent performance for all agents in a workspace */
  getWorkspaceAgentPerformance: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const wsAgents = await ctx.db.query.agents.findMany({
        where: eq(agents.workspaceId, input.workspaceId),
      })

      const scorecards = await Promise.all(wsAgents.map((a) => computeAgentScorecard(ctx.db, a.id)))

      return scorecards
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => (b.avgQualityScore ?? 0) - (a.avgQualityScore ?? 0))
    }),
})
