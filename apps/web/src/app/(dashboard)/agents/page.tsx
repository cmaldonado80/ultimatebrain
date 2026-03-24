'use client'

/**
 * Agents — list all AI agent instances from the database.
 */

import { useState } from 'react'
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
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [model, setModel] = useState('claude-sonnet-4-6')
  const [description, setDescription] = useState('')
  const { data, isLoading, error } = trpc.agents.list.useQuery({ limit: 100, offset: 0 })
  const utils = trpc.useUtils()
  const createMut = trpc.agents.create.useMutation({
    onSuccess: () => {
      utils.agents.list.invalidate()
      setShowForm(false)
      setName('')
      setType('')
      setDescription('')
    },
  })
  const deleteMut = trpc.agents.delete.useMutation({
    onSuccess: () => {
      utils.agents.list.invalidate()
    },
  })

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={styles.title}>Agents</h2>
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
            {showForm ? 'Cancel' : '+ New Agent'}
          </button>
        </div>
        <p style={styles.subtitle}>
          Manage AI agent instances — executors, reviewers, planners, and specialists.
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
              placeholder="Agent name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                style={{
                  background: '#111827',
                  color: '#f9fafb',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  flex: 1,
                }}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">Type (optional)</option>
                <option value="executor">Executor</option>
                <option value="planner">Planner</option>
                <option value="reviewer">Reviewer</option>
                <option value="specialist">Specialist</option>
              </select>
              <select
                style={{
                  background: '#111827',
                  color: '#f9fafb',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  flex: 1,
                }}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                <option value="claude-opus-4-6">Claude Opus 4.6</option>
                <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
              </select>
            </div>
            <input
              style={{
                background: '#111827',
                color: '#f9fafb',
                border: '1px solid #374151',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 13,
              }}
              placeholder="Description (optional)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                  name.trim() &&
                  createMut.mutate({
                    name: name.trim(),
                    type: type || undefined,
                    model,
                    description: description.trim() || undefined,
                  })
                }
                disabled={createMut.isPending || !name.trim()}
              >
                {createMut.isPending ? 'Creating...' : 'Create Agent'}
              </button>
              {createMut.error && (
                <span style={{ color: '#fca5a5', fontSize: 11 }}>{createMut.error.message}</span>
              )}
            </div>
          </div>
        </div>
      )}

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
                <button
                  style={{
                    background: 'transparent',
                    color: '#6b7280',
                    border: 'none',
                    fontSize: 11,
                    cursor: 'pointer',
                    marginLeft: 'auto',
                  }}
                  onClick={() => {
                    if (confirm(`Delete agent "${agent.name}"?`)) deleteMut.mutate({ id: agent.id })
                  }}
                >
                  Del
                </button>
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
