'use client'

/**
 * Gateway — LLM Gateway metrics, health, and provider status.
 */

import { trpc } from '../../../utils/trpc'

interface GatewayMetric {
  id: string
  provider: string
  model: string
  agentId: string | null
  ticketId: string | null
  tokensIn: number | null
  tokensOut: number | null
  latencyMs: number | null
  costUsd: number | null
  cached: boolean | null
  error: string | null
  createdAt: Date
}

export default function GatewayPage() {
  const metricsQuery = trpc.gateway.metrics.useQuery({ limit: 100 })
  const healthQuery = trpc.gateway.health.useQuery()
  const providersQuery = trpc.gateway.listProviders.useQuery()

  const isLoading = metricsQuery.isLoading || healthQuery.isLoading || providersQuery.isLoading
  const error = metricsQuery.error || healthQuery.error || providersQuery.error

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
          <div style={{ fontSize: 13 }}>Fetching gateway data</div>
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
            Error loading gateway
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>{error.message}</div>
        </div>
      </div>
    )
  }

  const metrics: GatewayMetric[] = metricsQuery.data ?? []
  const health = healthQuery.data as
    | { status: string; uptime?: number; requestCount?: number }
    | undefined
  const providers = providersQuery.data as string[] | undefined

  const totalCost = metrics.reduce((sum, m) => sum + (m.costUsd ?? 0), 0)
  const totalTokens = metrics.reduce((sum, m) => sum + (m.tokensIn ?? 0) + (m.tokensOut ?? 0), 0)
  const avgLatency =
    metrics.length > 0
      ? Math.round(metrics.reduce((sum, m) => sum + (m.latencyMs ?? 0), 0) / metrics.length)
      : 0

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Gateway</h2>
        <p style={styles.subtitle}>
          LLM Gateway metrics — request volume, latency, cost tracking, and cache hit rates.
        </p>
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div
            style={{
              ...styles.statValue,
              color: health?.status === 'healthy' ? '#22c55e' : '#f97316',
            }}
          >
            {health?.status || 'unknown'}
          </div>
          <div style={styles.statLabel}>Health</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{metrics.length}</div>
          <div style={styles.statLabel}>Requests</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>${totalCost.toFixed(4)}</div>
          <div style={styles.statLabel}>Total Cost</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{totalTokens.toLocaleString()}</div>
          <div style={styles.statLabel}>Total Tokens</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{avgLatency}ms</div>
          <div style={styles.statLabel}>Avg Latency</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{providers?.length ?? 0}</div>
          <div style={styles.statLabel}>Providers</div>
        </div>
      </div>

      {metrics.length === 0 ? (
        <div style={styles.empty}>No gateway metrics yet.</div>
      ) : (
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <span style={styles.th}>Provider</span>
            <span style={styles.th}>Model</span>
            <span style={styles.th}>Tokens</span>
            <span style={styles.th}>Latency</span>
            <span style={styles.th}>Cost</span>
            <span style={styles.th}>Cached</span>
          </div>
          {metrics.map((m) => (
            <div key={m.id} style={styles.tableRow}>
              <span style={styles.td}>{m.provider}</span>
              <span style={{ ...styles.td, fontFamily: 'monospace', fontSize: 11 }}>{m.model}</span>
              <span style={styles.td}>{(m.tokensIn ?? 0) + (m.tokensOut ?? 0)}</span>
              <span style={styles.td}>{m.latencyMs != null ? `${m.latencyMs}ms` : '—'}</span>
              <span style={styles.td}>{m.costUsd != null ? `$${m.costUsd.toFixed(4)}` : '—'}</span>
              <span style={styles.td}>{m.cached ? 'Yes' : 'No'}</span>
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
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 },
  statCard: {
    background: '#1f2937',
    borderRadius: 8,
    padding: 14,
    border: '1px solid #374151',
    textAlign: 'center' as const,
  },
  statValue: { fontSize: 18, fontWeight: 700 },
  statLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
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
