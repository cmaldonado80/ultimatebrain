'use client'

/**
 * QA Recordings — list eval datasets and their runs for quality assurance review.
 */

import { useState } from 'react'
import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

interface DatasetSummary {
  id: string
  name: string
  description: string | null
  caseCount: number
  createdAt: Date
}

interface EvalRun {
  id: string
  datasetId: string
  version: string | null
  scores: unknown
  createdAt: Date
}

export default function QAPage() {
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null)

  const datasetsQuery = trpc.evals.datasetsWithCounts.useQuery()
  const runsQuery = trpc.evals.runs.useQuery(
    { datasetId: selectedDataset! },
    { enabled: !!selectedDataset },
  )

  if (datasetsQuery.error) {
    return (
      <div style={styles.page}>
        <DbErrorBanner error={datasetsQuery.error} />
      </div>
    )
  }

  if (datasetsQuery.isLoading) {
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
          <div style={{ fontSize: 13 }}>Fetching QA data</div>
        </div>
      </div>
    )
  }

  const datasets: DatasetSummary[] = (datasetsQuery.data as DatasetSummary[]) ?? []
  const runs: EvalRun[] = (runsQuery.data as EvalRun[]) ?? []

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>QA Recordings</h2>
        <p style={styles.subtitle}>
          Record, replay, and validate visual test sessions for quality assurance.
        </p>
      </div>
      <div style={styles.layout}>
        <div style={styles.sidebar}>
          <div style={styles.sidebarTitle}>Datasets ({datasets.length})</div>
          {datasets.length === 0 ? (
            <div style={styles.sidebarEmpty}>No eval datasets found.</div>
          ) : (
            datasets.map((ds) => (
              <div
                key={ds.id}
                style={selectedDataset === ds.id ? styles.dsActive : styles.dsItem}
                onClick={() => setSelectedDataset(ds.id)}
              >
                <div style={styles.dsName}>{ds.name}</div>
                <div style={styles.dsMeta}>{ds.caseCount} cases</div>
              </div>
            ))
          )}
        </div>

        <div style={styles.main}>
          {!selectedDataset ? (
            <div style={styles.empty}>Select a dataset to view its eval runs.</div>
          ) : runsQuery.isLoading ? (
            <div style={styles.empty}>Loading runs...</div>
          ) : runs.length === 0 ? (
            <div style={styles.empty}>No runs for this dataset yet.</div>
          ) : (
            <div style={styles.list}>
              {runs.map((run) => {
                const scores = run.scores as Record<string, number> | null
                return (
                  <div key={run.id} style={styles.card}>
                    <div style={styles.cardTop}>
                      <span style={styles.runId}>Run {run.id.slice(0, 8)}</span>
                      {run.version && <span style={styles.versionBadge}>v{run.version}</span>}
                      <span style={styles.timestamp}>
                        {new Date(run.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {scores && (
                      <div style={styles.scoreRow}>
                        {Object.entries(scores).map(([key, val]) => (
                          <span key={key} style={styles.scoreBadge}>
                            {key}: {typeof val === 'number' ? val.toFixed(2) : String(val)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb' },
  header: { marginBottom: 20 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    color: '#6b7280',
    fontSize: 14,
  },
  layout: { display: 'flex', gap: 16, minHeight: 400 },
  sidebar: {
    width: 260,
    background: '#111827',
    borderRadius: 8,
    padding: 12,
    border: '1px solid #374151',
  },
  sidebarTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    marginBottom: 8,
  },
  sidebarEmpty: { fontSize: 12, color: '#4b5563', padding: 12, textAlign: 'center' as const },
  dsItem: { padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4 },
  dsActive: {
    padding: '8px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    marginBottom: 4,
    background: '#1f2937',
  },
  dsName: { fontSize: 13, fontWeight: 600 },
  dsMeta: { fontSize: 10, color: '#4b5563' },
  main: { flex: 1, display: 'flex', flexDirection: 'column' as const },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  card: { background: '#1f2937', borderRadius: 8, padding: 14, border: '1px solid #374151' },
  cardTop: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
  runId: { fontSize: 14, fontWeight: 700, fontFamily: 'monospace' },
  versionBadge: {
    fontSize: 10,
    background: '#1e3a5f',
    color: '#93c5fd',
    padding: '2px 6px',
    borderRadius: 4,
  },
  timestamp: { fontSize: 10, color: '#4b5563', marginLeft: 'auto' },
  scoreRow: { display: 'flex', gap: 8, flexWrap: 'wrap' as const },
  scoreBadge: {
    fontSize: 10,
    background: '#1e1b4b',
    color: '#818cf8',
    padding: '2px 6px',
    borderRadius: 4,
  },
}
