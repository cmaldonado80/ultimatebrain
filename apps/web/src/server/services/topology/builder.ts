/**
 * Topology Builder — pure service functions extracted from the topology router.
 * Each function is independently testable and operates on the Database type.
 */
import type { Database } from '@solarc/db'

import type {
  BlastRadiusResult,
  Insight,
  RuntimeOverlay,
  TopologyEdge,
  TopologyNode,
  TopologySnapshot,
} from './schemas'

// ── buildTopologySnapshot ─────────────────────────────────────────────

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
    generatedAt: new Date(),
  }
}

// ── computeHealthScore ────────────────────────────────────────────────

/**
 * Pure function to compute overall health from status counts and cron failures.
 * - error === 0 && cronFails === 0 → healthy
 * - error > 3 || cronFails > 2 → unhealthy
 * - otherwise → degraded
 */
export function computeHealthScore(
  statusCounts: { error: number },
  cronFails: number,
): 'healthy' | 'degraded' | 'unhealthy' {
  if (statusCounts.error === 0 && cronFails === 0) return 'healthy'
  if (statusCounts.error > 3 || cronFails > 2) return 'unhealthy'
  return 'degraded'
}

// ── buildRuntimeOverlay ───────────────────────────────────────────────

/**
 * Queries agents, ticket executions, approval gates, and cron jobs in parallel,
 * then builds the runtime overlay with agent statuses, counts, and health score.
 */
export async function buildRuntimeOverlay(db: Database): Promise<RuntimeOverlay> {
  const [allAgents, executions, pendingApprovals, jobs] = await Promise.all([
    db.query.agents.findMany(),
    db.query.ticketExecution.findMany(),
    db.query.approvalGates.findMany(),
    db.query.cronJobs.findMany(),
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
    executing: allAgents.filter((a) => a.status === 'executing' || a.status === 'planning').length,
    error: allAgents.filter((a) => a.status === 'error').length,
    offline: allAgents.filter((a) => a.status === 'offline').length,
  }

  const pending = pendingApprovals.filter((a) => a.status === 'pending').length
  const activeCrons = jobs.filter((j) => j.status === 'active').length
  const failedCrons = jobs.filter((j) => j.status === 'failed').length

  const healthScore = computeHealthScore(statusCounts, failedCrons)

  return {
    agentStatuses,
    statusCounts,
    pendingApprovals: pending,
    cronSummary: { active: activeCrons, failed: failedCrons, total: jobs.length },
    healthScore,
    timestamp: new Date(),
  }
}

// ── detectInsights ────────────────────────────────────────────────────

/**
 * Detects topology insights (issues, warnings, recommendations) by analyzing
 * the snapshot and querying entity-agent assignments from the database.
 */
export async function detectInsights(snapshot: TopologySnapshot, db: Database): Promise<Insight[]> {
  const insights: Insight[] = []

  // Extract agents from snapshot nodes
  const agentNodes = snapshot.nodes.filter((n) => n.type === 'agent' || n.type === 'orchestrator')

  // 1. Single points of failure — orchestrators supervising many agents
  const orchAgentCounts = new Map<string, number>()
  for (const node of agentNodes) {
    if (node.parentId) {
      orchAgentCounts.set(node.parentId, (orchAgentCounts.get(node.parentId) ?? 0) + 1)
    }
  }
  for (const [orchNodeId, count] of orchAgentCounts) {
    if (count >= 10) {
      const orch = snapshot.nodes.find((n) => n.id === orchNodeId)
      insights.push({
        id: `spof-${orchNodeId}`,
        severity: 'critical',
        title: `Single point of failure: ${orch?.label ?? orchNodeId}`,
        description: `This orchestrator supervises ${count} agents. If it fails, all ${count} agents are affected.`,
        nodeIds: [orchNodeId],
      })
    }
  }

  // 2. Isolated agents — no workspace, no parent orchestrator
  const isolated = agentNodes.filter((n) => !n.workspaceId && !n.parentId)
  if (isolated.length > 0) {
    insights.push({
      id: 'isolated-agents',
      severity: 'warning',
      title: `${isolated.length} isolated agent(s)`,
      description: 'These agents have no workspace and no parent orchestrator. They may be unused.',
      nodeIds: isolated.map((n) => n.id),
    })
  }

  // 3. Model concentration — too many agents on one model
  const modelCounts = new Map<string, number>()
  for (const node of agentNodes) {
    const model = node.metadata.model as string | undefined
    if (model) modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1)
  }
  for (const [model, count] of modelCounts) {
    const pct = Math.round((count / agentNodes.length) * 100)
    if (pct > 70) {
      insights.push({
        id: `model-concentration-${model}`,
        severity: 'warning',
        title: `${pct}% of agents use ${model}`,
        description: `${count} of ${agentNodes.length} agents depend on this model. If the provider goes down, most of the swarm is affected.`,
        nodeIds: [`model-${model.replace(/[^a-z0-9]/gi, '-')}`],
      })
    }
  }

  // 4. Agents in error state
  const errorAgents = agentNodes.filter((n) => n.status === 'error')
  if (errorAgents.length > 0) {
    insights.push({
      id: 'error-agents',
      severity: errorAgents.length > 3 ? 'critical' : 'warning',
      title: `${errorAgents.length} agent(s) in error state`,
      description: 'These agents need attention — they may be blocking work.',
      nodeIds: errorAgents.map((n) => n.id),
    })
  }

  // 5. Unassigned entities — entities with no agents
  const entityAgentLinks = await db.query.brainEntityAgents.findMany()
  const assignedEntityIds = new Set(entityAgentLinks.map((l) => l.entityId))
  const entityNodes = snapshot.nodes.filter((n) => n.type === 'entity')
  const unassigned = entityNodes.filter((n) => {
    const rawId = n.id.replace(/^entity-/, '')
    return !assignedEntityIds.has(rawId)
  })
  if (unassigned.length > 0) {
    insights.push({
      id: 'unassigned-entities',
      severity: 'info',
      title: `${unassigned.length} entity/entities without agents`,
      description: 'These brain entities have no agents assigned. They may need provisioning.',
      nodeIds: unassigned.map((n) => n.id),
    })
  }

  return insights
}

