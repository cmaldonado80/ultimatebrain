/**
 * Observatory Merge — merges runtime overlay into positioned React Flow nodes.
 * Pure function. Never mutates input. Handles missing data gracefully.
 */
import type { Node } from '@xyflow/react'

import type { RuntimeOverlay } from '../../server/services/topology/schemas'

/**
 * Merge runtime overlay + highlighting into already-positioned React Flow nodes.
 * Does NOT change node positions — only patches data properties.
 */
export function mergeOverlayIntoFlowNodes(
  nodes: Node[],
  overlay: RuntimeOverlay | null,
  highlightedNodes: Set<string>,
): Node[] {
  let result = nodes

  if (overlay) {
    result = result.map((node) => {
      const rawId = node.id.replace(/^agent-/, '')
      const runtime = overlay.agentStatuses[rawId]
      if (!runtime) return node
      return { ...node, data: { ...node.data, status: runtime.status } }
    })
  }

  if (highlightedNodes.size > 0) {
    result = result.map((node) => ({
      ...node,
      data: { ...node.data, dimmed: !highlightedNodes.has(node.id) },
    }))
  }

  return result
}
