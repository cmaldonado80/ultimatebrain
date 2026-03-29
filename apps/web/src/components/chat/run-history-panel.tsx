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

const AUTONOMY_STYLE: Record<string, string> = {
  manual: 'bg-slate-700/50 text-slate-400',
  assist: 'bg-neon-blue/10 text-neon-blue',
  auto: 'bg-neon-purple/10 text-neon-purple',
}

const RETRY_TYPE_ICON: Record<string, string> = {
  manual: '↻',
  auto: '⟳',
  suggested: '↺',
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '--'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ── Badge Components ──────────────────────────────────────────────────

function RetryLineageBadge({
  retryType,
  retryOfRunId,
  retryScope,
}: {
  retryType?: string | null
  retryOfRunId?: string | null
  retryScope?: string | null
}) {
  if (!retryOfRunId) return null
  const icon = RETRY_TYPE_ICON[retryType ?? 'manual'] ?? '↻'
  const scopeLabel =
    retryScope === 'group' ? 'group retry' : retryScope === 'step' ? 'step retry' : 'retry'
  const typePrefix = retryType === 'auto' ? 'auto-' : retryType === 'suggested' ? 'suggested ' : ''
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-neon-yellow bg-neon-yellow/10 px-1.5 py-0.5 rounded">
      {icon} {typePrefix}
      {scopeLabel}
    </span>
  )
}

function WorkflowBadge({ workflowName }: { workflowName?: string | null }) {
  if (!workflowName) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-neon-blue bg-neon-blue/10 px-1.5 py-0.5 rounded truncate max-w-[120px]">
      ▶ {workflowName}
    </span>
  )
}

