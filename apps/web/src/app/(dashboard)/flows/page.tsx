'use client'

/**
 * Flows — list saved flow definitions and run crews.
 */

import { useState } from 'react'
import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

interface Flow {
  id: string
  name: string
  description: string | null
  steps: unknown
  status: string
  createdBy: string | null
  version: number | null
  createdAt: Date
  updatedAt: Date
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#6b7280',
  active: '#22c55e',
  archived: '#9ca3af',
  paused: '#eab308',
}

export default function FlowsPage() {
  const [showRun, setShowRun] = useState(false)
  const [crewName, setCrewName] = useState('')
  const [task, setTask] = useState('')
  const [runResult, setRunResult] = useState<string | null>(null)
  const { data, isLoading, error } = trpc.flows.list.useQuery()
  const runCrewMut = trpc.flows.runCrew.useMutation({
    onSuccess: (data) => {
      setRunResult(
        typeof data === 'object' && data !== null && 'result' in data
          ? String((data as { result: unknown }).result)
          : 'Crew run completed.',
      )
      setShowRun(false)
      setCrewName('')
      setTask('')
    },
  })

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
          <div style={{ fontSize: 13 }}>Fetching flows</div>
        </div>
      </div>
    )
  }

  const flows: Flow[] = (data as Flow[]) ?? []

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={styles.title}>Flows</h2>
          <button
            style={{
              background: '#818cf8',
              color: '#f9fafb',
              border: 'none',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => setShowRun(!showRun)}
          >
            {showRun ? 'Cancel' : 'Run Crew'}
          </button>
        </div>
        <p style={styles.subtitle}>
          Define and monitor multi-step agent workflows, crew runs, and recall chains.
        </p>
      </div>

      {showRun && (
        <div
          style={{
            background: '#1f2937',
            borderRadius: 8,
            padding: 16,
            border: '1px solid #374151',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            <input
              style={{
                background: '#111827',
                color: '#f9fafb',
                border: '1px solid #374151',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 13,
              }}
              placeholder="Crew name..."
              value={crewName}
              onChange={(e) => setCrewName(e.target.value)}
            />
            <textarea
              style={{
                background: '#111827',
                color: '#f9fafb',
                border: '1px solid #374151',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 13,
                minHeight: 60,
                resize: 'vertical' as const,
              }}
              placeholder="Task to accomplish..."
              value={task}
              onChange={(e) => setTask(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                style={{
                  background: '#22c55e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() =>
                  crewName.trim() &&
                  task.trim() &&
                  runCrewMut.mutate({
                    name: crewName.trim(),
                    task: task.trim(),
                    agents: [
                      {
                        id: 'default',
                        role: 'executor',
                        goal: task.trim(),
                        backstory: 'You are a skilled AI agent.',
                      },
                    ],
                  })
                }
                disabled={runCrewMut.isPending || !crewName.trim() || !task.trim()}
              >
                {runCrewMut.isPending ? 'Running...' : 'Run'}
              </button>
              {runCrewMut.error && (
                <span style={{ color: '#fca5a5', fontSize: 11 }}>{runCrewMut.error.message}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {runResult && (
        <div
          style={{
            background: '#14532d',
            border: '1px solid #166534',
            borderRadius: 8,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#86efac', marginBottom: 4 }}>
            CREW RESULT
          </div>
          <div style={{ fontSize: 13, color: '#d1fae5', whiteSpace: 'pre-wrap' as const }}>
            {runResult}
          </div>
          <button
            style={{
              marginTop: 8,
              background: 'transparent',
              color: '#6b7280',
              border: 'none',
              fontSize: 11,
              cursor: 'pointer',
            }}
            onClick={() => setRunResult(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {error && <DbErrorBanner error={error} />}
      {flows.length === 0 ? (
        <div style={styles.empty}>
          No flows defined yet. Create a flow to orchestrate agent workflows.
        </div>
      ) : (
        <div style={styles.grid}>
          {flows.map((f) => (
            <div key={f.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.cardName}>{f.name}</span>
                <span
                  style={{ ...styles.statusBadge, color: STATUS_COLORS[f.status] || '#6b7280' }}
                >
                  {f.status}
                </span>
              </div>
              {f.description && <div style={styles.desc}>{f.description}</div>}
              <div style={styles.meta}>
                <span>v{f.version ?? 1}</span>
                {f.createdBy && <span>by {f.createdBy}</span>}
                <span>
                  {Array.isArray(f.steps) ? `${(f.steps as unknown[]).length} steps` : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb' },
  header: { marginBottom: 20 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  empty: { textAlign: 'center' as const, color: '#6b7280', padding: 40, fontSize: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 },
  card: { background: '#1f2937', borderRadius: 8, padding: 16, border: '1px solid #374151' },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardName: { fontSize: 15, fontWeight: 700 },
  statusBadge: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const },
  desc: { fontSize: 12, color: '#9ca3af', marginBottom: 8, lineHeight: 1.4 },
  meta: { display: 'flex', gap: 16, fontSize: 11, color: '#6b7280' },
}
