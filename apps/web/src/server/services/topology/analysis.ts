/**
 * Topology Analysis — blast radius computation and graph analytics.
 * Operates on canonical TopologySnapshot, no DB access needed.
 */
import type { BlastRadiusResult, TopologySnapshot } from './schemas'

/**
 * BFS-based blast radius computation. Given a snapshot and node ID,
 * determines affected nodes if the target fails. Max depth 3.
 */
export function computeBlastRadius(snapshot: TopologySnapshot, nodeId: string): BlastRadiusResult {
  const rawId = nodeId.replace(/^(agent|ws|model|entity)-/, '')
  const affected = new Set<string>()
  const queue: string[] = [rawId]
  let depth = 0

  // Build lookup maps from edges
  const childrenByOrch = new Map<string, string[]>()
  const agentsByWorkspace = new Map<string, string[]>()
  const workspaceByAgent = new Map<string, string>()
  const childrenByEntity = new Map<string, string[]>()
  const agentsByEntity = new Map<string, string[]>()

  for (const edge of snapshot.edges) {
    const src = edge.source.replace(/^(agent|ws|entity)-/, '')
    const tgt = edge.target.replace(/^(agent|ws|entity)-/, '')

    if (edge.type === 'supervises') {
      const arr = childrenByOrch.get(src) ?? []
      arr.push(tgt)
      childrenByOrch.set(src, arr)
    } else if (edge.type === 'belongs_to') {
      const agents = agentsByWorkspace.get(tgt) ?? []
      agents.push(src)
      agentsByWorkspace.set(tgt, agents)
      workspaceByAgent.set(src, tgt)
    } else if (edge.type === 'entity_child') {
      const arr = childrenByEntity.get(src) ?? []
      arr.push(tgt)
      childrenByEntity.set(src, arr)
    } else if (edge.type === 'entity_agent') {
      const arr = agentsByEntity.get(src) ?? []
      arr.push(tgt)
      agentsByEntity.set(src, arr)
    }
  }

  // BFS traversal
  while (queue.length > 0 && depth < 3) {
    const nextQueue: string[] = []
    for (const id of queue) {
      for (const childId of childrenByOrch.get(id) ?? []) {
        if (!affected.has(childId)) {
          affected.add(childId)
          nextQueue.push(childId)
        }
      }
      const wsId = workspaceByAgent.get(id)
      if (wsId) {
        for (const agentId of agentsByWorkspace.get(wsId) ?? []) {
          if (agentId !== id && !affected.has(agentId)) affected.add(agentId)
        }
      }
      for (const childId of childrenByEntity.get(id) ?? []) {
        if (!affected.has(childId)) {
          affected.add(childId)
          nextQueue.push(childId)
        }
      }
      for (const agentId of agentsByEntity.get(id) ?? []) {
        if (!affected.has(agentId)) affected.add(agentId)
      }
    }
    queue.length = 0
    queue.push(...nextQueue)
    depth++
  }

  const agentCount = snapshot.nodes.filter(
    (n) => n.type === 'agent' || n.type === 'orchestrator',
  ).length
  const entityCount = snapshot.nodes.filter((n) => n.type === 'entity').length

  return {
    nodeId,
    affectedNodes: [...affected],
    affectedCount: affected.size,
    totalNodes: agentCount + entityCount,
    riskScore: Math.min(100, Math.round((affected.size / Math.max(agentCount, 1)) * 100)),
    depth,
  }
}
