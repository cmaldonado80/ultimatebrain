/**
 * Topology Projector — converts canonical topology into GraphViewModel.
 * Pure functions. No DB access. No React Flow types.
 */
import type { RuntimeOverlay, TopologySnapshot } from './schemas'
import type { GraphViewEdge, GraphViewModel, GraphViewNode } from './view-model'

/**
 * Project canonical topology snapshot into a framework-agnostic GraphViewModel.
 */
export function projectSnapshot(snapshot: TopologySnapshot): GraphViewModel {
  const nodes: GraphViewNode[] = snapshot.nodes.map((n) => ({
    id: n.id,
    kind: n.type as GraphViewNode['kind'],
    label: n.label,
    parentId: n.parentId,
    status: n.status,
    workspaceId: n.workspaceId,
    metadata: n.metadata,
  }))

  const edges: GraphViewEdge[] = snapshot.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    kind: e.type,
    label: e.label,
    active: e.type === 'supervises',
  }))

  return { nodes, edges }
}

/**
 * Merge runtime overlay into GraphViewModel without mutating the original.
 * Missing overlay entries are left unchanged (graceful degradation).
 */
export function mergeOverlay(
  graph: GraphViewModel,
  overlay: RuntimeOverlay | null,
): GraphViewModel {
  if (!overlay) return graph

  const nodes = graph.nodes.map((node) => {
    const rawId = node.id.replace(/^agent-/, '')
    const runtime = overlay.agentStatuses[rawId]
    if (!runtime) return node
    return { ...node, status: runtime.status }
  })

  return { nodes, edges: graph.edges }
}
