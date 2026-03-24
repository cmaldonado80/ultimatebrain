'use client'

/**
 * Checkpoints — browse and restore execution state snapshots.
 */

import { useState } from 'react'
import { trpc } from '../../../utils/trpc'

interface Checkpoint {
  id: string
  entityType: string
  entityId: string
  stepIndex: number
  state: unknown
  metadata: unknown
  createdAt: Date
}

export default function CheckpointsPage() {
  const [entityType, setEntityType] = useState('ticket')
  const [entityId, setEntityId] = useState('')
  const [searching, setSearching] = useState(false)

  const listQuery = trpc.checkpointing.list.useQuery(
    { entityType, entityId },
    { enabled: searching && entityId.length > 0 },
  )

  const handleSearch = () => {
    if (entityId.trim()) setSearching(true)
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Checkpoints</h2>
        <p style={styles.subtitle}>
          State snapshots for agent execution — restore, compare, and debug from any checkpoint.
        </p>
      </div>

      <div style={styles.searchBar}>
        <select
          style={styles.select}
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value)
            setSearching(false)
          }}
        >
          <option value="ticket">Ticket</option>
          <option value="agent">Agent</option>
          <option value="flow">Flow</option>
        </select>
        <input
          style={styles.input}
          placeholder="Entity ID (UUID)"
          value={entityId}
          onChange={(e) => {
            setEntityId(e.target.value)
            setSearching(false)
          }}
        />
        <button style={styles.searchBtn} onClick={handleSearch}>
          Search
        </button>
      </div>

      {!searching ? (
        <div style={styles.empty}>Enter an entity type and ID to browse checkpoints.</div>
      ) : listQuery.isLoading ? (
        <div style={styles.empty}>Loading checkpoints...</div>
      ) : listQuery.error ? (
        <div style={{ ...styles.empty, color: '#f87171' }}>Error: {listQuery.error.message}</div>
      ) : (
        (() => {
          const checkpoints: Checkpoint[] = listQuery.data ?? []
          return checkpoints.length === 0 ? (
            <div style={styles.empty}>No checkpoints found for this entity.</div>
          ) : (
            <div style={styles.list}>
              {checkpoints.map((cp) => (
                <div key={cp.id} style={styles.card}>
                  <div style={styles.cardTop}>
                    <span style={styles.stepBadge}>Step {cp.stepIndex}</span>
                    <span style={styles.entityType}>{cp.entityType}</span>
                    <span style={styles.timestamp}>{new Date(cp.createdAt).toLocaleString()}</span>
                  </div>
                  <div style={styles.statePreview}>
                    {JSON.stringify(cp.state, null, 2).slice(0, 200)}
                    {JSON.stringify(cp.state).length > 200 ? '...' : ''}
                  </div>
                </div>
              ))}
            </div>
          )
        })()
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
  searchBar: { display: 'flex', gap: 8, marginBottom: 20 },
  select: {
    background: '#1f2937',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 13,
  },
  input: {
    flex: 1,
    background: '#1f2937',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 13,
  },
  searchBtn: {
    background: '#818cf8',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 6,
    padding: '6px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  card: { background: '#1f2937', borderRadius: 8, padding: 14, border: '1px solid #374151' },
  cardTop: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  stepBadge: {
    fontSize: 11,
    fontWeight: 700,
    background: '#1e3a5f',
    color: '#93c5fd',
    padding: '2px 8px',
    borderRadius: 4,
  },
  entityType: { fontSize: 11, color: '#6b7280' },
  timestamp: { fontSize: 10, color: '#4b5563', marginLeft: 'auto' },
  statePreview: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#9ca3af',
    whiteSpace: 'pre-wrap' as const,
    lineHeight: 1.4,
  },
}
