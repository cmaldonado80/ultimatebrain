'use client'

/**
 * Inspector Pro — tabbed detail panel for deep inspection of messages,
 * tools, agents, and runs in the chat thread.
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
  | { type: 'tool'; name: string; input: unknown; result?: string; status: string; stepId?: string }
  | { type: 'agent'; id: string; name: string; model?: string; agentType?: string; soul?: string }
  | {
      type: 'run'
      runId: string
      status: string
      agentNames: string[]
      stepCount: number
      durationMs: number | null
      startedAt: Date
      memoryCount: number
      retryOfRunId?: string | null
      retryType?: string | null
      retryScope?: string | null
      retryTargetId?: string | null
      retryReason?: string | null
      workflowId?: string | null
      workflowName?: string | null
      autonomyLevel?: string | null
      autoActionsCount?: number | null
      recommendationSource?: string | null
      qualityScore?: number | null
      qualityLabel?: string | null
    }
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
  onCompareWithParent?: () => void
  onNavigateToRun?: (runId: string) => void
  onRetryStep?: (stepId: string) => void
}

export function InspectorPanel({
  selection,
  onClose,
  onCompareWithParent,
  onNavigateToRun,
  onRetryStep,
}: InspectorPanelProps) {
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
        : selection.type === 'run'
          ? 'Run Details'
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

      {/* Compare with parent shortcut (runs only) */}
      {selection.type === 'run' && selection.retryOfRunId && (
        <div className="px-4 py-2 border-b border-border-dim">
          <button
            onClick={() => onCompareWithParent?.()}
            className="cyber-btn-sm cyber-btn-secondary text-[10px] w-full"
          >
            ⇄ Compare with parent run
          </button>
        </div>
      )}

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
        {activeTab === 'overview' && (
          <OverviewTab
            selection={selection}
            onNavigateToRun={onNavigateToRun}
            onRetryStep={onRetryStep}
          />
        )}
        {activeTab === 'details' && <DetailsTab selection={selection} />}
        {activeTab === 'metadata' && <MetadataTab selection={selection} />}
        {activeTab === 'raw' && <RawTab selection={selection} />}
      </div>
    </div>
  )
}

// ── Tab Components ─────────────────────────────────────────────────────

