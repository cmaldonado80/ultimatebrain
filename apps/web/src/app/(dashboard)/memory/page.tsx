'use client'

/**
 * Memory Graph — explore the brain's tiered memory system.
 */

import { useState } from 'react'
import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

interface Memory {
  id: string
  key: string
  content: string
  source: string | null
  confidence: number | null
  workspaceId: string | null
  tier: string
  createdAt: Date
  updatedAt: Date | null
}

const TIER_COLORS: Record<string, string> = {
  core: '#818cf8',
  recall: '#22c55e',
  archival: '#6b7280',
}

export default function MemoryPage() {
  const [filterTier, setFilterTier] = useState<string | undefined>(undefined)
  const [showForm, setShowForm] = useState(false)
  const [memKey, setMemKey] = useState('')
  const [memContent, setMemContent] = useState('')
  const [memTier, setMemTier] = useState<'core' | 'recall' | 'archival'>('recall')
  const listQuery = trpc.memory.list.useQuery(
    filterTier ? { tier: filterTier as 'core' | 'recall' | 'archival' } : undefined,
  )
  const statsQuery = trpc.memory.tierStats.useQuery()
  const utils = trpc.useUtils()
  const storeMut = trpc.memory.store.useMutation({
    onSuccess: () => {
      utils.memory.list.invalidate()
      utils.memory.tierStats.invalidate()
      setShowForm(false)
      setMemKey('')
      setMemContent('')
    },
  })

  const isLoading = listQuery.isLoading || statsQuery.isLoading
  const error = listQuery.error || statsQuery.error

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
          <div style={{ fontSize: 13 }}>Fetching memory data</div>
        </div>
      </div>
    )
  }

  const memories: Memory[] = (listQuery.data as Memory[]) ?? []
  const stats = statsQuery.data as Record<string, number> | undefined

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={styles.title}>Memory Graph</h2>
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
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : '+ Store Memory'}
          </button>
        </div>
        <p style={styles.subtitle}>
          Explore the brain's memory tiers — core, recall, and archival — with vector search.
        </p>
      </div>

      {showForm && (
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
              placeholder="Memory key (e.g. project.architecture)..."
              value={memKey}
              onChange={(e) => setMemKey(e.target.value)}
            />
            <textarea
              style={{
                background: '#111827',
                color: '#f9fafb',
                border: '1px solid #374151',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 13,
                minHeight: 80,
                resize: 'vertical' as const,
              }}
              placeholder="Memory content..."
              value={memContent}
              onChange={(e) => setMemContent(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                style={{
                  background: '#111827',
                  color: '#f9fafb',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                }}
                value={memTier}
                onChange={(e) => setMemTier(e.target.value as 'core' | 'recall' | 'archival')}
              >
                <option value="core">Core</option>
                <option value="recall">Recall</option>
                <option value="archival">Archival</option>
              </select>
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
                  memKey.trim() &&
                  memContent.trim() &&
                  storeMut.mutate({ key: memKey.trim(), content: memContent.trim(), tier: memTier })
                }
                disabled={storeMut.isPending || !memKey.trim() || !memContent.trim()}
              >
                {storeMut.isPending ? 'Storing...' : 'Store'}
              </button>
              {storeMut.error && (
                <span style={{ color: '#fca5a5', fontSize: 11 }}>{storeMut.error.message}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <DbErrorBanner error={error} />}
      {stats && (
        <div style={styles.statsGrid}>
          {Object.entries(stats).map(([tier, count]) => (
            <div key={tier} style={styles.statCard}>
              <div style={{ ...styles.statValue, color: TIER_COLORS[tier] || '#f9fafb' }}>
                {String(count)}
              </div>
              <div style={styles.statLabel}>{tier}</div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.filters}>
        <button
          style={filterTier === undefined ? styles.filterActive : styles.filterBtn}
          onClick={() => setFilterTier(undefined)}
        >
          All
        </button>
        {['core', 'recall', 'archival'].map((t) => (
          <button
            key={t}
            style={filterTier === t ? styles.filterActive : styles.filterBtn}
            onClick={() => setFilterTier(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {memories.length === 0 ? (
        <div style={styles.empty}>No memories found in this tier.</div>
      ) : (
        <div style={styles.list}>
          {memories.map((m) => (
            <div key={m.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.memKey}>{m.key}</span>
                <span style={{ ...styles.tierBadge, color: TIER_COLORS[m.tier] || '#6b7280' }}>
                  {m.tier}
                </span>
                {m.confidence != null && (
                  <span style={styles.confidence}>{(m.confidence * 100).toFixed(0)}%</span>
                )}
              </div>
              <div style={styles.content}>{m.content}</div>
              <div style={styles.meta}>
                <span>ID: {m.id.slice(0, 8)}</span>
                {m.source && <span>Source: {m.source.slice(0, 8)}</span>}
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
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 },
  statCard: {
    background: '#1f2937',
    borderRadius: 8,
    padding: 14,
    border: '1px solid #374151',
    textAlign: 'center' as const,
  },
  statValue: { fontSize: 22, fontWeight: 700 },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2, textTransform: 'capitalize' as const },
  filters: { display: 'flex', gap: 6, marginBottom: 16 },
  filterBtn: {
    background: '#1f2937',
    color: '#9ca3af',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '4px 12px',
    fontSize: 12,
    cursor: 'pointer',
  },
  filterActive: {
    background: '#818cf8',
    color: '#f9fafb',
    border: '1px solid #818cf8',
    borderRadius: 6,
    padding: '4px 12px',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
  },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  card: { background: '#1f2937', borderRadius: 8, padding: 14, border: '1px solid #374151' },
  cardTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  memKey: { fontSize: 13, fontWeight: 700, fontFamily: 'monospace', flex: 1 },
  tierBadge: { fontSize: 10, fontWeight: 600 },
  confidence: { fontSize: 10, color: '#6b7280' },
  content: { fontSize: 12, color: '#d1d5db', lineHeight: 1.5, marginBottom: 6 },
  meta: { display: 'flex', gap: 16, fontSize: 10, color: '#4b5563' },
}
