'use client'

/**
 * Dead Letter Queue — inspect failed jobs and system health diagnostics.
 */

import { trpc } from '../../../utils/trpc'

export default function DLQPage() {
  const diagnoseQuery = trpc.healing.diagnose.useQuery()
  const healthQuery = trpc.healing.healthCheck.useQuery()
  const clearLeasesMut = trpc.healing.clearExpiredLeases.useMutation()
  const utils = trpc.useUtils()

  const isLoading = diagnoseQuery.isLoading || healthQuery.isLoading
  const error = diagnoseQuery.error || healthQuery.error

  const handleClearLeases = async () => {
    await clearLeasesMut.mutateAsync()
    utils.healing.diagnose.invalidate()
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
          <div style={{ fontSize: 13 }}>Fetching diagnostics</div>
        </div>
      </div>
    )
  }

  const diagnosis = diagnoseQuery.data as
    | { failedTickets?: unknown[]; expiredLeases?: unknown[]; issues?: string[] }
    | undefined
  const health = healthQuery.data as
    | { status: string; checks?: Record<string, { status: string; message?: string }> }
    | undefined

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Dead Letter Queue</h2>
        <p style={styles.subtitle}>
          Inspect and retry failed jobs — ticket executions, cron runs, and webhook deliveries.
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

      {health && (
        <div style={styles.healthCard}>
          <div style={styles.healthTop}>
            <span style={styles.healthLabel}>System Health</span>
            <span
              style={{
                ...styles.healthStatus,
                color: health.status === 'healthy' ? '#22c55e' : '#ef4444',
              }}
            >
              {health.status}
            </span>
          </div>
          {health.checks &&
            Object.entries(health.checks).map(([name, check]) => (
              <div key={name} style={styles.checkRow}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: check.status === 'ok' ? '#22c55e' : '#ef4444',
                    flexShrink: 0,
                  }}
                />
                <span style={styles.checkName}>{name}</span>
                {check.message && <span style={styles.checkMsg}>{check.message}</span>}
              </div>
            ))}
        </div>
      )}

      {diagnosis?.issues && diagnosis.issues.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Issues ({diagnosis.issues.length})</div>
          {diagnosis.issues.map((issue, i) => (
            <div key={i} style={styles.issueRow}>
              {String(issue)}
            </div>
          ))}
        </div>
      )}

      <div style={styles.actions}>
        <button
          style={styles.actionBtn}
          onClick={handleClearLeases}
          disabled={clearLeasesMut.isPending}
        >
          {clearLeasesMut.isPending ? 'Clearing...' : 'Clear Expired Leases'}
        </button>
      </div>

      {diagnosis &&
        !diagnosis.issues?.length &&
        !diagnosis.failedTickets?.length &&
        !diagnosis.expiredLeases?.length && (
          <div style={styles.empty}>No issues found. System is healthy.</div>
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
  healthCard: {
    background: '#1f2937',
    borderRadius: 8,
    padding: 16,
    border: '1px solid #374151',
    marginBottom: 16,
  },
  healthTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  healthLabel: { fontSize: 13, fontWeight: 700 },
  healthStatus: { fontSize: 14, fontWeight: 700, textTransform: 'uppercase' as const },
  checkRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 },
  checkName: { flex: 1, fontFamily: 'monospace' },
  checkMsg: { fontSize: 11, color: '#6b7280' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: '#f97316', marginBottom: 8 },
  issueRow: {
    background: '#1f2937',
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 12,
    color: '#fbbf24',
    marginBottom: 4,
    border: '1px solid #374151',
  },
  actions: { display: 'flex', gap: 8, marginBottom: 20 },
  actionBtn: {
    background: '#7f1d1d',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
