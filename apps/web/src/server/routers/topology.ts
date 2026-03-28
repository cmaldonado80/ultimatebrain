/**
 * Topology Router — aggregates system topology into a graph for the Swarm Observatory.
 * Combines: workspaces, agents, entities, orchestrator hierarchy, routes, models.
 */
import { agents, brainEntities, workspaces } from '@solarc/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { protectedProcedure, router } from '../trpc'

// ── Graph Types ──────────────────────────────────────────────────────────

interface TopologyNode {
  id: string
  type: 'workspace' | 'agent' | 'orchestrator' | 'model' | 'entity'
  label: string
  status?: string
  workspaceId?: string | null
  parentId?: string | null
  metadata: Record<string, unknown>
}

interface TopologyEdge {
  id: string
  type:
    | 'belongs_to'
    | 'delegates_to'
    | 'supervises'
    | 'uses_model'
    | 'entity_agent'
    | 'entity_child'
  source: string
  target: string
  label?: string
  metadata?: Record<string, unknown>
}

// ── Router ───────────────────────────────────────────────────────────────

export const topologyRouter = router({
  /** Full system topology graph */
  getTopology: protectedProcedure.query(async ({ ctx }) => {
    const [allWorkspaces, allAgents, allEntities, entityAgentLinks] = await Promise.all([
      ctx.db.query.workspaces.findMany(),
      ctx.db.query.agents.findMany(),
      ctx.db.query.brainEntities.findMany(),
      ctx.db.query.brainEntityAgents.findMany(),
    ])

    const nodes: TopologyNode[] = []
    const edges: TopologyEdge[] = []

    // 1. Workspace nodes
    for (const ws of allWorkspaces) {
      nodes.push({
        id: `ws-${ws.id}`,
        type: 'workspace',
        label: ws.name,
        status: ws.lifecycleState ?? 'active',
        metadata: {
          type: ws.type,
          agentCount: allAgents.filter((a) => a.workspaceId === ws.id).length,
        },
      })
    }

    // 2. Agent nodes + workspace edges
    for (const agent of allAgents) {
      const isOrch = agent.isWsOrchestrator
      nodes.push({
        id: `agent-${agent.id}`,
        type: isOrch ? 'orchestrator' : 'agent',
        label: agent.name,
        status: agent.status ?? 'idle',
        workspaceId: agent.workspaceId,
        parentId: agent.parentOrchestratorId ? `agent-${agent.parentOrchestratorId}` : null,
        metadata: {
          agentType: agent.type,
          model: agent.model,
          skills: agent.skills,
          tags: agent.tags,
          requiredModelType: agent.requiredModelType,
        },
      })

      // Edge: agent belongs to workspace
      if (agent.workspaceId) {
        edges.push({
          id: `edge-agent-ws-${agent.id}`,
          type: 'belongs_to',
          source: `agent-${agent.id}`,
          target: `ws-${agent.workspaceId}`,
        })
      }

      // Edge: orchestrator supervises (parent → child)
      if (agent.parentOrchestratorId) {
        edges.push({
          id: `edge-supervises-${agent.id}`,
          type: 'supervises',
          source: `agent-${agent.parentOrchestratorId}`,
          target: `agent-${agent.id}`,
          label: 'supervises',
        })
      }
    }

    // 3. Model nodes + agent→model edges
    const usedModels = new Set(allAgents.map((a) => a.model).filter(Boolean) as string[])
    for (const modelName of usedModels) {
      const modelId = `model-${modelName.replace(/[^a-z0-9]/gi, '-')}`
      nodes.push({
        id: modelId,
        type: 'model',
        label: modelName,
        metadata: {},
      })

      // Edges: agents → model
      for (const agent of allAgents) {
        if (agent.model === modelName) {
          edges.push({
            id: `edge-model-${agent.id}-${modelName}`,
            type: 'uses_model',
            source: `agent-${agent.id}`,
            target: modelId,
          })
        }
      }
    }

    // 4. Entity nodes + hierarchy edges
    for (const entity of allEntities) {
      nodes.push({
        id: `entity-${entity.id}`,
        type: 'entity',
        label: entity.name,
        status: entity.status ?? 'active',
        parentId: entity.parentId ? `entity-${entity.parentId}` : null,
        metadata: {
          tier: entity.tier,
          domain: entity.domain,
          enginesEnabled: entity.enginesEnabled,
        },
      })

      if (entity.parentId) {
        edges.push({
          id: `edge-entity-child-${entity.id}`,
          type: 'entity_child',
          source: `entity-${entity.parentId}`,
          target: `entity-${entity.id}`,
          label: 'contains',
        })
      }
    }

    // 5. Entity-agent assignment edges
    for (const link of entityAgentLinks) {
      edges.push({
        id: `edge-entity-agent-${link.entityId}-${link.agentId}`,
        type: 'entity_agent',
        source: `entity-${link.entityId}`,
        target: `agent-${link.agentId}`,
        label: link.role ?? 'assigned',
        metadata: { role: link.role },
      })
    }

    return {
      nodes,
      edges,
      stats: {
        workspaces: allWorkspaces.length,
        agents: allAgents.length,
        orchestrators: allAgents.filter((a) => a.isWsOrchestrator).length,
        models: usedModels.size,
        entities: allEntities.length,
        edges: edges.length,
      },
    }
  }),

  /** Get detailed info for a specific node (inspector) */
  getNodeDetails: protectedProcedure
    .input(z.object({ nodeId: z.string(), nodeType: z.string() }))
    .query(async ({ ctx, input }) => {
      const rawId = input.nodeId.replace(/^(agent|ws|model|entity)-/, '')

      if (input.nodeType === 'agent' || input.nodeType === 'orchestrator') {
        const agent = await ctx.db.query.agents.findFirst({
          where: eq(agents.id, rawId),
        })
        return { type: 'agent' as const, data: agent }
      }

      if (input.nodeType === 'workspace') {
        const ws = await ctx.db.query.workspaces.findFirst({
          where: eq(workspaces.id, rawId),
        })
        const wsAgents = await ctx.db.query.agents.findMany({
          where: eq(agents.workspaceId, rawId),
        })
        return { type: 'workspace' as const, data: ws, agents: wsAgents }
      }

      if (input.nodeType === 'entity') {
        const entity = await ctx.db.query.brainEntities.findFirst({
          where: eq(brainEntities.id, rawId),
        })
        return { type: 'entity' as const, data: entity }
      }

      return { type: 'unknown' as const, data: null }
    }),

  /** Runtime overlay — live agent statuses, executions, health */
  getRuntimeOverlay: protectedProcedure.query(async ({ ctx }) => {
    const [allAgents, executions, pendingApprovals, jobs] = await Promise.all([
      ctx.db.query.agents.findMany(),
      ctx.db.query.ticketExecution.findMany(),
      ctx.db.query.approvalGates.findMany(),
      ctx.db.query.cronJobs.findMany(),
    ])

    const agentStatuses: Record<string, { status: string; currentTicket?: string }> = {}
    for (const a of allAgents) {
      const exec = executions.find((e) => e.lockOwner === a.id)
      agentStatuses[a.id] = {
        status: a.status ?? 'idle',
        currentTicket: exec?.ticketId ?? undefined,
      }
    }

    const statusCounts = {
      idle: allAgents.filter((a) => a.status === 'idle').length,
      executing: allAgents.filter((a) => a.status === 'executing' || a.status === 'planning')
        .length,
      error: allAgents.filter((a) => a.status === 'error').length,
      offline: allAgents.filter((a) => a.status === 'offline').length,
    }

    const pending = pendingApprovals.filter((a) => a.status === 'pending').length
    const activeCrons = jobs.filter((j) => j.status === 'active').length
    const failedCrons = jobs.filter((j) => j.status === 'failed').length

    const healthScore =
      statusCounts.error === 0 && failedCrons === 0
        ? 'healthy'
        : statusCounts.error > 3 || failedCrons > 2
          ? 'unhealthy'
          : 'degraded'

    return {
      agentStatuses,
      statusCounts,
      pendingApprovals: pending,
      cronSummary: { active: activeCrons, failed: failedCrons, total: jobs.length },
      healthScore,
      timestamp: new Date(),
    }
  }),

  /** Blast radius analysis — what's affected if a node fails */
  getBlastRadius: protectedProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const allAgents = await ctx.db.query.agents.findMany()
      const entityLinks = await ctx.db.query.brainEntityAgents.findMany()
      const entities = await ctx.db.query.brainEntities.findMany()

      const rawId = input.nodeId.replace(/^(agent|ws|model|entity)-/, '')
      const affected = new Set<string>()
      const queue: string[] = [rawId]
      let depth = 0

      // BFS to find affected nodes (max depth 3)
      while (queue.length > 0 && depth < 3) {
        const nextQueue: string[] = []
        for (const id of queue) {
          // Agents supervised by this agent
          for (const a of allAgents) {
            if (a.parentOrchestratorId === id && !affected.has(a.id)) {
              affected.add(a.id)
              nextQueue.push(a.id)
            }
          }
          // Agents in same workspace
          const agent = allAgents.find((a) => a.id === id)
          if (agent?.workspaceId) {
            for (const a of allAgents) {
              if (a.workspaceId === agent.workspaceId && a.id !== id && !affected.has(a.id)) {
                affected.add(a.id)
              }
            }
          }
          // Entity children
          for (const e of entities) {
            if (e.parentId === id && !affected.has(e.id)) {
              affected.add(e.id)
              nextQueue.push(e.id)
            }
          }
          // Agents linked to entity
          for (const link of entityLinks) {
            if (link.entityId === id && !affected.has(link.agentId)) {
              affected.add(link.agentId)
            }
          }
        }
        queue.length = 0
        queue.push(...nextQueue)
        depth++
      }

      const riskScore = Math.min(
        100,
        Math.round((affected.size / Math.max(allAgents.length, 1)) * 100),
      )

      return {
        nodeId: input.nodeId,
        affectedNodes: [...affected],
        affectedCount: affected.size,
        totalNodes: allAgents.length + entities.length,
        riskScore,
        depth,
      }
    }),

  /** Smart insights — detect topology issues */
  getInsights: protectedProcedure.query(async ({ ctx }) => {
    const allAgents = await ctx.db.query.agents.findMany()
    const entityLinks = await ctx.db.query.brainEntityAgents.findMany()

    type Insight = {
      id: string
      severity: 'info' | 'warning' | 'critical'
      title: string
      description: string
      nodeIds: string[]
    }

    const insights: Insight[] = []

    // 1. Single points of failure — orchestrators supervising many agents
    const orchAgentCounts = new Map<string, number>()
    for (const a of allAgents) {
      if (a.parentOrchestratorId) {
        orchAgentCounts.set(
          a.parentOrchestratorId,
          (orchAgentCounts.get(a.parentOrchestratorId) ?? 0) + 1,
        )
      }
    }
    for (const [orchId, count] of orchAgentCounts) {
      if (count >= 10) {
        const orch = allAgents.find((a) => a.id === orchId)
        insights.push({
          id: `spof-${orchId}`,
          severity: 'critical',
          title: `Single point of failure: ${orch?.name ?? orchId}`,
          description: `This orchestrator supervises ${count} agents. If it fails, all ${count} agents are affected.`,
          nodeIds: [`agent-${orchId}`],
        })
      }
    }

    // 2. Isolated agents — no workspace, no parent orchestrator
    const isolated = allAgents.filter((a) => !a.workspaceId && !a.parentOrchestratorId)
    if (isolated.length > 0) {
      insights.push({
        id: 'isolated-agents',
        severity: 'warning',
        title: `${isolated.length} isolated agent(s)`,
        description:
          'These agents have no workspace and no parent orchestrator. They may be unused.',
        nodeIds: isolated.map((a) => `agent-${a.id}`),
      })
    }

    // 3. Model concentration — too many agents on one model
    const modelCounts = new Map<string, number>()
    for (const a of allAgents) {
      if (a.model) modelCounts.set(a.model, (modelCounts.get(a.model) ?? 0) + 1)
    }
    for (const [model, count] of modelCounts) {
      const pct = Math.round((count / allAgents.length) * 100)
      if (pct > 70) {
        insights.push({
          id: `model-concentration-${model}`,
          severity: 'warning',
          title: `${pct}% of agents use ${model}`,
          description: `${count} of ${allAgents.length} agents depend on this model. If the provider goes down, most of the swarm is affected.`,
          nodeIds: [`model-${model.replace(/[^a-z0-9]/gi, '-')}`],
        })
      }
    }

    // 4. Agents in error state
    const errorAgents = allAgents.filter((a) => a.status === 'error')
    if (errorAgents.length > 0) {
      insights.push({
        id: 'error-agents',
        severity: errorAgents.length > 3 ? 'critical' : 'warning',
        title: `${errorAgents.length} agent(s) in error state`,
        description: 'These agents need attention — they may be blocking work.',
        nodeIds: errorAgents.map((a) => `agent-${a.id}`),
      })
    }

    // 5. Unassigned entities — entities with no agents
    const assignedEntityIds = new Set(entityLinks.map((l) => l.entityId))
    const entities = await ctx.db.query.brainEntities.findMany()
    const unassigned = entities.filter((e) => !assignedEntityIds.has(e.id))
    if (unassigned.length > 0) {
      insights.push({
        id: 'unassigned-entities',
        severity: 'info',
        title: `${unassigned.length} entity/entities without agents`,
        description: 'These brain entities have no agents assigned. They may need provisioning.',
        nodeIds: unassigned.map((e) => `entity-${e.id}`),
      })
    }

    return insights
  }),
})