// ── computeBlastRadius ────────────────────────────────────────────────

/**
 * Pure BFS-based blast radius computation. Given a snapshot and a node ID,
 * determines which other nodes would be affected if the target node fails.
 * No database access needed — operates entirely on the snapshot graph.
 */
export function computeBlastRadius(snapshot: TopologySnapshot, nodeId: string): BlastRadiusResult {
  const rawId = nodeId.replace(/^(agent|ws|model|entity)-/, '')
  const affected = new Set<string>()
  const queue: string[] = [rawId]
  let depth = 0

  // Build lookup structures from snapshot for efficient traversal
  const agentNodes = snapshot.nodes.filter((n) => n.type === 'agent' || n.type === 'orchestrator')
  const entityNodes = snapshot.nodes.filter((n) => n.type === 'entity')

  // Extract raw IDs and relationships from edges
  const supervisionEdges = snapshot.edges.filter((e) => e.type === 'supervises')
  const belongsToEdges = snapshot.edges.filter((e) => e.type === 'belongs_to')
  const entityChildEdges = snapshot.edges.filter((e) => e.type === 'entity_child')
  const entityAgentEdges = snapshot.edges.filter((e) => e.type === 'entity_agent')

  // Build maps from raw IDs
  // parentOrchestratorId → child agent IDs
  const childrenByOrch = new Map<string, string[]>()
  for (const edge of supervisionEdges) {
    const parentRawId = edge.source.replace(/^agent-/, '')
    const childRawId = edge.target.replace(/^agent-/, '')
    const existing = childrenByOrch.get(parentRawId) ?? []
    existing.push(childRawId)
    childrenByOrch.set(parentRawId, existing)
  }

  // workspaceId → agent raw IDs
  const agentsByWorkspace = new Map<string, string[]>()
  for (const edge of belongsToEdges) {
    const agentRawId = edge.source.replace(/^agent-/, '')
    const wsRawId = edge.target.replace(/^ws-/, '')
    const existing = agentsByWorkspace.get(wsRawId) ?? []
    existing.push(agentRawId)
    agentsByWorkspace.set(wsRawId, existing)
  }

  // agent raw ID → workspaceId
  const workspaceByAgent = new Map<string, string>()
  for (const edge of belongsToEdges) {
    const agentRawId = edge.source.replace(/^agent-/, '')
    const wsRawId = edge.target.replace(/^ws-/, '')
    workspaceByAgent.set(agentRawId, wsRawId)
  }

  // parentEntityId → child entity IDs
  const childrenByEntity = new Map<string, string[]>()
  for (const edge of entityChildEdges) {
    const parentRawId = edge.source.replace(/^entity-/, '')
    const childRawId = edge.target.replace(/^entity-/, '')
    const existing = childrenByEntity.get(parentRawId) ?? []
    existing.push(childRawId)
    childrenByEntity.set(parentRawId, existing)
  }

  // entityId → agent IDs
  const agentsByEntity = new Map<string, string[]>()
  for (const edge of entityAgentEdges) {
    const entityRawId = edge.source.replace(/^entity-/, '')
    const agentRawId = edge.target.replace(/^agent-/, '')
    const existing = agentsByEntity.get(entityRawId) ?? []
    existing.push(agentRawId)
    agentsByEntity.set(entityRawId, existing)
  }

  // BFS to find affected nodes (max depth 3)
  while (queue.length > 0 && depth < 3) {
    const nextQueue: string[] = []
    for (const id of queue) {
      // Agents supervised by this agent
      const children = childrenByOrch.get(id) ?? []
      for (const childId of children) {
        if (!affected.has(childId)) {
          affected.add(childId)
          nextQueue.push(childId)
        }
      }

      // Agents in same workspace
      const wsId = workspaceByAgent.get(id)
      if (wsId) {
        const wsAgents = agentsByWorkspace.get(wsId) ?? []
        for (const agentId of wsAgents) {
          if (agentId !== id && !affected.has(agentId)) {
            affected.add(agentId)
          }
        }
      }

      // Entity children
      const entityChildren = childrenByEntity.get(id) ?? []
      for (const childId of entityChildren) {
        if (!affected.has(childId)) {
          affected.add(childId)
          nextQueue.push(childId)
        }
      }

      // Agents linked to entity
      const linkedAgents = agentsByEntity.get(id) ?? []
      for (const agentId of linkedAgents) {
        if (!affected.has(agentId)) {
          affected.add(agentId)
        }
      }
    }
    queue.length = 0
    queue.push(...nextQueue)
    depth++
  }

  const totalNodes = agentNodes.length + entityNodes.length
  const riskScore = Math.min(
    100,
    Math.round((affected.size / Math.max(agentNodes.length, 1)) * 100),
  )

  return {
    nodeId,
    affectedNodes: [...affected],
    affectedCount: affected.size,
    totalNodes,
    riskScore,
    depth,
  }
}
