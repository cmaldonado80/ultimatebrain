'use client'

/**
 * App Dashboard — list all connected agents / apps from the database
 */

import { useState } from 'react'
import { trpc } from '../../../utils/trpc'

interface DisplayApp {
  id: string
  name: string
  type: string
  description: string
  model: string
  status: 'running' | 'degraded' | 'offline'
  tags: string[]
  skills: string[]
  createdAt: Date
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'running' ? '#22c55e' : status === 'degraded' ? '#f97316' : '#ef4444'
  return <span style={{ ...styles.statusDot, background: color, boxShadow: `0 0 4px ${color}` }} />
}

function AppCard({ app }: { app: DisplayApp }) {
  return (
    <a href={`/apps/${app.id}`} style={styles.card}>
      <div style={styles.cardTop}>
        <div style={styles.cardLeft}>
          <StatusDot status={app.status} />
          <span style={styles.cardName}>{app.name}</span>
          <span style={styles.tierBadge}>{app.type || 'Agent'}</span>
        </div>
      </div>
      <div style={styles.cardDomain}>{app.description || 'No description'}</div>
      <div style={styles.statsRow}>
        <div style={styles.stat}>
          <span style={styles.statValue}>{app.model || 'N/A'}</span>
          <span style={styles.statLabel}>Model</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{app.skills.length}</span>
          <span style={styles.statLabel}>Skills</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{app.tags.length}</span>
          <span style={styles.statLabel}>Tags</span>
        </div>
      </div>
      {app.tags.length > 0 && (
        <div style={styles.engineTags}>
          {app.tags.map((t) => (
            <span key={t} style={styles.engineTag}>
              {t}
            </span>
          ))}
        </div>
      )}
    </a>
  )
}

export default function AppsPage() {
  const [filter, setFilter] = useState<string>('all')
  const { data, isLoading, error } = trpc.agents.list.useQuery({ limit: 100, offset: 0 })

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
          <div style={{ fontSize: 13 }}>Fetching apps</div>
        </div>
      </div>
    )
  }

  const agents = (data as any[]) ?? []

  const apps: DisplayApp[] = agents.map((a: any) => ({
    id: a.id,
    name: a.name ?? `Agent ${a.id.slice(0, 8)}`,
    type: a.type ?? 'agent',
    description: a.description ?? '',
    model: a.model ?? '',
    status: 'running' as const,
    tags: a.tags ?? [],
    skills: a.skills ?? [],
    createdAt: new Date(a.createdAt),
  }))

  // Collect unique types for filter tabs
  const types = [...new Set(apps.map((a) => a.type))]
  const filtered = filter === 'all' ? apps : apps.filter((a) => a.type === filter)

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Connected Apps</h1>
          <p style={styles.subtitle}>
            {apps.length} agent{apps.length !== 1 ? 's' : ''} registered
          </p>
        </div>
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

      <div style={styles.tabs}>
        <button
          style={filter === 'all' ? styles.tabActive : styles.tab}
          onClick={() => setFilter('all')}
        >
          All ({apps.length})
        </button>
        {types.map((t) => (
          <button
            key={t}
            style={filter === t ? styles.tabActive : styles.tab}
            onClick={() => setFilter(t)}
          >
            {t} ({apps.filter((a) => a.type === t).length})
          </button>
        ))}
      </div>

      <div style={styles.grid}>
        {filtered.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 40 }}>
            No apps found
          </div>
        ) : (
          filtered.map((app) => <AppCard key={app.id} app={app} />)
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    background: '#0f172a',
    minHeight: '100vh',
    color: '#f9fafb',
    fontFamily: 'sans-serif',
    padding: 24,
  },
  header: { marginBottom: 16 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  tabs: { display: 'flex', gap: 4, marginBottom: 16 },
  tab: {
    background: 'transparent',
    border: '1px solid #374151',
    borderRadius: 6,
    color: '#9ca3af',
    padding: '6px 16px',
    fontSize: 13,
    cursor: 'pointer',
  },
  tabActive: {
    background: '#1f2937',
    border: '1px solid #4b5563',
    borderRadius: 6,
    color: '#f9fafb',
    padding: '6px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  grid: { display: 'flex', flexDirection: 'column' as const, gap: 10 },
  card: {
    display: 'block',
    background: '#1f2937',
    borderRadius: 8,
    padding: 16,
    border: '1px solid #374151',
    textDecoration: 'none',
    color: 'inherit',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardLeft: { display: 'flex', alignItems: 'center', gap: 6 },
  cardName: { fontSize: 15, fontWeight: 700 },
  tierBadge: {
    fontSize: 10,
    background: '#1e3a5f',
    color: '#93c5fd',
    padding: '1px 6px',
    borderRadius: 4,
    fontWeight: 600,
  },
  cardDomain: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
  statusDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  statsRow: { display: 'flex', gap: 20, marginBottom: 10 },
  stat: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: 700 },
  statLabel: { fontSize: 10, color: '#6b7280' },
  engineTags: { display: 'flex', gap: 4, flexWrap: 'wrap' as const },
  engineTag: {
    fontSize: 10,
    background: '#374151',
    borderRadius: 4,
    padding: '2px 6px',
    color: '#9ca3af',
  },
}
