'use client'

/**
 * Engines — brain entity hierarchy and engine status.
 */

import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

interface BrainEntity {
  id: string
  name: string
  domain: string | null
  tier: string
  parentId: string | null
  enginesEnabled: string[] | null
  status: string
  config: unknown
  lastHealthCheck: Date | null
  createdAt: Date
}

const TIER_COLORS: Record<string, string> = {
  brain: '#818cf8',
  mini_brain: '#22c55e',
  development: '#eab308',
}

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  provisioning: '#eab308',
  suspended: '#ef4444',
  degraded: '#f97316',
}

export default function EnginesPage() {
  const listQuery = trpc.entities.list.useQuery({ limit: 100, offset: 0 })
  const topoQuery = trpc.entities.topology.useQuery()

  const isLoading = listQuery.isLoading || topoQuery.isLoading
  const error = listQuery.error || topoQuery.error

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
          <div style={{ fontSize: 13 }}>Fetching engine data</div>
        </div>
      </div>
    )
  }

  const entities: BrainEntity[] = (listQuery.data as BrainEntity[]) ?? []
  const topo = topoQuery.data as
    | { brain: BrainEntity[]; miniBrains: BrainEntity[]; developments: BrainEntity[] }
    | undefined

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Engines</h2>
        <p style={styles.subtitle}>
          Monitor the brain's core engines — LLM Gateway, Memory, Orchestration, Guardrails, and
          more.
        </p>
      </div>

      {error && <DbErrorBanner error={error} />}
      {topo && (
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#818cf8' }}>{topo.brain.length}</div>
            <div style={styles.statLabel}>Brain Entities</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#22c55e' }}>{topo.miniBrains.length}</div>
            <div style={styles.statLabel}>Mini Brains</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#eab308' }}>{topo.developments.length}</div>
            <div style={styles.statLabel}>Development</div>
          </div>
        </div>
      )}

      {entities.length === 0 ? (
        <div style={styles.empty}>No brain entities registered.</div>
      ) : (
        <div style={styles.grid}>
          {entities.map((e) => (
            <div key={e.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.cardName}>{e.name}</span>
                <span style={{ ...styles.tierBadge, color: TIER_COLORS[e.tier] || '#6b7280' }}>
                  {e.tier}
                </span>
              </div>
              <div style={styles.cardMeta}>
                <span style={{ color: STATUS_COLORS[e.status] || '#6b7280' }}>{e.status}</span>
                {e.domain && <span>{e.domain}</span>}
              </div>
              {e.enginesEnabled && e.enginesEnabled.length > 0 && (
                <div style={styles.tags}>
                  {e.enginesEnabled.map((eng) => (
                    <span key={eng} style={styles.tag}>
                      {eng}
                    </span>
                  ))}
                </div>
              )}
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
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 },
  card: { background: '#1f2937', borderRadius: 8, padding: 16, border: '1px solid #374151' },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardName: { fontSize: 15, fontWeight: 700 },
  tierBadge: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const },
  cardMeta: { display: 'flex', gap: 16, fontSize: 11, color: '#6b7280', marginBottom: 6 },
  tags: { display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginTop: 6 },
  tag: {
    fontSize: 10,
    background: '#1e1b4b',
    color: '#818cf8',
    padding: '2px 6px',
    borderRadius: 4,
  },
}