function AutonomyBadge({ level }: { level?: string | null }) {
  if (!level || level === 'manual') return null
  return (
    <span
      className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded ${AUTONOMY_STYLE[level] ?? ''}`}
    >
      {level}
    </span>
  )
}

function QualityBadge({ label }: { label?: string | null }) {
  if (!label) return null
  const style =
    label === 'high'
      ? 'text-neon-green bg-neon-green/10'
      : label === 'medium'
        ? 'text-neon-yellow bg-neon-yellow/10'
        : 'text-neon-red bg-neon-red/10'
  return (
    <span className={`inline-flex items-center text-[9px] px-1.5 py-0.5 rounded ${style}`}>
      {label}
    </span>
  )
}

// ── Session Summary Card ──────────────────────────────────────────────

const TREND_STYLE: Record<string, { icon: string; cls: string }> = {
  improving: { icon: '↑', cls: 'text-neon-green' },
  declining: { icon: '↓', cls: 'text-neon-red' },
  stable: { icon: '→', cls: 'text-slate-400' },
}

const BEST_RUN_ICONS: Record<string, { icon: string; label: string }> = {
  bestQuality: { icon: '◆', label: 'quality' },
  fastest: { icon: '⚡', label: 'fastest' },
  mostStable: { icon: '◈', label: 'stable' },
  simplest: { icon: '▸', label: 'simple' },
}

function SessionSummaryCard({
  sessionId,
  onSelectRun,
}: {
  sessionId: string
  onSelectRun: (sel: InspectorSelection) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const query = trpc.intelligence.getSessionSummary.useQuery(
    { sessionId },
    { staleTime: 30_000, refetchOnWindowFocus: false },
  )
  const data = query.data

  if (!data || data.totalRuns < 2) return null

  const trendInfo = data.trend ? TREND_STYLE[data.trend] : null

  const handleClickRun = (runId: string) => {
    onSelectRun({
      type: 'run',
      runId,
      status: 'unknown',
      agentNames: [],
      stepCount: 0,
      durationMs: null,
      startedAt: new Date(),
      memoryCount: 0,
    })
  }

  return (
    <div className="border-b border-border-dim">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-[10px] font-orbitron text-neon-teal uppercase tracking-wider">
          Session Summary
        </span>
        <span className="text-[10px] text-slate-600">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-3 space-y-2">
          {/* Overview line */}
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <span>{data.totalRuns} runs</span>
            <span>·</span>
            <span>{Math.round(data.successRate * 100)}% success</span>
            {trendInfo && (
              <>
                <span>·</span>
                <span className={trendInfo.cls}>
                  {trendInfo.icon} {data.trend}
                </span>
              </>
            )}
          </div>

          {/* Quality bar */}
          {data.avgQualityScore != null && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-500 w-16 flex-shrink-0">Avg quality</span>
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-neon-teal/60 rounded-full"
                  style={{ width: `${Math.round(data.avgQualityScore * 100)}%` }}
                />
              </div>
              <span className="text-[9px] font-mono text-slate-400 w-8 text-right">
                {Math.round(data.avgQualityScore * 100)}%
              </span>
            </div>
          )}

          {/* Best runs */}
          {(data.bestRuns.bestQuality ||
            data.bestRuns.fastest ||
            data.bestRuns.mostStable ||
            data.bestRuns.simplest) && (
            <div className="space-y-1">
              <div className="text-[9px] text-slate-600 uppercase">Best runs</div>
              {(
                Object.entries(data.bestRuns) as [keyof typeof BEST_RUN_ICONS, string | null][]
              ).map(
                ([key, runId]) =>
                  runId &&
                  BEST_RUN_ICONS[key] && (
                    <button
                      key={key}
                      onClick={() => handleClickRun(runId)}
                      className="flex items-center gap-2 w-full text-left hover:bg-white/[0.02] rounded px-1 py-0.5 transition-colors group"
                    >
                      <span className="text-[10px] text-neon-teal w-3">
                        {BEST_RUN_ICONS[key]!.icon}
                      </span>
                      <span className="text-[9px] text-slate-500">
                        {BEST_RUN_ICONS[key]!.label}
                      </span>
                      <span className="text-[9px] font-mono text-slate-400">
                        {runId.slice(0, 8)}...
                      </span>
                      <span className="text-[9px] text-slate-700 group-hover:text-neon-teal ml-auto">
                        →
                      </span>
                    </button>
                  ),
              )}
            </div>
          )}

          {/* Best workflow */}
          {data.bestWorkflow && (
            <div className="text-[9px] text-slate-500">
              <span className="text-neon-blue">▶</span> Top workflow:{' '}
              <span className="text-slate-300">{data.bestWorkflow.workflowName}</span>
              <span className="text-slate-600">
                {' '}
                ({Math.round(data.bestWorkflow.avgQualityScore * 100)}% quality,{' '}
                {data.bestWorkflow.runCount} runs)
              </span>
            </div>
          )}

          {/* Best mode */}
          {data.bestAutonomyMode && (
            <div className="text-[9px] text-slate-500">
              <span className="text-neon-purple">⚡</span> Best mode:{' '}
              <span className="text-slate-300">{data.bestAutonomyMode.mode}</span>
              <span className="text-slate-600">
                {' '}
                ({Math.round(data.bestAutonomyMode.avgQualityScore * 100)}% quality,{' '}
                {data.bestAutonomyMode.runCount} runs)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── RunHistoryPanel ───────────────────────────────────────────────────

interface RunHistoryPanelProps {
  sessionId: string
  onSelectRun: (sel: InspectorSelection) => void
  onCompare?: (idA: string, idB: string) => void
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
    onSelectRun({
      type: 'run',
      runId: run.id,
      status: run.status,
      agentNames: run.agentIds ?? [],
      stepCount: run.stepCount ?? 0,
      durationMs: run.durationMs,
      startedAt: run.startedAt,
      memoryCount: run.memoryCount ?? 0,
      retryOfRunId: run.retryOfRunId,
      retryType: run.retryType,
      retryScope: run.retryScope,
      retryTargetId: run.retryTargetId,
      retryReason: run.retryReason,
      workflowId: run.workflowId,
      workflowName: run.workflowName,
      autonomyLevel: run.autonomyLevel,
      autoActionsCount: run.autoActionsCount,
      qualityScore: (run as { qualityScore?: number | null }).qualityScore ?? null,
      qualityLabel: (run as { qualityLabel?: string | null }).qualityLabel ?? null,
    })
  }

  /** Find the previous run (parent or chronologically prior) for quick compare */
  const findCompareTarget = (run: (typeof runs)[number]): string | null => {
    if (run.retryOfRunId) return run.retryOfRunId
    const idx = runs.findIndex((r) => r.id === run.id)
    return idx < runs.length - 1 ? (runs[idx + 1]?.id ?? null) : null
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

      {/* Session Summary */}
      <SessionSummaryCard sessionId={sessionId} onSelectRun={onSelectRun} />

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
          const compareTarget = findCompareTarget(run)
          return (
            <div
              key={run.id}
              className={`group relative border-b border-border-dim transition-colors hover:bg-white/5 ${
                isSelected ? 'bg-neon-teal/5 ring-1 ring-inset ring-neon-teal/20' : ''
              }`}
            >
              <button onClick={() => handleClickRun(run)} className="w-full text-left px-4 py-3">
                {/* Row 1: status + number + badges */}
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {compareMode && (
                    <div
                      className={`w-3 h-3 rounded border flex-shrink-0 ${
                        isSelected ? 'bg-neon-teal border-neon-teal' : 'border-slate-600'
                      }`}
                    />
                  )}
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[run.status] ?? 'bg-slate-500'}`}
                  />
                  <span className="text-xs text-slate-300">Run #{runs.length - idx}</span>
                  <RetryLineageBadge
                    retryType={run.retryType}
                    retryOfRunId={run.retryOfRunId}
                    retryScope={run.retryScope}
                  />
                  <WorkflowBadge workflowName={run.workflowName} />
                  <AutonomyBadge level={run.autonomyLevel} />
                  <QualityBadge label={(run as { qualityLabel?: string }).qualityLabel} />
                </div>

                {/* Row 2: stats */}
                <div className="text-[10px] text-slate-500 flex gap-3 ml-4">
                  <span>{(run.agentIds ?? []).length} agents</span>
                  <span>{run.stepCount ?? 0} steps</span>
                  <span>{formatDuration(run.durationMs)}</span>
                  {(run.memoryCount ?? 0) > 0 && <span>{run.memoryCount} mem</span>}
                </div>

                {/* Row 3: retry reason if present */}
                {run.retryReason && (
                  <div className="text-[10px] text-slate-600 ml-4 mt-1 truncate">
                    Reason: {run.retryReason}
                  </div>
                )}

                {/* Row 4: timestamp */}
                <div className="text-[9px] text-slate-600 ml-4 mt-1">
                  {new Date(run.startedAt).toLocaleString()}
                </div>
              </button>

              {/* Quick compare button (hover) */}
              {!compareMode && compareTarget && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setComparing({ idA: compareTarget, idB: run.id })
                  }}
                  className="absolute right-3 top-3 text-[9px] text-slate-600 hover:text-neon-teal bg-bg-elevated px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title={run.retryOfRunId ? 'Compare with parent' : 'Compare with previous'}
                >
                  {run.retryOfRunId ? '⇄ parent' : '⇄ prev'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Verdict Badge ─────────────────────────────────────────────────────

const VERDICT_STYLE: Record<string, { label: string; cls: string }> = {
  'B improved': { label: 'Improved', cls: 'text-neon-green bg-neon-green/10' },
  'B mixed': { label: 'Mixed', cls: 'text-neon-yellow bg-neon-yellow/10' },
  similar: { label: 'Similar', cls: 'text-slate-400 bg-slate-700/50' },
  'B recovered': { label: 'Recovered', cls: 'text-neon-green bg-neon-green/10' },
  'B regressed': { label: 'Regressed', cls: 'text-neon-red bg-neon-red/10' },
  inconclusive: { label: 'Inconclusive', cls: 'text-slate-500 bg-slate-700/50' },
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
            {/* Verdict */}
            {data.verdict && (
              <div className="flex items-center justify-center">
                <span
                  className={`text-[10px] font-orbitron px-3 py-1 rounded ${
                    VERDICT_STYLE[data.verdict]?.cls ?? 'text-slate-500'
                  }`}
                >
                  {VERDICT_STYLE[data.verdict]?.label ?? data.verdict}
                </span>
              </div>
            )}

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
            {data.sections.map((section: RunDiffSection) => {
              const hasChanges = section.items.some((i: RunDiffItem) => i.changed)
              if (!hasChanges) return null
              return (
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
                              <span
                                className={item.b > item.a ? 'text-neon-green' : 'text-neon-red'}
                              >
                                {item.b > item.a ? '↑' : '↓'}
                              </span>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Unchanged sections note */}
            {data.sections.every(
              (s: RunDiffSection) => !s.items.some((i: RunDiffItem) => i.changed),
            ) && (
              <div className="text-center text-slate-600 text-xs py-4">No differences detected</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
