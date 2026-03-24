'use client'

/**
 * Flows — list saved flow definitions and run crews.
 */

import { trpc } from '../../../utils/trpc'

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
  const { data, isLoading, error } = trpc.flows.list.useQuery()

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
        <h2 style={styles.title}>Flows</h2>
        <p style={styles.subtitle}>
          Define and monitor multi-step agent workflows, crew runs, and recall chains.
        </p>
      </div>

      {error && (
        <div
          style={{
            background: '#1e1b4b',
            border: '1px solid #4338ca',
            borderRadius: 8,
            padding: '10px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ color: '#818cf8', fontSize: 14 }}>
            Database tables not yet provisioned.
          </span>
          <span style={{ color: '#6b7280', fontSize: 12 }}>
            Run the migration to populate data.
          </span>
        </div>
      )}

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
