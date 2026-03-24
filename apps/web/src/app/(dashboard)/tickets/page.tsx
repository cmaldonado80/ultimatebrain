'use client'

/**
 * Tickets — list all tickets from the database.
 */

import { trpc } from '../../../utils/trpc'

interface Ticket {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  complexity: string
  executionMode: string | null
  workspaceId: string | null
  assignedAgentId: string | null
  projectId: string | null
  createdAt: Date
  updatedAt: Date
}

const STATUS_COLORS: Record<string, string> = {
  backlog: '#6b7280',
  queued: '#eab308',
  in_progress: '#818cf8',
  review: '#f97316',
  done: '#22c55e',
  failed: '#ef4444',
  cancelled: '#9ca3af',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: '#6b7280',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
}

export default function TicketsPage() {
  const { data, isLoading, error } = trpc.tickets.list.useQuery()

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
          <div style={{ fontSize: 13 }}>Fetching tickets</div>
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
            Error loading tickets
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>{error.message}</div>
        </div>
      </div>
    )
  }

  const tickets: Ticket[] = data ?? []

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Tickets</h2>
        <p style={styles.subtitle}>
          Track execution tickets through the pipeline — backlog, queued, in progress, review, done.
        </p>
      </div>

      {tickets.length === 0 ? (
        <div style={styles.empty}>No tickets found. Create one to get started.</div>
      ) : (
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <span style={{ ...styles.th, flex: 2 }}>Title</span>
            <span style={styles.th}>Status</span>
            <span style={styles.th}>Priority</span>
            <span style={styles.th}>Complexity</span>
            <span style={styles.th}>Mode</span>
          </div>
          {tickets.map((t) => (
            <div key={t.id} style={styles.tableRow}>
              <span style={{ ...styles.td, flex: 2, fontWeight: 600 }}>{t.title}</span>
              <span style={styles.td}>
                <span style={{ ...styles.badge, color: STATUS_COLORS[t.status] || '#6b7280' }}>
                  {t.status}
                </span>
              </span>
              <span style={styles.td}>
                <span style={{ ...styles.badge, color: PRIORITY_COLORS[t.priority] || '#6b7280' }}>
                  {t.priority}
                </span>
              </span>
              <span style={styles.td}>{t.complexity}</span>
              <span style={styles.td}>{t.executionMode || '—'}</span>
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
  table: {
    background: '#1f2937',
    borderRadius: 8,
    border: '1px solid #374151',
    overflow: 'hidden',
  },
  tableHeader: {
    display: 'flex',
    padding: '10px 16px',
    background: '#111827',
    borderBottom: '1px solid #374151',
  },
  th: {
    flex: 1,
    fontSize: 11,
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  tableRow: {
    display: 'flex',
    padding: '10px 16px',
    borderBottom: '1px solid #1f2937',
    alignItems: 'center',
  },
  td: { flex: 1, fontSize: 13 },
  badge: { fontSize: 11, fontWeight: 600 },
}
