/**
 * Graph View Model — framework-agnostic types for the projected graph.
 * These types sit between canonical TopologySnapshot and React Flow types.
 */

export type GraphViewNodeKind = 'workspace' | 'agent' | 'orchestrator' | 'model' | 'entity'

export interface GraphViewNode {
  id: string
  kind: GraphViewNodeKind
  label: string
  parentId?: string | null
  status?: string
  workspaceId?: string | null
  metadata: Record<string, unknown>
}

export interface GraphViewEdge {
  id: string
  source: string
  target: string
  kind: string
  label?: string
  active?: boolean
}

export interface GraphViewModel {
  nodes: GraphViewNode[]
  edges: GraphViewEdge[]
}
