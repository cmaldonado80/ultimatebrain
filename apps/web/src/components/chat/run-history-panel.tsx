'use client'

import { useState } from 'react'

import { trpc } from '../../utils/trpc'
import type { InspectorSelection } from './inspector-panel'

// ── Types ─────────────────────────────────────────────────────────────

interface RunDiffItem {
  key: string
  a: string | number | null
  b: string | number | null
  changed: boolean
}

interface RunDiffSection {
  label: string
  items: RunDiffItem[]
}

// ── Status Colors ─────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-neon-green',
  running: 'bg-neon-blue animate-pulse',
  failed: 'bg-neon-red',
  retried: 'bg-neon-yellow',
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '--'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ── RunHistoryPanel ───────────────────────────────────────────────────

interface RunHistoryPanelProps {
  sessionId: string
  onSelectRun: (sel: InspectorSelection) => void
  onClose: () => void
}

export function RunHistoryPanel({ sessionId, onSelectRun, onClose }: RunHistoryPanelProps) {
  const [compareMode, setCompareMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [comparing, setComparing] = useState<{ idA: string; idB: string } | null>(null)

  const runsQuery = trpc.intelligence.sessionRuns.useQuery({ sessionId, limit: 20 })
  const runs = runsQuery.data ?? []

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return [prev[1]!, id]
      return [...prev, id]
    })
  }

  const handleClickRun = (run: (typeof runs)[number]) => {
    if (compareMode) {
      handleToggleSelect(run.id)
      return
    }
    const agentNames = run.agentIds ?? []
    onSelectRun({
      type: 'run',
      runId: run.id,
      status: run.status,
      agentNames,
      stepCount: run.stepCount ?? 0,
      durationMs: run.durationMs,
      startedAt: run.startedAt,
      memoryCount: run.memoryCount ?? 0,
      retryOfRunId: run.retryOfRunId,
    })
  }

  if (comparing) {
    return (
      <RunComparisonView
        idA={comparing.idA}
        idB={comparing.idB}
        onBack={() => setComparing(null)}
        onClose={onClose}
      />
    )
  }

  return (
    <div className="w-80 border-l border-border bg-bg-surface flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-dim">
        <h3 className="text-xs font-orbitron text-neon-teal uppercase tracking-wider">
          Run History
        </h3>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-sm">
          ✕
        </button>
      </div>

      {/* Compare toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-dim">
        <button
          onClick={() => {
            setCompareMode(!compareMode)
            setSelectedIds([])
          }}
          className={`text-[10px] px-2 py-1 rounded transition-colors ${
            compareMode
              ? 'bg-neon-teal/10 text-neon-teal ring-1 ring-neon-teal/30'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
          }`}
        >
          {compareMode ? 'Cancel Compare' : 'Compare Mode'}
        </button>
        {compareMode && selectedIds.length === 2 && (
          <button
            onClick={() => setComparing({ idA: selectedIds[0]!, idB: selectedIds[1]! })}
            className="cyber-btn-primary text-[10px] px-2 py-1"
          >
            Compare ({selectedIds.length})
          </button>
        )}
      </div>

      {/* Run list */}
      <div className="flex-1 overflow-y-auto">
        {runs.length === 0 && (
          <div className="p-4 text-center text-slate-600 text-xs">No runs yet</div>
        )}
        {runs.map((run, idx) => {
          const isSelected = selectedIds.includes(run.id)
          return (
            <button
              key={run.id}
              onClick={() => handleClickRun(run)}
              className={`w-full text-left px-4 py-3 border-b border-border-dim transition-colors hover:bg-white/5 ${
                isSelected ? 'bg-neon-teal/5 ring-1 ring-inset ring-neon-teal/20' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {compareMode && (
                  <div
                    className={`w-3 h-3 rounded border ${
                      isSelected ? 'bg-neon-teal border-neon-teal' : 'border-slate-600'
                    }`}
                  />
                )}
                <div
                  className={`w-2 h-2 rounded-full ${STATUS_DOT[run.status] ?? 'bg-slate-500'}`}
                />
                <span className="text-xs text-slate-300">Run #{runs.length - idx}</span>
                <span className="text-[10px] text-slate-500 ml-auto">{run.status}</span>
              </div>
              <div className="text-[10px] text-slate-500 flex gap-3 ml-4">
                <span>{(run.agentIds ?? []).length} agents</span>
                <span>{run.stepCount ?? 0} steps</span>
                <span>{formatDuration(run.durationMs)}</span>
                {(run.memoryCount ?? 0) > 0 && <span>{run.memoryCount} mem</span>}
              </div>
              {run.retryOfRunId && (
                <div className="text-[10px] text-neon-yellow ml-4 mt-1">↻ retry of earlier run</div>
              )}
              <div className="text-[9px] text-slate-600 ml-4 mt-1">
                {new Date(run.startedAt).toLocaleString()}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── RunComparisonView ─────────────────────────────────────────────────

interface RunComparisonViewProps {
  idA: string
  idB: string
  onBack: () => void
  onClose: () => void
}

function RunComparisonView({ idA, idB, onBack, onClose }: RunComparisonViewProps) {
  const comparisonQuery = trpc.intelligence.compareRuns.useQuery({ runIdA: idA, runIdB: idB })
  const data = comparisonQuery.data

  return (
    <div className="w-80 border-l border-border bg-bg-surface flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-dim">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-slate-500 hover:text-slate-300 text-sm">
            ←
          </button>
          <h3 className="text-xs font-orbitron text-neon-teal uppercase tracking-wider">
            Comparison
          </h3>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-sm">
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {comparisonQuery.isLoading && (
          <div className="text-center text-slate-500 text-xs py-8">Loading comparison...</div>
        )}
        {comparisonQuery.error && (
          <div className="text-center text-neon-red text-xs py-4">
            {comparisonQuery.error.message}
          </div>
        )}
        {data && (
          <>
            {/* Run IDs header */}
            <div className="flex justify-between text-[10px] text-slate-500">
              <div>
                <span className="text-slate-400">A:</span> {data.runA.id.slice(0, 8)}...
                <span
                  className={`ml-1 ${data.runA.status === 'completed' ? 'text-neon-green' : 'text-neon-red'}`}
                >
                  {data.runA.status}
                </span>
              </div>
              <div>
                <span className="text-slate-400">B:</span> {data.runB.id.slice(0, 8)}...
                <span
                  className={`ml-1 ${data.runB.status === 'completed' ? 'text-neon-green' : 'text-neon-red'}`}
                >
                  {data.runB.status}
                </span>
              </div>
            </div>

            {/* Diff sections */}
            {data.sections.map((section: RunDiffSection) => (
              <div key={section.label} className="cyber-card p-3">
                <div className="text-[10px] font-orbitron text-slate-400 uppercase tracking-wider mb-2">
                  {section.label}
                </div>
                <div className="space-y-1.5">
                  {section.items.map((item: RunDiffItem) => (
                    <div key={item.key} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">{item.key}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={item.changed ? 'text-slate-400' : 'text-slate-500'}>
                          {item.a ?? '--'}
                        </span>
                        <span className="text-slate-600">→</span>
                        <span className={item.changed ? 'text-neon-yellow' : 'text-slate-500'}>
                          {item.b ?? '--'}
                        </span>
                        {item.changed &&
                          typeof item.a === 'number' &&
                          typeof item.b === 'number' && (
                            <span className={item.b > item.a ? 'text-neon-green' : 'text-neon-red'}>
                              {item.b > item.a ? '↑' : '↓'}
                            </span>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
