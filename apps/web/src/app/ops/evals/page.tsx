'use client'

/**
 * Eval Dashboard — Production-to-Eval Pipeline UI
 *
 * - Dataset list with case counts
 * - Run history with score trends (line chart)
 * - Drill into cases: side-by-side expected vs. actual
 * - "Create eval from trace" button in header
 */

import { useState, useEffect } from 'react'
import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

// ── Types (mirroring server types for client use) ─────────────────────────

interface Dataset {
  id: string
  name: string
  description: string | null
  caseCount: number
  createdAt: Date
}

interface ScoreDimension {
  key: string
  label: string
  color: string
}

interface RunHistory {
  id: string
  version: string | null
  scores: Record<string, number>
  createdAt: Date
}

interface EvalCase {
  id: string
  input: Record<string, unknown>
  expectedOutput: Record<string, unknown> | null
  traceId: string | null
}

/** Row shape returned by `trpc.evals.datasetsWithCounts` (DatasetSummary from dataset-builder) */
interface DatasetRaw {
  id: string
  name: string
  description: string | null
  caseCount: number
  createdAt: Date | string
}

/** Row shape returned by `trpc.evals.runs` (drizzle `evalRuns` table select) */
interface EvalRunRaw {
  id: string
  datasetId: string
  version: string | null
  scores: unknown
  createdAt: Date | string
  updatedAt: Date | string | null
}

/** Row shape returned by `trpc.evals.cases` (drizzle `evalCases` table select) */
interface EvalCaseRaw {
  id: string
  datasetId: string
  input: unknown
  expectedOutput: unknown
  traceId: string | null
  createdAt: Date | string
  updatedAt: Date | string | null
}

// ── Constants ─────────────────────────────────────────────────────────────

const SCORE_DIMENSIONS: ScoreDimension[] = [
  { key: 'task_completion', label: 'Task Completion', color: '#22c55e' },
  { key: 'factuality', label: 'Factuality', color: '#3b82f6' },
  { key: 'tool_use_accuracy', label: 'Tool Accuracy', color: '#f97316' },
  { key: 'safety', label: 'Safety', color: '#ef4444' },
  { key: 'cost_efficiency', label: 'Cost Efficiency', color: '#a855f7' },
]

// ── Sub-components ────────────────────────────────────────────────────────

function ScoreBar({ score, color }: { score: number; color: string }) {
  const pct = Math.round(score * 100)
  return (
    <div className="h-1.5 bg-bg-elevated rounded-sm relative flex items-center">
      <div
        className="h-full rounded-sm transition-[width] duration-300"
        style={{ width: `${pct}%`, background: color }}
      />
      <span className="absolute right-0 text-[10px] text-slate-400 top-2">{pct}%</span>
    </div>
  )
}

function ScoreTrend({ history, dimension }: { history: RunHistory[]; dimension: ScoreDimension }) {
  if (history.length < 2) return <span className="text-xs text-slate-500">Not enough runs</span>

  const values = history.map((h) => (h.scores as Record<string, number>)?.[dimension.key] ?? 0)
  const max = Math.max(...values, 1)
  const width = 200
  const height = 48
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width
      const y = height - (v / max) * height
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} className="block">
      <polyline
        points={points}
        fill="none"
        stroke={dimension.color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.map((v, i) => (
        <circle
          key={`${dimension.key}-${i}`}
          cx={(i / (values.length - 1)) * width}
          cy={height - (v / max) * height}
          r={3}
          fill={dimension.color}
        />
      ))}
    </svg>
  )
}

function CaseCompare({ evalCase }: { evalCase: EvalCase }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="flex-1">
        <div className="text-[11px] font-semibold text-slate-400 mb-1.5 uppercase">Input</div>
        <pre className="bg-bg-deep rounded-md p-3 text-[11px] font-mono text-slate-300 overflow-auto max-h-60 m-0">
          {JSON.stringify(evalCase.input, null, 2)}
        </pre>
      </div>
      <div className="text-lg text-border-dim pt-8">{'\u2192'}</div>
      <div className="flex-1">
        <div className="text-[11px] font-semibold text-slate-400 mb-1.5 uppercase">
          Expected Output
        </div>
        <pre className="bg-bg-deep rounded-md p-3 text-[11px] font-mono text-slate-300 overflow-auto max-h-60 m-0">
          {evalCase.expectedOutput
            ? JSON.stringify(evalCase.expectedOutput, null, 2)
            : '(no expected output)'}
        </pre>
      </div>
    </div>
  )
}

