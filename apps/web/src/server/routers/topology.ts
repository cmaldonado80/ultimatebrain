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
})
