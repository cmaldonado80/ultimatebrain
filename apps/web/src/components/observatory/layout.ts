/**
 * Observatory Layout — projects canonical topology into React Flow positions.
 * Separated from the page component for testability and future ELK support.
 */
import type { Edge, Node } from '@xyflow/react'

import type { TopologyEdge, TopologyNode } from '../../server/services/topology/schemas'

interface LayoutOptions {
  strategy?: 'grid' | 'elk'
  columnWidth?: number
  rowHeight?: number
  collapsed?: Set<string>
}

/**
 * Convert canonical topology nodes/edges into positioned React Flow nodes/edges.
 * Currently uses a grid strategy — workspaces as columns, agents stacked inside.
 */
export function layoutTopology(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  options: LayoutOptions = {},
): { flowNodes: Node[]; flowEdges: Edge[] } {
  const COL_W = options.columnWidth ?? 300
  const ROW_H = options.rowHeight ?? 80
  const WS_Y = 40

  const wsNodes = nodes.filter((n) => n.type === 'workspace')
  const modelNodes = nodes.filter((n) => n.type === 'model')
  const wsAgents = new Map<string, TopologyNode[]>()

  for (const n of nodes) {
    if (n.type === 'agent' || n.type === 'orchestrator') {
      const key = n.workspaceId ? `ws-${n.workspaceId}` : '__unassigned'
      if (!wsAgents.has(key)) wsAgents.set(key, [])
      wsAgents.get(key)!.push(n)
    }
  }

  const out: Node[] = []
  let col = 0

  const placeColumn = (
    wsId: string,
    label: string,
    agentCount: number,
    wsType: string,
    children: TopologyNode[],
  ) => {
    const x = col * COL_W + 40
    out.push({
      id: wsId,
      type: 'workspace',
      position: { x, y: WS_Y },
      data: { label, agentCount, wsType },
    })
    children.sort(
      (a, b) => (a.type === 'orchestrator' ? -1 : 1) - (b.type === 'orchestrator' ? -1 : 1),
    )
    children.forEach((ag, i) => {
      out.push({
        id: ag.id,
        type: ag.type as string,
        position: { x: x + 20, y: WS_Y + 80 + i * ROW_H },
        data: { label: ag.label, status: ag.status, model: ag.metadata.model, ...ag.metadata },
      })
    })
    col++
  }

  for (const ws of wsNodes) {
    placeColumn(
      ws.id,
      ws.label,
      (ws.metadata.agentCount as number) ?? 0,
      ws.metadata.type as string,
      wsAgents.get(ws.id) ?? [],
    )
  }

  const unassigned = wsAgents.get('__unassigned') ?? []
  if (unassigned.length) {
    placeColumn('__unassigned', 'Unassigned', unassigned.length, 'virtual', unassigned)
  }

  // Model nodes at bottom
  const maxAgents = Math.max(...[...wsAgents.values()].map((a) => a.length), 1)
  modelNodes.forEach((m, i) => {
    out.push({
      id: m.id,
      type: 'model',
      position: { x: i * 200 + 60, y: WS_Y + 80 + maxAgents * ROW_H + 60 },
      data: { label: m.label, ...m.metadata },
    })
  })

  // Convert edges
  const flowEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'default',
    style: { stroke: e.type === 'supervises' ? '#00d4ff' : '#1e293b', strokeWidth: 1 },
    animated: e.type === 'supervises',
  }))

  return { flowNodes: out, flowEdges }
}
