'use client'

import { Handle, type NodeProps, Position } from '@xyflow/react'

// ── Workspace Node ──────────────────────────────────────────────────────

function WorkspaceNode({ data }: NodeProps) {
  return (
    <div className="cyber-card p-3 min-w-[220px]">
      <Handle type="target" position={Position.Top} className="!bg-neon-teal !w-2 !h-2" />
      <div className="text-xs font-orbitron text-neon-teal mb-1">{data.label as string}</div>
      <div className="text-[10px] text-slate-500">{(data.agentCount as number) ?? 0} agents</div>
      <div className="text-[10px] text-slate-600 mt-0.5">{data.wsType as string}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-neon-teal !w-2 !h-2" />
    </div>
  )
}

// ── Agent Node ──────────────────────────────────────────────────────────

function AgentNode({ data }: NodeProps) {
  const status = data.status as string
  const dotColor =
    status === 'executing'
      ? 'neon-dot-green animate-pulse'
      : status === 'error'
        ? 'neon-dot-red'
        : status === 'offline'
          ? 'neon-dot-gray'
          : 'neon-dot-blue'

  return (
    <div className="bg-bg-card border border-border rounded-lg p-2 min-w-[160px]">
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-1.5 !h-1.5" />
      <div className="flex items-center gap-1.5">
        <span className={`neon-dot ${dotColor}`} />
        <span className="text-xs text-slate-200 truncate">{data.label as string}</span>
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5">
        {(data.model as string) ?? 'no model'}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-1.5 !h-1.5" />
    </div>
  )
}

// ── Orchestrator Node ───────────────────────────────────────────────────

function OrchestratorNode({ data }: NodeProps) {
  const status = data.status as string
  const dotColor =
    status === 'executing'
      ? 'neon-dot-green animate-pulse'
      : status === 'error'
        ? 'neon-dot-red'
        : 'neon-dot-purple'

  return (
    <div className="bg-bg-card border border-neon-purple/40 rounded-lg p-2 min-w-[180px] shadow-[0_0_8px_rgba(168,85,247,0.15)]">
      <Handle type="target" position={Position.Top} className="!bg-neon-purple !w-2 !h-2" />
      <div className="flex items-center gap-1.5">
        <span className={`neon-dot ${dotColor}`} />
        <span className="text-xs text-slate-200 font-semibold truncate">
          ★ {data.label as string}
        </span>
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5">
        {(data.model as string) ?? 'no model'}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-neon-purple !w-2 !h-2" />
    </div>
  )
}

// ── Model Node ──────────────────────────────────────────────────────────

function ModelNode({ data }: NodeProps) {
  return (
    <div className="bg-bg-deep border border-neon-teal/30 rounded-full px-3 py-1 text-center shadow-[0_0_6px_rgba(0,212,255,0.1)]">
      <Handle type="target" position={Position.Top} className="!bg-neon-teal !w-1.5 !h-1.5" />
      <span className="text-[10px] text-neon-teal font-mono truncate">{data.label as string}</span>
    </div>
  )
}

// ── Export ───────────────────────────────────────────────────────────────

export const nodeTypes = {
  workspace: WorkspaceNode,
  agent: AgentNode,
  orchestrator: OrchestratorNode,
  model: ModelNode,
}
