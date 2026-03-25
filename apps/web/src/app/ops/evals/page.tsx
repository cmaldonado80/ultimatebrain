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
    <div style={styles.scoreBarWrapper}>
      <div style={{ ...styles.scoreBarFill, width: `${pct}%`, background: color }} />
      <span style={styles.scoreBarLabel}>{pct}%</span>
    </div>
  )
}

function ScoreTrend({ history, dimension }: { history: RunHistory[]; dimension: ScoreDimension }) {
  if (history.length < 2) return <span style={styles.noData}>Not enough runs</span>

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
    <svg width={width} height={height} style={styles.trendSvg}>
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
    <div style={styles.caseCompare}>
      <div style={styles.casePanel}>
        <div style={styles.casePanelHeader}>Input</div>
        <pre style={styles.caseJson}>{JSON.stringify(evalCase.input, null, 2)}</pre>
      </div>
      <div style={styles.casePanelDivider}>→</div>
      <div style={styles.casePanel}>
        <div style={styles.casePanelHeader}>Expected Output</div>
        <pre style={styles.caseJson}>
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
      style={{ ...styles.datasetRow, ...(isSelected ? styles.datasetRowSelected : {}) }}
      onClick={onSelect}
    >
      <div style={styles.datasetName}>{dataset.name}</div>
      <div style={styles.datasetMeta}>
        {dataset.description && <span style={styles.datasetDesc}>{dataset.description}</span>}
        <span style={styles.caseCount}>{dataset.caseCount} cases</span>
        <span style={styles.datasetDate}>{new Date(dataset.createdAt).toLocaleDateString()}</span>
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
      <div
        style={{
          ...styles.page,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
        }}
      >
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>Loading...</div>
          <div style={{ fontSize: 13 }}>Fetching eval datasets</div>
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
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Eval Dashboard</h1>
          <p style={styles.pageSubtitle}>
            Production-to-eval pipeline · automated regression detection
          </p>
        </div>
      </div>

      {datasetsQuery.error && <DbErrorBanner error={datasetsQuery.error} />}

      <div style={styles.layout}>
        {/* Sidebar — Dataset List */}
        <div style={styles.sidebar}>
          <div style={styles.sidebarHeader}>Datasets</div>
          {datasets.length === 0 ? (
            <div style={{ fontSize: 12, color: '#6b7280', padding: 12 }}>No datasets found</div>
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
        <div style={styles.main}>
          {selectedDataset && (
            <>
              <div style={styles.datasetTitle}>
                <span style={styles.datasetTitleText}>{selectedDataset.name}</span>
                <span style={styles.datasetTitleMeta}>{selectedDataset.caseCount} cases</span>
              </div>

              {/* Tabs */}
              <div style={styles.tabs}>
                {(['overview', 'cases', 'trends'] as const).map((tab) => (
                  <button
                    key={tab}
                    style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {/* Overview Tab */}
              {activeTab === 'overview' && latestRun && (
                <div style={styles.overviewGrid}>
                  {SCORE_DIMENSIONS.map((dim) => (
                    <div key={dim.key} style={styles.scoreCard}>
                      <div style={styles.scoreCardLabel}>{dim.label}</div>
                      <div style={styles.scoreCardValue}>
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
                <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 40 }}>
                  No eval runs yet for this dataset.
                </div>
              )}

              {activeTab === 'overview' && runsQuery.isLoading && (
                <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 40 }}>
                  Loading run data...
                </div>
              )}

              {/* Trends Tab */}
              {activeTab === 'trends' && (
                <div>
                  {runsQuery.isLoading ? (
                    <div
                      style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 40 }}
                    >
                      Loading trends...
                    </div>
                  ) : history.length === 0 ? (
                    <div
                      style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 40 }}
                    >
                      No run history available.
                    </div>
                  ) : (
                    <div style={styles.trendsGrid}>
                      {SCORE_DIMENSIONS.map((dim) => (
                        <div key={dim.key} style={styles.trendCard}>
                          <div style={styles.trendLabel}>{dim.label}</div>
                          <ScoreTrend history={history} dimension={dim} />
                          {history.length >= 2 && (
                            <div style={styles.trendRange}>
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
                    <div
                      style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 40 }}
                    >
                      Loading cases...
                    </div>
                  ) : evalCases.length === 0 ? (
                    <div
                      style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 40 }}
                    >
                      No cases in this dataset.
                    </div>
                  ) : (
                    <>
                      <div style={styles.caseList}>
                        {evalCases.map((c) => (
                          <div
                            key={c.id}
                            style={{
                              ...styles.caseRow,
                              ...(selectedCase?.id === c.id ? styles.caseRowSelected : {}),
                            }}
                            onClick={() => setSelectedCase(selectedCase?.id === c.id ? null : c)}
                          >
                            <span style={styles.caseId}>{c.id.slice(0, 8)}</span>
                            <span style={styles.casePrompt}>
                              {String(
                                (c.input as Record<string, unknown>).prompt ??
                                  JSON.stringify(c.input).slice(0, 80),
                              )}
                            </span>
                            {c.traceId && (
                              <span style={styles.traceLink}>trace: {c.traceId.slice(0, 10)}</span>
                            )}
                          </div>
                        ))}
                      </div>

                      {selectedCase && (
                        <div style={styles.caseDetail}>
                          <div style={styles.caseDetailHeader}>
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
            <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 40 }}>
              Select a dataset from the sidebar to view eval results.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  page: {
    background: '#0f172a',
    minHeight: '100vh',
    color: '#f9fafb',
    fontFamily: 'sans-serif',
    padding: 24,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  pageTitle: { margin: 0, fontSize: 22, fontWeight: 700 },
  pageSubtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  layout: { display: 'flex', gap: 20 },
  sidebar: { width: 220, flexShrink: 0 },
  sidebarHeader: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 8,
  },
  datasetRow: {
    padding: '10px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    marginBottom: 4,
    border: '1px solid transparent',
  },
  datasetRowSelected: { background: '#1e3a5f', border: '1px solid #2563eb' },
  datasetName: { fontSize: 13, fontWeight: 600, marginBottom: 2 },
  datasetMeta: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const },
  datasetDesc: { fontSize: 11, color: '#6b7280' },
  caseCount: {
    fontSize: 11,
    background: '#374151',
    borderRadius: 10,
    padding: '1px 6px',
    color: '#9ca3af',
  },
  datasetDate: { fontSize: 11, color: '#4b5563' },
  main: { flex: 1 },
  datasetTitle: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 },
  datasetTitleText: { fontSize: 16, fontWeight: 700 },
  datasetTitleMeta: { fontSize: 12, color: '#9ca3af' },
  tabs: {
    display: 'flex',
    gap: 4,
    marginBottom: 20,
    borderBottom: '1px solid #1f2937',
    paddingBottom: 8,
  },
  tab: {
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
    fontSize: 13,
    padding: '4px 12px',
    cursor: 'pointer',
    borderRadius: 4,
  },
  tabActive: { color: '#93c5fd', background: '#1e3a5f' },
  overviewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 12,
  },
  scoreCard: { background: '#1f2937', borderRadius: 8, padding: 14 },
  scoreCardLabel: { fontSize: 11, color: '#9ca3af', marginBottom: 4 },
  scoreCardValue: { fontSize: 24, fontWeight: 700, marginBottom: 8 },
  scoreBarWrapper: {
    height: 6,
    background: '#374151',
    borderRadius: 3,
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
  },
  scoreBarFill: { height: '100%', borderRadius: 3, transition: 'width 0.3s' },
  scoreBarLabel: {
    position: 'absolute' as const,
    right: 0,
    fontSize: 10,
    color: '#9ca3af',
    top: 8,
  },
  trendsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 12,
  },
  trendCard: { background: '#1f2937', borderRadius: 8, padding: 14 },
  trendLabel: { fontSize: 12, fontWeight: 600, marginBottom: 8 },
  trendSvg: { display: 'block' },
  trendRange: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
  },
  noData: { fontSize: 12, color: '#6b7280' },
  caseList: { display: 'flex', flexDirection: 'column' as const, gap: 4, marginBottom: 16 },
  caseRow: {
    background: '#1f2937',
    borderRadius: 6,
    padding: '10px 12px',
    cursor: 'pointer',
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    border: '1px solid transparent',
  },
  caseRowSelected: { border: '1px solid #2563eb' },
  caseId: { fontSize: 11, color: '#6b7280', fontFamily: 'monospace', minWidth: 30 },
  casePrompt: { flex: 1, fontSize: 12, color: '#d1d5db' },
  traceLink: { fontSize: 11, color: '#6b7280', fontFamily: 'monospace' },
  caseDetail: { background: '#1f2937', borderRadius: 8, padding: 16 },
  caseDetailHeader: { fontSize: 13, fontWeight: 600, marginBottom: 12 },
  caseCompare: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  casePanel: { flex: 1 },
  casePanelHeader: {
    fontSize: 11,
    fontWeight: 600,
    color: '#9ca3af',
    marginBottom: 6,
    textTransform: 'uppercase' as const,
  },
  caseJson: {
    background: '#111827',
    borderRadius: 6,
    padding: 12,
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#d1d5db',
    overflow: 'auto',
    maxHeight: 240,
    margin: 0,
  },
  casePanelDivider: { fontSize: 18, color: '#374151', paddingTop: 32 },
}
