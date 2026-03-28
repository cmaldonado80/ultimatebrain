'use client'

/**
 * Inspector Pro — tabbed detail panel for deep inspection of messages,
 * tools, agents, and edges in the chat thread.
 */

import { useState } from 'react'

import { MarkdownMessage } from './markdown-message'

// ── Selection Types ────────────────────────────────────────────────────

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

// ── Tabs ───────────────────────────────────────────────────────────────

type TabId = 'overview' | 'details' | 'metadata' | 'raw'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'details', label: 'Details' },
  { id: 'metadata', label: 'Meta' },
  { id: 'raw', label: 'Raw' },
]

// ── Component ──────────────────────────────────────────────────────────

interface InspectorPanelProps {
  selection: InspectorSelection
  onClose: () => void
}

export function InspectorPanel({ selection, onClose }: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  if (!selection) {
    return (
      <div className="w-80 border-l border-border bg-bg-surface p-4 flex flex-col items-center justify-center text-center">
        <div className="text-slate-600 text-sm">Click a message, tool, or agent to inspect</div>
      </div>
    )
  }

  const title =
    selection.type === 'message'
      ? 'Message'
      : selection.type === 'tool'
        ? 'Tool Call'
        : 'Agent Profile'

  return (
    <div className="w-80 border-l border-border bg-bg-surface flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-dim">
        <h3 className="text-xs font-orbitron text-neon-teal uppercase tracking-wider">{title}</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-sm">
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-border-dim">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-[10px] px-2 py-1 rounded transition-colors ${
              activeTab === tab.id
                ? 'bg-neon-teal/10 text-neon-teal ring-1 ring-neon-teal/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
        {activeTab === 'overview' && <OverviewTab selection={selection} />}
        {activeTab === 'details' && <DetailsTab selection={selection} />}
        {activeTab === 'metadata' && <MetadataTab selection={selection} />}
        {activeTab === 'raw' && <RawTab selection={selection} />}
      </div>
    </div>
  )
}

// ── Tab Components ─────────────────────────────────────────────────────

function OverviewTab({ selection }: { selection: NonNullable<InspectorSelection> }) {
  return (
    <>
      {selection.type === 'message' && (
        <div className="space-y-2">
          <InfoRow label="Role" value={selection.role} />
          {selection.agentName && <InfoRow label="Agent" value={selection.agentName} />}
          {selection.model && <InfoRow label="Model" value={selection.model} />}
          {selection.timestamp && (
            <InfoRow label="Time" value={new Date(selection.timestamp).toLocaleString()} />
          )}
          <div className="mt-2 text-slate-400 line-clamp-4">{selection.text.slice(0, 200)}...</div>
        </div>
      )}
      {selection.type === 'tool' && (
        <div className="space-y-2">
          <InfoRow label="Tool" value={selection.name} />
          <InfoRow label="Status" value={selection.status} />
          {selection.result && (
            <InfoRow label="Result" value={`${selection.result.length} chars`} />
          )}
        </div>
      )}
      {selection.type === 'agent' && (
        <div className="space-y-2">
          <InfoRow label="Name" value={selection.name} />
          {selection.agentType && <InfoRow label="Type" value={selection.agentType} />}
          {selection.model && <InfoRow label="Model" value={selection.model} />}
          {selection.id && <InfoRow label="ID" value={selection.id.slice(0, 12) + '...'} />}
        </div>
      )}
    </>
  )
}

function DetailsTab({ selection }: { selection: NonNullable<InspectorSelection> }) {
  return (
    <>
      {selection.type === 'message' && (
        <div className="cyber-card p-3">
          <MarkdownMessage content={selection.text} />
        </div>
      )}
      {selection.type === 'tool' && (
        <>
          <div>
            <Label text="Input" />
            <pre className="cyber-card p-3 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
              {typeof selection.input === 'object'
                ? JSON.stringify(selection.input, null, 2)
                : String(selection.input)}
            </pre>
          </div>
          {selection.result && (
            <div>
              <Label text="Output" />
              <pre className="cyber-card p-3 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
                {selection.result}
              </pre>
            </div>
          )}
        </>
      )}
      {selection.type === 'agent' && selection.soul && (
        <div>
          <Label text="System Prompt" />
          <div className="cyber-card p-3 text-[11px] text-slate-400 max-h-80 overflow-y-auto whitespace-pre-wrap">
            {selection.soul}
          </div>
        </div>
      )}
    </>
  )
}

function MetadataTab({ selection }: { selection: NonNullable<InspectorSelection> }) {
  return (
    <div className="space-y-2">
      <Label text="Type" />
      <div className="cyber-badge text-[10px] inline-block">{selection.type}</div>

      {selection.type === 'message' && (
        <>
          <InfoRow label="Message ID" value={selection.id} mono />
          <InfoRow label="Role" value={selection.role} />
          {selection.agentName && <InfoRow label="Agent" value={selection.agentName} />}
          {selection.model && <InfoRow label="Model" value={selection.model} />}
          {selection.timestamp && (
            <InfoRow label="Timestamp" value={new Date(selection.timestamp).toISOString()} mono />
          )}
        </>
      )}
      {selection.type === 'tool' && (
        <>
          <InfoRow label="Tool Name" value={selection.name} mono />
          <InfoRow label="Status" value={selection.status} />
        </>
      )}
      {selection.type === 'agent' && (
        <>
          <InfoRow label="Agent ID" value={selection.id} mono />
          <InfoRow label="Name" value={selection.name} />
          {selection.agentType && <InfoRow label="Type" value={selection.agentType} />}
          {selection.model && <InfoRow label="Model" value={selection.model} mono />}
        </>
      )}
    </div>
  )
}

function RawTab({ selection }: { selection: NonNullable<InspectorSelection> }) {
  const raw = JSON.stringify(selection, null, 2)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label text="Raw Payload" />
        <button
          className="text-[9px] text-neon-blue hover:text-neon-blue/80 transition-colors"
          onClick={() => navigator.clipboard.writeText(raw)}
        >
          Copy JSON
        </button>
      </div>
      <pre className="cyber-card p-3 text-[10px] font-mono text-slate-400 overflow-x-auto whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
        {raw}
      </pre>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-slate-500 uppercase">{label}</span>
      <span className={`text-xs text-slate-300 ${mono ? 'font-mono' : ''} truncate max-w-[180px]`}>
        {value}
      </span>
    </div>
  )
}

function Label({ text }: { text: string }) {
  return <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">{text}</div>
}
