'use client'

/**
 * Eval Dashboard — Production-to-Eval Pipeline UI
 *
 * - Dataset list with case counts
 * - Run history with score trends (line chart)
 * - Drill into failed cases: side-by-side expected vs. actual
 * - "Create eval from trace" button in header
 */

import { useState } from 'react'

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
  runId: string
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

  const values = history.map((h) => h.scores[dimension.key] ?? 0)
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
          key={i}
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
        <span style={styles.datasetDate}>
          {new Date(dataset.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  )
}

// ── Mock data for UI preview ─────────────────────────────────────────────

const MOCK_DATASETS: Dataset[] = [
  { id: '1', name: 'ticket-execution', description: 'Auto-generated from failed traces', caseCount: 42, createdAt: new Date('2026-03-20') },
  { id: '2', name: 'chat-quality', description: 'High-rated completions', caseCount: 87, createdAt: new Date('2026-03-21') },
  { id: '3', name: 'tool-use', description: 'Tool call accuracy tests', caseCount: 31, createdAt: new Date('2026-03-22') },
]

const MOCK_HISTORY: RunHistory[] = [
  { runId: 'r1', version: 'v1.0', scores: { task_completion: 0.72, factuality: 0.81, tool_use_accuracy: 0.68, safety: 0.95, cost_efficiency: 0.74 }, createdAt: new Date('2026-03-18') },
  { runId: 'r2', version: 'v1.1', scores: { task_completion: 0.76, factuality: 0.83, tool_use_accuracy: 0.71, safety: 0.96, cost_efficiency: 0.77 }, createdAt: new Date('2026-03-19') },
  { runId: 'r3', version: 'v1.2', scores: { task_completion: 0.80, factuality: 0.85, tool_use_accuracy: 0.75, safety: 0.97, cost_efficiency: 0.80 }, createdAt: new Date('2026-03-20') },
  { runId: 'r4', version: 'v1.3', scores: { task_completion: 0.78, factuality: 0.82, tool_use_accuracy: 0.73, safety: 0.95, cost_efficiency: 0.79 }, createdAt: new Date('2026-03-21') },
  { runId: 'r5', version: 'v1.4', scores: { task_completion: 0.82, factuality: 0.87, tool_use_accuracy: 0.79, safety: 0.98, cost_efficiency: 0.83 }, createdAt: new Date('2026-03-22') },
]

const MOCK_CASES: EvalCase[] = [
  {
    id: 'c1',
    input: { prompt: 'Create a ticket to refactor the payment module', agentId: 'agent-123' },
    expectedOutput: { action: 'ticket.create', title: 'Refactor payment module', priority: 'medium' },
    traceId: 'trace-abc',
  },
  {
    id: 'c2',
    input: { prompt: 'What is the status of ticket #45?', agentId: 'agent-123' },
    expectedOutput: { response: 'Ticket #45 is currently in_progress, assigned to agent-456' },
    traceId: 'trace-def',
  },
]

// ── Main Page ─────────────────────────────────────────────────────────────

