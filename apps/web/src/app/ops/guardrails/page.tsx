'use client'

/**
 * Guardrails — view guardrail statistics and violation logs.
 */

import { trpc } from '../../../utils/trpc'

interface GuardrailLog {
  id: string
  layer: string
  agentId: string | null
  ticketId: string | null
  ruleName: string | null
  passed: boolean
  violationDetail: string | null
  createdAt: Date
}

export default function GuardrailsPage() {
  const logsQuery = trpc.guardrails.logs.useQuery()
  const statsQuery = trpc.guardrails.stats.useQuery()

  const isLoading = logsQuery.isLoading || statsQuery.isLoading
  const error = logsQuery.error || statsQuery.error

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
          <div style={{ fontSize: 13 }}>Fetching guardrail data</div>
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
            Error loading guardrails
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>{error.message}</div>
        </div>
      </div>
    )
  }

  const logs: GuardrailLog[] = logsQuery.data ?? []
  const stats = statsQuery.data as
    | {
        total: number
        passed: number
        failed: number
        byLayer: Record<string, { total: number; passed: number }>
      }
    | undefined

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Guardrails</h2>
        <p style={styles.subtitle}>
          Safety rules, PII detection logs, and content policy enforcement across all agents.
        </p>
      </div>

      {stats && (
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.total}</div>
            <div style={styles.statLabel}>Total Checks</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#22c55e' }}>{stats.passed}</div>
            <div style={styles.statLabel}>Passed</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#ef4444' }}>{stats.failed}</div>
            <div style={styles.statLabel}>Violations</div>
          </div>
        </div>
      )}

      {logs.length === 0 ? (
        <div style={styles.empty}>No guardrail logs yet.</div>
      ) : (
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <span style={styles.th}>Layer</span>
            <span style={{ ...styles.th, flex: 2 }}>Rule</span>
            <span style={styles.th}>Result</span>
            <span style={{ ...styles.th, flex: 2 }}>Detail</span>
            <span style={styles.th}>Agent</span>
          </div>
          {logs.map((l) => (
            <div key={l.id} style={styles.tableRow}>
              <span style={styles.td}>
                <span style={styles.layerBadge}>{l.layer}</span>
              </span>
              <span style={{ ...styles.td, flex: 2, fontFamily: 'monospace', fontSize: 11 }}>
                {l.ruleName || '—'}
              </span>
              <span style={styles.td}>
                <span style={{ color: l.passed ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                  {l.passed ? 'PASS' : 'FAIL'}
                </span>
              </span>
              <span style={{ ...styles.td, flex: 2, fontSize: 11, color: '#9ca3af' }}>
                {l.violationDetail || '—'}
              </span>
              <span
                style={{ ...styles.td, fontFamily: 'monospace', fontSize: 10, color: '#6b7280' }}
              >
                {l.agentId?.slice(0, 8) || '—'}
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
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 },
  statCard: {
    background: '#1f2937',
    borderRadius: 8,
    padding: 14,
    border: '1px solid #374151',
    textAlign: 'center' as const,
  },
  statValue: { fontSize: 22, fontWeight: 700 },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
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
  layerBadge: {
    fontSize: 10,
    background: '#1e3a5f',
    color: '#93c5fd',
    padding: '2px 6px',
    borderRadius: 4,
  },
}
