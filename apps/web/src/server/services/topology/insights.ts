/**
 * Topology Insights — detects issues, warnings, and recommendations.
 * Operates on canonical TopologySnapshot + optional DB for entity checks.
 */
import type { Database } from '@solarc/db'

import type { Insight, TopologySnapshot } from './schemas'

/**
 * Analyze topology for common issues. Returns insights sorted by severity.
 */
export async function detectInsights(snapshot: TopologySnapshot, db: Database): Promise<Insight[]> {
  const insights: Insight[] = []
  const agentNodes = snapshot.nodes.filter((n) => n.type === 'agent' || n.type === 'orchestrator')

  // 1. Single points of failure — orchestrators supervising 10+ agents
  const orchCounts = new Map<string, number>()
  for (const node of agentNodes) {
    if (node.parentId) orchCounts.set(node.parentId, (orchCounts.get(node.parentId) ?? 0) + 1)
  }
  for (const [orchId, count] of orchCounts) {
    if (count >= 10) {
      const orch = snapshot.nodes.find((n) => n.id === orchId)
      insights.push({
        id: `spof-${orchId}`,
        severity: 'critical',
        title: `Single point of failure: ${orch?.label ?? orchId}`,
        description: `This orchestrator supervises ${count} agents. If it fails, all are affected.`,
        nodeIds: [orchId],
      })
    }
  }

  // 2. Isolated agents — no workspace, no parent
  const isolated = agentNodes.filter((n) => !n.workspaceId && !n.parentId)
  if (isolated.length > 0) {
    insights.push({
      id: 'isolated-agents',
      severity: 'warning',
      title: `${isolated.length} isolated agent(s)`,
      description: 'These agents have no workspace and no parent orchestrator.',
      nodeIds: isolated.map((n) => n.id),
    })
  }

  // 3. Model concentration — >70% agents on one model
  const modelCounts = new Map<string, number>()
  for (const node of agentNodes) {
    const model = (node.metadata as Record<string, unknown>).model as string | undefined
    if (model) modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1)
  }
  for (const [model, count] of modelCounts) {
    const pct = Math.round((count / agentNodes.length) * 100)
    if (pct > 70) {
      insights.push({
        id: `model-concentration-${model}`,
        severity: 'warning',
        title: `${pct}% of agents use ${model}`,
        description: `${count} of ${agentNodes.length} agents depend on this model.`,
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

  // 5. Unassigned entities
  const entityAgentLinks = await db.query.brainEntityAgents.findMany()
  const assignedIds = new Set(entityAgentLinks.map((l) => l.entityId))
  const unassigned = snapshot.nodes
    .filter((n) => n.type === 'entity')
    .filter((n) => !assignedIds.has(n.id.replace(/^entity-/, '')))
  if (unassigned.length > 0) {
    insights.push({
      id: 'unassigned-entities',
      severity: 'info',
      title: `${unassigned.length} entity/entities without agents`,
      description: 'These brain entities have no agents assigned.',
      nodeIds: unassigned.map((n) => n.id),
    })
  }

  return insights
}