function DatasetRow({
  dataset,
  onSelect,
  isSelected,
}: {
  dataset: Dataset
  onSelect: () => void
  isSelected: boolean
}) {
  return (
    <div
      className={`px-3 py-2.5 rounded-md cursor-pointer mb-1 border ${
        isSelected ? 'bg-[#1e3a5f] border-blue-600' : 'border-transparent hover:bg-bg-surface'
      }`}
      onClick={onSelect}
    >
      <div className="text-[13px] font-semibold mb-0.5">{dataset.name}</div>
      <div className="flex gap-2 items-center flex-wrap">
        {dataset.description && (
          <span className="text-[11px] text-slate-500">{dataset.description}</span>
        )}
        <span className="text-[11px] bg-bg-elevated rounded-full px-1.5 py-px text-slate-400">
          {dataset.caseCount} cases
        </span>
        <span className="text-[11px] text-slate-600">
          {new Date(dataset.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function EvalsPage() {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null)
  const [selectedCase, setSelectedCase] = useState<EvalCase | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'cases' | 'trends'>('overview')

  // Fetch datasets with case counts
  const datasetsQuery = trpc.evals.datasetsWithCounts.useQuery()

  // Fetch runs for selected dataset
  const runsQuery = trpc.evals.runs.useQuery(
    { datasetId: selectedDatasetId! },
    { enabled: !!selectedDatasetId },
  )

  // Fetch cases for selected dataset
  const casesQuery = trpc.evals.cases.useQuery(
    { datasetId: selectedDatasetId! },
    { enabled: !!selectedDatasetId && activeTab === 'cases' },
  )

  const isLoading = datasetsQuery.isLoading

  if (isLoading) {
    return (
      <div className="bg-bg-deep min-h-screen text-slate-50 p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">
          <div className="text-2xl mb-2">Loading...</div>
          <div className="text-xs">Fetching eval datasets</div>
        </div>
      </div>
    )
  }

  const datasetsRaw: DatasetRaw[] = (datasetsQuery.data ?? []) as DatasetRaw[]
  const datasets: Dataset[] = datasetsRaw.map((d: DatasetRaw) => ({
    id: d.id,
    name: d.name ?? `Dataset ${d.id.slice(0, 8)}`,
    description: d.description ?? null,
    caseCount: d.caseCount ?? 0,
    createdAt: new Date(d.createdAt),
  }))

  const selectedDataset =
    datasets.find((d) => d.id === selectedDatasetId) ?? (datasets.length > 0 ? datasets[0] : null)

  // Auto-select first dataset if none selected
  useEffect(() => {
    if (selectedDataset && selectedDatasetId !== selectedDataset.id) {
      setSelectedDatasetId(selectedDataset.id)
    }
  }, [selectedDataset, selectedDatasetId])

  if (datasetsQuery.error) {
    return (
      <div className="bg-bg-deep min-h-screen text-slate-50 p-6">
        <DbErrorBanner error={datasetsQuery.error} />
      </div>
    )
  }

  const runsRaw: EvalRunRaw[] = (runsQuery.data ?? []) as EvalRunRaw[]
  const history: RunHistory[] = runsRaw.map((r: EvalRunRaw) => ({
    id: r.id,
    version: r.version ?? null,
    scores: (r.scores as Record<string, number>) ?? {},
    createdAt: new Date(r.createdAt),
  }))

  const latestRun = history.length > 0 ? history[history.length - 1] : null

  const casesRaw: EvalCaseRaw[] = (casesQuery.data ?? []) as EvalCaseRaw[]
  const evalCases: EvalCase[] = casesRaw.map((c: EvalCaseRaw) => ({
    id: c.id,
    input: (c.input as Record<string, unknown>) ?? {},
    expectedOutput: (c.expectedOutput as Record<string, unknown>) ?? null,
    traceId: c.traceId ?? null,
  }))

  return (
    <div className="bg-bg-deep min-h-screen text-slate-50 p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="m-0 text-[22px] font-bold font-orbitron">Eval Dashboard</h1>
          <p className="mt-1 mb-0 text-xs text-slate-500">
            Production-to-eval pipeline &middot; automated regression detection
          </p>
        </div>
      </div>
      <div className="flex gap-5">
        {/* Sidebar — Dataset List */}
        <div className="w-[220px] shrink-0">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
            Datasets
          </div>
          {datasets.length === 0 ? (
            <div className="text-xs text-slate-500 p-3">No datasets found</div>
          ) : (
            datasets.map((d) => (
              <DatasetRow
                key={d.id}
                dataset={d}
                isSelected={selectedDataset?.id === d.id}
                onSelect={() => {
                  setSelectedDatasetId(d.id)
                  setSelectedCase(null)
                }}
              />
            ))
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1">
          {selectedDataset && (
            <>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="text-base font-bold">{selectedDataset.name}</span>
                <span className="text-xs text-slate-400">{selectedDataset.caseCount} cases</span>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mb-5 border-b border-bg-surface pb-2">
                {(['overview', 'cases', 'trends'] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`bg-transparent border-none text-[13px] px-3 py-1 cursor-pointer rounded ${
                      activeTab === tab
                        ? 'text-neon-blue bg-[#1e3a5f]'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {/* Overview Tab */}
              {activeTab === 'overview' && latestRun && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                  {SCORE_DIMENSIONS.map((dim) => (
                    <div key={dim.key} className="cyber-card p-3.5">
                      <div className="text-[11px] text-slate-400 mb-1">{dim.label}</div>
                      <div className="text-2xl font-bold mb-2">
                        {Math.round(
                          ((latestRun.scores as Record<string, number>)?.[dim.key] ?? 0) * 100,
                        )}
                        %
                      </div>
                      <ScoreBar
                        score={(latestRun.scores as Record<string, number>)?.[dim.key] ?? 0}
                        color={dim.color}
                      />
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'overview' && !latestRun && !runsQuery.isLoading && (
                <div className="text-slate-500 text-[13px] text-center py-10">
                  No eval runs yet for this dataset.
                </div>
              )}

              {activeTab === 'overview' && runsQuery.isLoading && (
                <div className="text-slate-500 text-[13px] text-center py-10">
                  Loading run data...
                </div>
              )}

              {/* Trends Tab */}
              {activeTab === 'trends' && (
                <div>
                  {runsQuery.isLoading ? (
                    <div className="text-slate-500 text-[13px] text-center py-10">
                      Loading trends...
                    </div>
                  ) : history.length === 0 ? (
                    <div className="text-slate-500 text-[13px] text-center py-10">
                      No run history available.
                    </div>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                      {SCORE_DIMENSIONS.map((dim) => (
                        <div key={dim.key} className="cyber-card p-3.5">
                          <div className="text-xs font-semibold mb-2">{dim.label}</div>
                          <ScoreTrend history={history} dimension={dim} />
                          {history.length >= 2 && (
                            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                              <span>{new Date(history[0]?.createdAt).toLocaleDateString()}</span>
                              <span>
                                {new Date(
                                  history[history.length - 1]?.createdAt,
                                ).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Cases Tab */}
              {activeTab === 'cases' && (
                <div>
                  {casesQuery.isLoading ? (
                    <div className="text-slate-500 text-[13px] text-center py-10">
                      Loading cases...
                    </div>
                  ) : evalCases.length === 0 ? (
                    <div className="text-slate-500 text-[13px] text-center py-10">
                      No cases in this dataset.
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-1 mb-4">
                        {evalCases.map((c) => (
                          <div
                            key={c.id}
                            className={`bg-bg-surface rounded-md px-3 py-2.5 cursor-pointer flex gap-3 items-center border ${
                              selectedCase?.id === c.id
                                ? 'border-blue-600'
                                : 'border-transparent hover:bg-bg-elevated'
                            }`}
                            onClick={() => setSelectedCase(selectedCase?.id === c.id ? null : c)}
                          >
                            <span className="text-[11px] text-slate-500 font-mono min-w-[30px]">
                              {c.id.slice(0, 8)}
                            </span>
                            <span className="flex-1 text-xs text-slate-300">
                              {String(
                                (c.input as Record<string, unknown>).prompt ??
                                  JSON.stringify(c.input).slice(0, 80),
                              )}
                            </span>
                            {c.traceId && (
                              <span className="text-[11px] text-slate-500 font-mono">
                                trace: {c.traceId.slice(0, 10)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      {selectedCase && (
                        <div className="cyber-card p-4">
                          <div className="text-[13px] font-semibold mb-3">
                            Case {selectedCase.id.slice(0, 8)} — Expected vs. Actual
                          </div>
                          <CaseCompare evalCase={selectedCase} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {!selectedDataset && (
            <div className="text-slate-500 text-[13px] text-center py-10">
              Select a dataset from the sidebar to view eval results.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
