'use client'

/**
 * Traces — view recent distributed trace spans.
 */

import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

interface Span {
  spanId: string
  traceId: string
  parentSpanId: string | null
  operation: string
  service: string | null
  agentId: string | null
  ticketId: string | null
  durationMs: number | null
  status: string | null
  attributes: unknown
  createdAt: Date
}

export default function TracesPage() {
  const { data, isLoading, error } = trpc.traces.recent.useQuery({ limit: 100 })

  if (error) {
    return (
      <div style={styles.page}>
        <DbErrorBanner error={error} />
      </div>
    )
  }

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
          <div style={{ fontSize: 13 }}>Fetching traces</div>
        </div>
      </div>
    )
  }

  const spans: Span[] = (data as Span[]) ?? []

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Traces</h2>
        <p style={styles.subtitle}>
          Distributed tracing for agent executions — spans, latency, and dependency graphs.
        </p>
      </div>
      {spans.length === 0 ? (
        <div style={styles.empty}>No traces found. Traces appear as agents execute tasks.</div>
      ) : (
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <span style={{ ...styles.th, flex: 2 }}>Operation</span>
            <span style={styles.th}>Service</span>
            <span style={styles.th}>Status</span>
            <span style={styles.th}>Duration</span>
            <span style={styles.th}>Trace ID</span>
          </div>
          {spans.map((s) => (
            <div key={s.spanId} style={styles.tableRow}>
              <span style={{ ...styles.td, flex: 2, fontWeight: 600, fontFamily: 'monospace' }}>
                {s.operation}
              </span>
              <span style={styles.td}>{s.service || '—'}</span>
              <span style={styles.td}>
                <span
                  style={{
                    color:
                      s.status === 'ok' ? '#22c55e' : s.status === 'error' ? '#ef4444' : '#eab308',
                  }}
                >
                  {s.status || '—'}
                </span>
              </span>
              <span style={styles.td}>{s.durationMs != null ? `${s.durationMs}ms` : '—'}</span>
              <span
                style={{ ...styles.td, fontFamily: 'monospace', fontSize: 10, color: '#6b7280' }}
              >
                {s.traceId.slice(0, 12)}
              </span>
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
}
