/**
 * Topology Snapshot Builder — assembles the canonical topology graph.
 * Single responsibility: query DB sources, build nodes + edges.
 */
import type { Database } from '@solarc/db'

import type { TopologyEdge, TopologyNode, TopologySnapshot } from './schemas'

/**
 * Queries workspaces, agents, entities, and entity-agent links in parallel,
 * then assembles the full topology graph with nodes, edges, and stats.
 */
export async function buildTopologySnapshot(db: Database): Promise<TopologySnapshot> {
  const [allWorkspaces, allAgents, allEntities, entityAgentLinks] = await Promise.all([
    db.query.workspaces.findMany(),
    db.query.agents.findMany(),
    db.query.brainEntities.findMany(),
    db.query.brainEntityAgents.findMany(),
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

    if (agent.workspaceId) {
      edges.push({
        id: `edge-agent-ws-${agent.id}`,
        type: 'belongs_to',
        source: `agent-${agent.id}`,
        target: `ws-${agent.workspaceId}`,
      })
    }

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
    nodes.push({ id: modelId, type: 'model', label: modelName, metadata: {} })

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
      metadata: { tier: entity.tier, domain: entity.domain, enginesEnabled: entity.enginesEnabled },
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
    generatedAt: new Date(),
  }
}