function OverviewTab({
  selection,
  onNavigateToRun,
  onRetryStep,
}: {
  selection: NonNullable<InspectorSelection>
  onNavigateToRun?: (runId: string) => void
  onRetryStep?: (stepId: string) => void
}) {
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
          {selection.stepId && (
            <InfoRow label="Step ID" value={selection.stepId.slice(0, 12) + '...'} mono />
          )}
          {selection.result && (
            <InfoRow label="Result" value={`${selection.result.length} chars`} />
          )}
          {onRetryStep && selection.stepId && selection.status !== 'running' && (
            <button
              className="w-full mt-2 text-[10px] text-slate-500 hover:text-neon-yellow border border-border-dim hover:border-neon-yellow/30 px-3 py-1.5 rounded transition-colors"
              onClick={() => onRetryStep(selection.stepId!)}
            >
              ↻ Retry This Step
            </button>
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
      {selection.type === 'run' && (
        <div className="space-y-3">
          {/* Core stats */}
          <div className="space-y-2">
            <InfoRow label="Status" value={selection.status} />
            <InfoRow label="Steps" value={String(selection.stepCount)} />
            <InfoRow
              label="Duration"
              value={selection.durationMs ? `${selection.durationMs}ms` : 'N/A'}
            />
            <InfoRow label="Memories" value={String(selection.memoryCount)} />
          </div>

          {/* Agents */}
          {selection.agentNames.length > 0 && (
            <div>
              <Label text="Agents" />
              <div className="flex flex-wrap gap-1 mt-1">
                {selection.agentNames.map((name) => (
                  <span key={name} className="cyber-badge text-[10px]">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recommendation source */}
          {selection.recommendationSource && (
            <div className="cyber-card p-2.5 space-y-1">
              <Label text="Triggered By" />
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-neon-purple">◆</span>
                <span className="text-slate-300">
                  {selection.recommendationSource} recommendation
                </span>
              </div>
            </div>
          )}

          {/* Lineage section */}
          {selection.retryOfRunId && (
            <div className="cyber-card p-2.5 space-y-1.5">
              <Label text="Lineage" />
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-neon-yellow">
                  {selection.retryType === 'auto'
                    ? '⟳'
                    : selection.retryType === 'suggested'
                      ? '↺'
                      : '↻'}
                </span>
                <span className="text-slate-400">
                  {selection.retryType ?? 'manual'}{' '}
                  {selection.retryScope === 'group'
                    ? 'group retry'
                    : selection.retryScope === 'step'
                      ? 'step retry'
                      : 'retry'}{' '}
                  of
                </span>
                {onNavigateToRun ? (
                  <button
                    onClick={() => onNavigateToRun(selection.retryOfRunId!)}
                    className="text-neon-teal hover:underline font-mono"
                  >
                    {selection.retryOfRunId.slice(0, 8)}...
                  </button>
                ) : (
                  <span className="text-slate-300 font-mono">
                    {selection.retryOfRunId.slice(0, 8)}...
                  </span>
                )}
              </div>
              {selection.retryScope &&
                selection.retryScope !== 'run' &&
                selection.retryTargetId && (
                  <div className="text-[10px] text-slate-500 truncate">
                    Target:{' '}
                    <span className="font-mono text-slate-400">
                      {selection.retryTargetId.slice(0, 12)}...
                    </span>
                  </div>
                )}
              {selection.retryReason && (
                <div className="text-[10px] text-slate-500 truncate">
                  Reason: {selection.retryReason}
                </div>
              )}
            </div>
          )}

          {/* Workflow section */}
          {selection.workflowName && (
            <div className="cyber-card p-2.5 space-y-1">
              <Label text="Workflow" />
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-neon-blue">▶</span>
                <span className="text-slate-300">{selection.workflowName}</span>
              </div>
              {selection.workflowId && (
                <div className="text-[9px] text-slate-600 font-mono">
                  {selection.workflowId.slice(0, 12)}...
                </div>
              )}
            </div>
          )}

          {/* Autonomy section */}
          {selection.autonomyLevel && selection.autonomyLevel !== 'manual' && (
            <div className="cyber-card p-2.5 space-y-1">
              <Label text="Autonomy" />
              <div className="flex items-center gap-2 text-[10px]">
                <span
                  className={`px-1.5 py-0.5 rounded ${
                    selection.autonomyLevel === 'auto'
                      ? 'bg-neon-purple/10 text-neon-purple'
                      : 'bg-neon-blue/10 text-neon-blue'
                  }`}
                >
                  {selection.autonomyLevel}
                </span>
                {(selection.autoActionsCount ?? 0) > 0 && (
                  <span className="text-slate-500">
                    {selection.autoActionsCount} auto action
                    {selection.autoActionsCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Quality section */}
          {selection.qualityScore != null && (
            <div className="cyber-card p-2.5 space-y-1">
              <Label text="Quality" />
              <div className="flex items-center gap-2 text-[10px]">
                <span
                  className={`px-1.5 py-0.5 rounded ${
                    selection.qualityLabel === 'high'
                      ? 'bg-neon-green/10 text-neon-green'
                      : selection.qualityLabel === 'medium'
                        ? 'bg-neon-yellow/10 text-neon-yellow'
                        : 'bg-neon-red/10 text-neon-red'
                  }`}
                >
                  {selection.qualityLabel}
                </span>
                <span className="text-slate-400 font-mono">
                  {Math.round(selection.qualityScore * 100)}%
                </span>
              </div>
            </div>
          )}
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
      {selection.type === 'run' && (
        <div className="space-y-3">
          <Label text="Run Timeline" />
          <div className="text-[10px] text-slate-500">
            Started: {new Date(selection.startedAt).toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500">
            {selection.stepCount} steps across {selection.agentNames.length} agent(s)
          </div>
          {selection.memoryCount > 0 && (
            <div className="text-[10px] text-neon-purple">
              {selection.memoryCount} memories recalled
            </div>
          )}

          {/* Run context summary */}
          <div className="cyber-card p-2.5 space-y-1.5">
            <Label text="Run Context" />
            {selection.retryOfRunId && (
              <div className="text-[10px] text-neon-yellow">
                {selection.retryType ?? 'manual'}{' '}
                {selection.retryScope === 'group'
                  ? 'group retry'
                  : selection.retryScope === 'step'
                    ? 'step retry'
                    : 'retry'}
              </div>
            )}
            {selection.workflowName && (
              <div className="text-[10px] text-neon-blue">Workflow: {selection.workflowName}</div>
            )}
            <div className="text-[10px] text-slate-500">
              Autonomy: {selection.autonomyLevel ?? 'manual'}
            </div>
            {!selection.retryOfRunId && !selection.workflowName && (
              <div className="text-[10px] text-slate-600">Direct user invocation</div>
            )}
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
          {selection.stepId && <InfoRow label="Step ID" value={selection.stepId} mono />}
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
      {selection.type === 'run' && (
        <>
          <InfoRow label="Run ID" value={selection.runId} mono />
          <InfoRow label="Status" value={selection.status} />
          <InfoRow label="Started" value={new Date(selection.startedAt).toISOString()} mono />
          <InfoRow label="Steps" value={String(selection.stepCount)} />
          <InfoRow label="Memories" value={String(selection.memoryCount)} />
          {selection.durationMs !== null && (
            <InfoRow label="Duration" value={`${selection.durationMs}ms`} mono />
          )}
          <InfoRow label="Autonomy" value={selection.autonomyLevel ?? 'manual'} />
          {selection.retryOfRunId && (
            <InfoRow label="Retry Of" value={selection.retryOfRunId} mono />
          )}
          {selection.retryType && <InfoRow label="Retry Type" value={selection.retryType} />}
          {selection.retryScope && <InfoRow label="Retry Scope" value={selection.retryScope} />}
          {selection.retryTargetId && (
            <InfoRow label="Retry Target" value={selection.retryTargetId} mono />
          )}
          {selection.workflowId && (
            <InfoRow label="Workflow ID" value={selection.workflowId} mono />
          )}
          {selection.workflowName && <InfoRow label="Workflow" value={selection.workflowName} />}
          {(selection.autoActionsCount ?? 0) > 0 && (
            <InfoRow label="Auto Actions" value={String(selection.autoActionsCount)} />
          )}
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
