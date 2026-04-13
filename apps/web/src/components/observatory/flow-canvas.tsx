'use client'

import '@xyflow/react/dist/style.css'

import type { Edge } from '@xyflow/react'
import { Background, Controls, MiniMap, type Node, ReactFlow } from '@xyflow/react'

import { NODE_COLORS } from './constants'
import { nodeTypes } from './custom-nodes'

interface FlowCanvasProps {
  nodes: Node[]
  edges: Edge[]
  onNodeClick: (event: React.MouseEvent, node: Node) => void
  onEdgeClick: (event: React.MouseEvent, edge: { id: string }) => void
  onPaneClick: () => void
}

export default function FlowCanvas({
  nodes,
  edges,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
}: FlowCanvasProps) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onPaneClick={onPaneClick}
      fitView
      minZoom={0.2}
      maxZoom={2}
      style={{ background: '#06090f' }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#1e293b" gap={24} size={1} />
      <Controls className="!bg-bg-card !border-border !shadow-lg" />
      <MiniMap
        nodeColor={(n) => NODE_COLORS[n.type ?? ''] ?? '#475569'}
        maskColor="rgba(6,9,15,0.8)"
        className="!bg-bg-deep !border-border"
      />
    </ReactFlow>
  )
}
