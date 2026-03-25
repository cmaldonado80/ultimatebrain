'use client'

/**
 * Ops Overview — system-wide operational dashboard.
 */

import { trpc } from '../../utils/trpc'
import { DbErrorBanner } from '../../components/db-error-banner'

export default function OpsOverviewPage() {
  const healthQuery = trpc.healing.healthCheck.useQuery()
  const tracesQuery = trpc.traces.recent.useQuery({ limit: 10 })
  const approvalsQuery = trpc.approvals.pending.useQuery()
  const gatewayHealthQuery = trpc.gateway.health.useQuery()

  const isLoading =
    healthQuery.isLoading ||
    tracesQuery.isLoading ||
    approvalsQuery.isLoading ||
    gatewayHealthQuery.isLoading
  const error =
    healthQuery.error || tracesQuery.error || approvalsQuery.error || gatewayHealthQuery.error

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
          <div style={{ fontSize: 13 }}>Fetching ops overview</div>
        </div>
      </div>
    )
  }

  const health = healthQuery.data as
    | { status: string; checks?: Record<string, { status: string; message?: string }> }
    | undefined
  const traces = (tracesQuery.data as unknown[]) ?? []
  const pendingApprovals = (approvalsQuery.data as unknown[]) ?? []
  const gatewayHealth = gatewayHealthQuery.data as { status: string } | undefined

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Ops Overview</h2>
        <p style={styles.subtitle}>
          System-wide operational dashboard — health, throughput, errors, and SLA compliance.
        </p>
      </div>

      {error && <DbErrorBanner error={error} />}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div
            style={{
              ...styles.statValue,
              color: health?.status === 'healthy' ? '#22c55e' : '#ef4444',
            }}
          >
            {health?.status || 'unknown'}
          </div>
          <div style={styles.statLabel}>System Health</div>
        </div>
        <div style={styles.statCard}>
          <div
            style={{
              ...styles.statValue,
              color: gatewayHealth?.status === 'healthy' ? '#22c55e' : '#f97316',
            }}
          >
            {gatewayHealth?.status || 'unknown'}
          </div>
          <div style={styles.statLabel}>Gateway</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{traces.length}</div>
          <div style={styles.statLabel}>Recent Traces</div>
        </div>
        <div style={styles.statCard}>
          <div
            style={{
              ...styles.statValue,
              color: pendingApprovals.length > 0 ? '#f97316' : '#22c55e',
            }}
          >
            {pendingApprovals.length}
          </div>
          <div style={styles.statLabel}>Pending Approvals</div>
        </div>
      </div>

      {health?.checks && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Health Checks</div>
          <div style={styles.healthList}>
            {Object.entries(health.checks).map(([name, check]) => (
              <div key={name} style={styles.healthRow}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: check.status === 'ok' ? '#22c55e' : '#ef4444',
                    flexShrink: 0,
                  }}
                />
                <span style={styles.healthName}>{name}</span>
                <span style={styles.healthStatus}>{check.status}</span>
                {check.message && <span style={styles.healthMsg}>{check.message}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {traces.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Recent Traces</div>
          {(
            traces as {
              spanId: string
              operation: string
              status: string | null
              durationMs: number | null
            }[]
          ).map((t) => (
            <div key={t.spanId} style={styles.traceRow}>
              <span style={styles.traceOp}>{t.operation}</span>
              <span
                style={{
                  color:
                    t.status === 'ok' ? '#22c55e' : t.status === 'error' ? '#ef4444' : '#6b7280',
                  fontSize: 11,
                }}
              >
                {t.status || '—'}
              </span>
              <span style={styles.traceDuration}>
                {t.durationMs != null ? `${t.durationMs}ms` : '—'}
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
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 },
  statCard: {
    background: '#1f2937',
    borderRadius: 8,
    padding: 14,
    border: '1px solid #374151',
    textAlign: 'center' as const,
  },
  statValue: { fontSize: 20, fontWeight: 700 },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#9ca3af',
    marginBottom: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  healthList: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  healthRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: '#1f2937',
    borderRadius: 6,
    border: '1px solid #374151',
    fontSize: 12,
  },
  healthName: { flex: 1, fontFamily: 'monospace' },
  healthStatus: { fontSize: 11, color: '#6b7280' },
  healthMsg: {
    fontSize: 10,
    color: '#4b5563',
    maxWidth: 200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  traceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '6px 12px',
    background: '#1f2937',
    borderRadius: 6,
    border: '1px solid #374151',
    fontSize: 12,
    marginBottom: 4,
  },
  traceOp: { flex: 1, fontFamily: 'monospace', fontWeight: 600 },
  traceDuration: { fontSize: 11, color: '#6b7280' },
}
