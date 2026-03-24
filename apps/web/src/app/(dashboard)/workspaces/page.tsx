'use client'

/**
 * Workspaces — list all workspaces from the database.
 */

import { trpc } from '../../../utils/trpc'

interface Workspace {
  id: string
  name: string
  type: string | null
  goal: string | null
  color: string | null
  icon: string | null
  autonomyLevel: number | null
  settings: unknown
  createdAt: Date
  updatedAt: Date
}

export default function WorkspacesPage() {
  const { data, isLoading, error } = trpc.workspaces.list.useQuery({ limit: 100, offset: 0 })

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
          <div style={{ fontSize: 13 }}>Fetching workspaces</div>
        </div>
      </div>
    )
  }

  if (error) {
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
        <div style={{ textAlign: 'center', color: '#f87171' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            Error loading workspaces
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>{error.message}</div>
        </div>
      </div>
    )
  }

  const workspaces: Workspace[] = data ?? []

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Workspaces</h2>
        <p style={styles.subtitle}>
          Multi-tenant workspace isolation with resource scoping and access control boundaries.
        </p>
      </div>

      {workspaces.length === 0 ? (
        <div style={styles.empty}>No workspaces found. Create one to get started.</div>
      ) : (
        <div style={styles.grid}>
          {workspaces.map((ws) => (
            <div key={ws.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.cardIcon}>{ws.icon || '📁'}</span>
                <span style={styles.cardName}>{ws.name}</span>
                {ws.type && <span style={styles.typeBadge}>{ws.type}</span>}
              </div>
              {ws.goal && <div style={styles.cardGoal}>{ws.goal}</div>}
              <div style={styles.cardMeta}>
                <span>Autonomy: {ws.autonomyLevel ?? 1}/5</span>
                <span>ID: {ws.id.slice(0, 8)}</span>
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
  cardTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardIcon: { fontSize: 20 },
  cardName: { fontSize: 15, fontWeight: 700, flex: 1 },
  typeBadge: {
    fontSize: 10,
    background: '#1e3a5f',
    color: '#93c5fd',
    padding: '2px 8px',
    borderRadius: 4,
  },
  cardGoal: { fontSize: 12, color: '#9ca3af', marginBottom: 8, lineHeight: 1.4 },
  cardMeta: { display: 'flex', gap: 16, fontSize: 11, color: '#6b7280' },
}