export default function EvalsPage() {
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(MOCK_DATASETS[0])
  const [selectedCase, setSelectedCase] = useState<EvalCase | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'cases' | 'trends'>('overview')

  const latestRun = MOCK_HISTORY[MOCK_HISTORY.length - 1]

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Eval Dashboard</h1>
          <p style={styles.pageSubtitle}>Production-to-eval pipeline · automated regression detection</p>
        </div>
        <button style={styles.createBtn}>+ Create from Trace</button>
      </div>

      <div style={styles.layout}>
        {/* Sidebar — Dataset List */}
        <div style={styles.sidebar}>
          <div style={styles.sidebarHeader}>Datasets</div>
          {MOCK_DATASETS.map((d) => (
            <DatasetRow
              key={d.id}
              dataset={d}
              isSelected={selectedDataset?.id === d.id}
              onSelect={() => {
                setSelectedDataset(d)
                setSelectedCase(null)
              }}
            />
          ))}
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
                        {Math.round((latestRun.scores[dim.key] ?? 0) * 100)}%
                      </div>
                      <ScoreBar score={latestRun.scores[dim.key] ?? 0} color={dim.color} />
                    </div>
                  ))}
                </div>
              )}

              {/* Trends Tab */}
              {activeTab === 'trends' && (
                <div style={styles.trendsGrid}>
                  {SCORE_DIMENSIONS.map((dim) => (
                    <div key={dim.key} style={styles.trendCard}>
                      <div style={styles.trendLabel}>{dim.label}</div>
                      <ScoreTrend history={MOCK_HISTORY} dimension={dim} />
                      <div style={styles.trendRange}>
                        <span>{MOCK_HISTORY[0]?.createdAt.toLocaleDateString()}</span>
                        <span>{MOCK_HISTORY[MOCK_HISTORY.length - 1]?.createdAt.toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Cases Tab */}
              {activeTab === 'cases' && (
                <div>
                  <div style={styles.caseList}>
                    {MOCK_CASES.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          ...styles.caseRow,
                          ...(selectedCase?.id === c.id ? styles.caseRowSelected : {}),
                        }}
                        onClick={() => setSelectedCase(selectedCase?.id === c.id ? null : c)}
                      >
                        <span style={styles.caseId}>{c.id}</span>
                        <span style={styles.casePrompt}>
                          {String((c.input as Record<string, unknown>).prompt ?? '').slice(0, 80)}
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
                        Case {selectedCase.id} — Expected vs. Actual
                      </div>
                      <CaseCompare evalCase={selectedCase} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  page: { background: '#0f172a', minHeight: '100vh', color: '#f9fafb', fontFamily: 'sans-serif', padding: 24 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  pageTitle: { margin: 0, fontSize: 22, fontWeight: 700 },
  pageSubtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  createBtn: { background: '#2563eb', border: 'none', borderRadius: 6, color: '#fff', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  layout: { display: 'flex', gap: 20 },
  sidebar: { width: 220, flexShrink: 0 },
  sidebarHeader: { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 8 },
  datasetRow: { padding: '10px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 4, border: '1px solid transparent' },
  datasetRowSelected: { background: '#1e3a5f', border: '1px solid #2563eb' },
  datasetName: { fontSize: 13, fontWeight: 600, marginBottom: 2 },
  datasetMeta: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const },
  datasetDesc: { fontSize: 11, color: '#6b7280' },
  caseCount: { fontSize: 11, background: '#374151', borderRadius: 10, padding: '1px 6px', color: '#9ca3af' },
  datasetDate: { fontSize: 11, color: '#4b5563' },
  main: { flex: 1 },
  datasetTitle: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 },
  datasetTitleText: { fontSize: 16, fontWeight: 700 },
  datasetTitleMeta: { fontSize: 12, color: '#9ca3af' },
  tabs: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #1f2937', paddingBottom: 8 },
  tab: { background: 'transparent', border: 'none', color: '#6b7280', fontSize: 13, padding: '4px 12px', cursor: 'pointer', borderRadius: 4 },
  tabActive: { color: '#93c5fd', background: '#1e3a5f' },
  overviewGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 },
  scoreCard: { background: '#1f2937', borderRadius: 8, padding: 14 },
  scoreCardLabel: { fontSize: 11, color: '#9ca3af', marginBottom: 4 },
  scoreCardValue: { fontSize: 24, fontWeight: 700, marginBottom: 8 },
  scoreBarWrapper: { height: 6, background: '#374151', borderRadius: 3, position: 'relative' as const, display: 'flex', alignItems: 'center' },
  scoreBarFill: { height: '100%', borderRadius: 3, transition: 'width 0.3s' },
  scoreBarLabel: { position: 'absolute' as const, right: 0, fontSize: 10, color: '#9ca3af', top: 8 },
  trendsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 },
  trendCard: { background: '#1f2937', borderRadius: 8, padding: 14 },
  trendLabel: { fontSize: 12, fontWeight: 600, marginBottom: 8 },
  trendSvg: { display: 'block' },
  trendRange: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b7280', marginTop: 4 },
  noData: { fontSize: 12, color: '#6b7280' },
  caseList: { display: 'flex', flexDirection: 'column' as const, gap: 4, marginBottom: 16 },
  caseRow: { background: '#1f2937', borderRadius: 6, padding: '10px 12px', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center', border: '1px solid transparent' },
  caseRowSelected: { border: '1px solid #2563eb' },
  caseId: { fontSize: 11, color: '#6b7280', fontFamily: 'monospace', minWidth: 30 },
  casePrompt: { flex: 1, fontSize: 12, color: '#d1d5db' },
  traceLink: { fontSize: 11, color: '#6b7280', fontFamily: 'monospace' },
  caseDetail: { background: '#1f2937', borderRadius: 8, padding: 16 },
  caseDetailHeader: { fontSize: 13, fontWeight: 600, marginBottom: 12 },
  caseCompare: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  casePanel: { flex: 1 },
  casePanelHeader: { fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase' as const },
  caseJson: { background: '#111827', borderRadius: 6, padding: 12, fontSize: 11, fontFamily: 'monospace', color: '#d1d5db', overflow: 'auto', maxHeight: 240, margin: 0 },
  casePanelDivider: { fontSize: 18, color: '#374151', paddingTop: 32 },
}
