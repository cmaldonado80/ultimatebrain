'use client'

import '@xyflow/react/dist/style.css'

import { Background, Controls, type Edge, MiniMap, type Node, ReactFlow } from '@xyflow/react'
import { useCallback, useMemo, useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { nodeTypes } from '../../../components/observatory/custom-nodes'
import { trpc } from '../../../utils/trpc'

// ── Types ───────────────────────────────────────────────────────────────

type TopoNode = {
  id: string
  type: string
  label: string
  status?: string
  workspaceId?: string | null
  metadata: Record<string, unknown>
}
type TopoEdge = { id: string; type: string; source: string; target: string }

// ── Layout helper ───────────────────────────────────────────────────────

function buildGraph(nodes: TopoNode[], edges: TopoEdge[]) {
  const COL_W = 300,
    ROW_H = 80,
    WS_Y = 40
  const wsAgents = new Map<string, TopoNode[]>()
  const wsNodes = nodes.filter((n) => n.type === 'workspace')
  const modelNodes = nodes.filter((n) => n.type === 'model')

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
    children: TopoNode[],
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
        type: ag.type as 'agent' | 'orchestrator',
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
  if (unassigned.length)
    placeColumn('__unassigned', 'Unassigned', unassigned.length, 'virtual', unassigned)

  const maxAgents = Math.max(...[...wsAgents.values()].map((a) => a.length), 1)
  modelNodes.forEach((m, i) => {
    out.push({
      id: m.id,
      type: 'model',
      position: { x: i * 200 + 60, y: WS_Y + 80 + maxAgents * ROW_H + 60 },
      data: { label: m.label, ...m.metadata },
    })
  })

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

// ── Inspector ───────────────────────────────────────────────────────────

function TagList({ items, teal }: { items: string[]; teal?: boolean }) {
  const cls = teal
    ? 'bg-neon-teal/10 border-neon-teal/20 text-neon-teal'
    : 'bg-bg-card border-border text-slate-300'
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {items.map((s) => (
        <span key={s} className={`border rounded px-1.5 py-0.5 text-[10px] ${cls}`}>
          {s}
        </span>
      ))}
    </div>
  )
}

function Inspector({ node, onClose }: { node: TopoNode; onClose: () => void }) {
  const m = node.metadata as Record<string, string | number | string[] | null | undefined>
  return (
    <div className="w-80 border-l border-border bg-bg-deep overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-orbitron text-xs text-neon-teal tracking-wide uppercase">
          {node.type}
        </h2>
        <button onClick={onClose} className="text-slate-600 hover:text-slate-400 text-xs">
          &#x2715;
        </button>
      </div>
      <div className="space-y-2 text-xs">
        <div className="cyber-card p-3">
          <div className="text-slate-200 font-semibold mb-1">{node.label}</div>
          {node.status && <div className="text-slate-500">Status: {node.status}</div>}
        </div>
        {(node.type === 'agent' || node.type === 'orchestrator') && (
          <div className="cyber-card p-3 space-y-1">
            {m.model && (
              <div className="text-slate-400">
                Model: <span className="text-neon-teal">{String(m.model)}</span>
              </div>
            )}
            {m.agentType && <div className="text-slate-400">Type: {String(m.agentType)}</div>}
            {node.workspaceId && (
              <div className="text-slate-400">Workspace: {node.workspaceId}</div>
            )}
            {Array.isArray(m.skills) && m.skills.length > 0 && (
              <div>
                <span className="text-slate-500">Skills:</span>
                <TagList items={m.skills as string[]} />
              </div>
            )}
            {Array.isArray(m.tags) && m.tags.length > 0 && (
              <div>
                <span className="text-slate-500">Tags:</span>
                <TagList items={m.tags as string[]} teal />
              </div>
            )}
          </div>
        )}
        {node.type === 'workspace' && (
          <div className="cyber-card p-3 space-y-1">
            {m.type && <div className="text-slate-400">Type: {String(m.type)}</div>}
            <div className="text-slate-400">Agents: {Number(m.agentCount ?? 0)}</div>
          </div>
        )}
        {node.type === 'model' && (
          <div className="cyber-card p-3 space-y-1">
            {m.provider && <div className="text-slate-400">Provider: {String(m.provider)}</div>}
            {m.modelType && <div className="text-slate-400">Type: {String(m.modelType)}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────

export default function ObservatoryPage() {
  const { data, error, isLoading, refetch } = trpc.topology.getTopology.useQuery()
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(true)

  const { flowNodes, flowEdges } = useMemo(
    () => (data ? buildGraph(data.nodes, data.edges) : { flowNodes: [], flowEdges: [] }),
    [data],
  )
  const selectedData = useMemo(
    () => (selectedNode && data ? (data.nodes.find((n) => n.id === selectedNode) ?? null) : null),
    [selectedNode, data],
  )
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id)
    setInspectorOpen(true)
  }, [])

  if (error)
    return (
      <div className="p-6">
        <DbErrorBanner error={error} onRetry={() => refetch()} />
      </div>
    )

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-bg-deep/80">
        <h1 className="font-orbitron text-sm text-neon-teal tracking-wider">SWARM OBSERVATORY</h1>
        <div className="flex items-center gap-3 ml-auto text-[11px] text-slate-400">
          {data?.stats && (
            <>
              <span>{data.stats.workspaces} workspaces</span>
              <span className="text-slate-600">|</span>
              <span>{data.stats.agents} agents</span>
              <span className="text-slate-600">|</span>
              <span>{data.stats.orchestrators} orchestrators</span>
              <span className="text-slate-600">|</span>
              <span>{data.stats.models} models</span>
            </>
          )}
          <button
            onClick={() => setInspectorOpen((v) => !v)}
            className="cyber-btn-secondary cyber-btn-sm ml-2"
          >
            {inspectorOpen ? 'Hide' : 'Show'} Inspector
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              Loading topology...
            </div>
          ) : (
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              fitView
              minZoom={0.2}
              maxZoom={2}
              style={{ background: '#06090f' }}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#1e293b" gap={24} size={1} />
              <Controls className="!bg-bg-card !border-border !shadow-lg" />
              <MiniMap
                nodeColor={(n) =>
                  n.type === 'workspace'
                    ? '#00d4ff'
                    : n.type === 'orchestrator'
                      ? '#a855f7'
                      : '#475569'
                }
                maskColor="rgba(6,9,15,0.8)"
                className="!bg-bg-deep !border-border"
              />
            </ReactFlow>
          )}
        </div>
        {inspectorOpen && selectedData && (
          <Inspector node={selectedData} onClose={() => setSelectedNode(null)} />
        )}
      </div>
    </div>
  )
}
