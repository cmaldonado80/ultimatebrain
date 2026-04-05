'use client'

import '@xyflow/react/dist/style.css'

import {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  type NodeTypes,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import { type DragEvent, useCallback, useMemo, useRef, useState } from 'react'

import { BlockPalette } from './block-palette'
import { NodeInspector } from './node-inspector'
import { WorkflowBlockNode } from './nodes/workflow-block-node'
import { BLOCK_CATALOG, type BlockConfig, type BlockType, type WorkflowDefinition } from './types'

const NODE_TYPES: NodeTypes = {
  workflowBlock: WorkflowBlockNode,
}

interface WorkflowCanvasProps {
  initialWorkflow?: WorkflowDefinition
  onSave?: (workflow: WorkflowDefinition) => void
  workflowName: string
  onNameChange: (name: string) => void
}

export function WorkflowCanvas({
  initialWorkflow,
  onSave,
  workflowName,
  onNameChange,
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)

  const initialNodes: Node[] = (initialWorkflow?.blocks ?? []).map((b) => ({
    id: b.id,
    type: 'workflowBlock',
    position: b.position,
    data: { blockType: b.type, label: b.label, config: b.config },
  }))

  const initialEdges: Edge[] = (initialWorkflow?.edges ?? []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    animated: true,
    style: { stroke: 'rgba(0, 212, 255, 0.4)', strokeWidth: 2 },
  }))

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId],
  )

  // Connect nodes
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: 'rgba(0, 212, 255, 0.4)', strokeWidth: 2 },
          },
          eds,
        ),
      )
    },
    [setEdges],
  )

  // Select node
  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNodeId(node.id)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  // Drop block from palette
  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const blockType = e.dataTransfer.getData('application/workflow-block') as BlockType
      if (!blockType) return

      const meta = BLOCK_CATALOG.find((b) => b.type === blockType)
      if (!meta) return

      const bounds = reactFlowWrapper.current?.getBoundingClientRect()
      if (!bounds) return

      const position = {
        x: e.clientX - bounds.left - 90,
        y: e.clientY - bounds.top - 30,
      }

      const newNode: Node = {
        id: `${blockType}-${crypto.randomUUID().slice(0, 8)}`,
        type: 'workflowBlock',
        position,
        data: {
          blockType,
          label: meta.label,
          config: { ...meta.defaultConfig },
        },
      }

      setNodes((nds) => [...nds, newNode])
    },
    [setNodes],
  )

  // Update node from inspector
  const onUpdateNode = useCallback(
    (nodeId: string, label: string, config: BlockConfig) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label, config } } : n)),
      )
    },
    [setNodes],
  )

  // Delete node
  const onDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId))
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
      setSelectedNodeId(null)
    },
    [setNodes, setEdges],
  )

  // Save workflow
  const handleSave = useCallback(() => {
    const workflow: WorkflowDefinition = {
      name: workflowName,
      blocks: nodes.map((n) => ({
        id: n.id,
        type: (n.data as { blockType: BlockType }).blockType,
        label: (n.data as { label: string }).label,
        config: (n.data as { config: BlockConfig }).config,
        position: n.position,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
      })),
      version: 1,
    }
    onSave?.(workflow)
  }, [nodes, edges, workflowName, onSave])

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left: Block Palette */}
      <BlockPalette />

      {/* Center: Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-surface">
          <input
            className="cyber-input cyber-input-sm flex-1 max-w-[300px]"
            placeholder="Workflow name..."
            value={workflowName}
            onChange={(e) => onNameChange(e.target.value)}
          />
          <div className="flex-1" />
          <span className="text-[10px] text-slate-600">
            {nodes.length} blocks &middot; {edges.length} connections
          </span>
          <button onClick={handleSave} className="cyber-btn-primary cyber-btn-sm">
            Save Workflow
          </button>
        </div>

        {/* React Flow Canvas */}
        <div ref={reactFlowWrapper} className="flex-1" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={NODE_TYPES}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: 'rgba(0, 212, 255, 0.4)', strokeWidth: 2 },
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="rgba(255,255,255,0.03)" gap={16} />
            <Controls className="!bg-bg-surface !border-border !rounded-lg [&>button]:!bg-bg-elevated [&>button]:!border-border [&>button]:!text-slate-400 [&>button:hover]:!bg-white/10" />
            <MiniMap
              className="!bg-bg-surface !border-border !rounded-lg"
              nodeColor={() => 'rgba(0, 212, 255, 0.3)'}
              maskColor="rgba(6, 9, 15, 0.8)"
            />
          </ReactFlow>
        </div>
      </div>

      {/* Right: Node Inspector */}
      {selectedNode && (
        <NodeInspector
          nodeId={selectedNode.id}
          blockType={(selectedNode.data as { blockType: BlockType }).blockType}
          label={(selectedNode.data as { label: string }).label}
          config={(selectedNode.data as { config: BlockConfig }).config}
          onUpdate={onUpdateNode}
          onDelete={onDeleteNode}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  )
}
