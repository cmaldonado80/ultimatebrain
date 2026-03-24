'use client'

/**
 * Agents — list all AI agent instances from the database.
 */

import { trpc } from '../../../utils/trpc'

interface Agent {
  id: string
  name: string
  type: string | null
  workspaceId: string | null
  status: string
  model: string | null
  color: string | null
  bg: string | null
  description: string | null
  tags: string[] | null
  skills: string[] | null
  isWsOrchestrator: boolean | null
  triggerMode: string | null
  createdAt: Date
  updatedAt: Date
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'idle'
      ? '#22c55e'
      : status === 'executing'
        ? '#818cf8'
        : status === 'error'
          ? '#ef4444'
          : status === 'offline'
            ? '#6b7280'
            : '#f97316'
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 4px ${color}`,
        flexShrink: 0,
      }}
    />
  )
}

export default function AgentsPage() {
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
          <div style={{ fontSize: 13 }}>Fetching agents</div>
        </div>
      </div>
    )
  }

  const agents: Agent[] = (data as Agent[]) ?? []

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Agents</h2>
        <p style={styles.subtitle}>
          Manage AI agent instances — executors, reviewers, planners, and specialists.
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

      {agents.length === 0 ? (
        <div style={styles.empty}>No agents found. Create one to get started.</div>
      ) : (
        <div style={styles.grid}>
          {agents.map((agent) => (
            <div key={agent.id} style={styles.card}>
              <div style={styles.cardTop}>
                <StatusDot status={agent.status} />
                <span style={styles.cardName}>{agent.name}</span>
                {agent.type && <span style={styles.typeBadge}>{agent.type}</span>}
              </div>
              <div style={styles.cardDesc}>{agent.description || 'No description'}</div>
              <div style={styles.cardMeta}>
                <span>Model: {agent.model || 'N/A'}</span>
                <span>Status: {agent.status}</span>
              </div>
              {agent.skills && agent.skills.length > 0 && (
                <div style={styles.tags}>
                  {agent.skills.map((s) => (
                    <span key={s} style={styles.tag}>
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {agent.tags && agent.tags.length > 0 && (
                <div style={styles.tags}>
                  {agent.tags.map((t) => (
                    <span key={t} style={styles.tagAlt}>
                      {t}
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
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 },
  card: { background: '#1f2937', borderRadius: 8, padding: 16, border: '1px solid #374151' },
  cardTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardName: { fontSize: 15, fontWeight: 700, flex: 1 },
  typeBadge: {
    fontSize: 10,
    background: '#1e3a5f',
    color: '#93c5fd',
    padding: '2px 8px',
    borderRadius: 4,
  },
  cardDesc: { fontSize: 12, color: '#9ca3af', marginBottom: 8, lineHeight: 1.4 },
  cardMeta: { display: 'flex', gap: 16, fontSize: 11, color: '#6b7280', marginBottom: 6 },
  tags: { display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginTop: 6 },
  tag: {
    fontSize: 10,
    background: '#1e1b4b',
    color: '#818cf8',
    padding: '2px 6px',
    borderRadius: 4,
  },
  tagAlt: {
    fontSize: 10,
    background: '#1c1917',
    color: '#a3a3a3',
    padding: '2px 6px',
    borderRadius: 4,
  },
}
