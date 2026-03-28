'use client'

/**
 * Inspector Panel — right-side contextual details for selected message, tool, or agent.
 */

import { MarkdownMessage } from './markdown-message'

export type InspectorSelection =
  | {
      type: 'message'
      id: string
      role: string
      text: string
      agentName?: string
      model?: string
      timestamp?: Date
    }
  | { type: 'tool'; name: string; input: unknown; result?: string; status: string }
  | { type: 'agent'; id: string; name: string; model?: string; agentType?: string; soul?: string }
  | null

interface InspectorPanelProps {
  selection: InspectorSelection
  onClose: () => void
}

export function InspectorPanel({ selection, onClose }: InspectorPanelProps) {
  if (!selection) {
    return (
      <div className="w-80 border-l border-border bg-bg-surface p-4 flex flex-col items-center justify-center text-center">
        <div className="text-slate-600 text-sm">
          Click a message, tool call, or agent to inspect
        </div>
      </div>
    )
  }

  return (
    <div className="w-80 border-l border-border bg-bg-surface flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-dim">
        <h3 className="text-xs font-orbitron text-slate-300 uppercase tracking-wider">
          {selection.type === 'message'
            ? 'Message Details'
            : selection.type === 'tool'
              ? 'Tool Call'
              : 'Agent Profile'}
        </h3>
        <button
          className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {selection.type === 'message' && (
          <MessageInspector
            role={selection.role}
            text={selection.text}
            agentName={selection.agentName}
            model={selection.model}
            timestamp={selection.timestamp}
          />
        )}
        {selection.type === 'tool' && (
          <ToolInspector
            name={selection.name}
            input={selection.input}
            result={selection.result}
            status={selection.status}
          />
        )}
        {selection.type === 'agent' && (
          <AgentInspector
            name={selection.name}
            model={selection.model}
            agentType={selection.type}
            soul={selection.soul}
          />
        )}
      </div>
    </div>
  )
}

function MessageInspector({
  role,
  text,
  agentName,
  model,
  timestamp,
}: {
  role: string
  text: string
  agentName?: string
  model?: string
  timestamp?: Date
}) {
  return (
    <>
      <div className="space-y-2">
        <InfoRow label="Role" value={role} />
        {agentName && <InfoRow label="Agent" value={agentName} />}
        {model && <InfoRow label="Model" value={model} />}
        {timestamp && <InfoRow label="Time" value={new Date(timestamp).toLocaleString()} />}
      </div>
      <div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Content</div>
        <div className="cyber-card p-3 text-xs">
          <MarkdownMessage content={text} />
        </div>
      </div>
    </>
  )
}

function ToolInspector({
  name,
  input,
  result,
  status,
}: {
  name: string
  input: unknown
  result?: string
  status: string
}) {
  return (
    <>
      <div className="space-y-2">
        <InfoRow label="Tool" value={name} />
        <InfoRow label="Status" value={status} />
      </div>
      <div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Input</div>
        <pre className="cyber-card p-3 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all">
          {typeof input === 'object' ? JSON.stringify(input, null, 2) : String(input)}
        </pre>
      </div>
      {result && (
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Result</div>
          <pre className="cyber-card p-3 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all">
            {result}
          </pre>
        </div>
      )}
    </>
  )
}

function AgentInspector({
  name,
  model,
  agentType,
  soul,
}: {
  name: string
  model?: string
  agentType?: string
  soul?: string
}) {
  return (
    <>
      <div className="space-y-2">
        <InfoRow label="Name" value={name} />
        {agentType && <InfoRow label="Type" value={agentType} />}
        {model && <InfoRow label="Model" value={model} />}
      </div>
      {soul && (
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
            System Prompt
          </div>
          <div className="cyber-card p-3 text-xs text-slate-400 max-h-60 overflow-y-auto">
            {soul.slice(0, 500)}
            {soul.length > 500 && <span className="text-slate-600">...</span>}
          </div>
        </div>
      )}
    </>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-slate-500 uppercase">{label}</span>
      <span className="text-xs text-slate-300 font-mono">{value}</span>
    </div>
  )
}
