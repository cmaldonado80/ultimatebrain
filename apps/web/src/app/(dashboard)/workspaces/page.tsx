'use client'

/**
 * Workspaces — lifecycle-managed organizational units with bindings and goals.
 */

import { useState } from 'react'
import { trpc } from '../../../utils/trpc'

interface Workspace {
  id: string
  name: string
  type: string | null
  goal: string | null
  color: string | null
  icon: string | null
  autonomyLevel: number | null
  lifecycleState: string
  isSystemProtected: boolean | null
  settings: unknown
  createdAt: Date
  updatedAt: Date
}

interface Binding {
  id: string
  bindingType: string
  bindingKey: string
  enabled: boolean
}

interface Goal {
  id: string
  title: string
  status: string
  priority: number
  targetMetric: string | null
  targetValue: number | null
  currentValue: number | null
}

const LIFECYCLE_COLORS: Record<string, string> = {
  draft: '#6b7280',
  active: '#22c55e',
  paused: '#eab308',
  retired: '#ef4444',
}

const BINDING_ICONS: Record<string, string> = {
  brain: '🧠',
  engine: '⚙️',
  skill: '🔧',
}

export default function WorkspacesPage() {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [goal, setGoal] = useState('')
  const [search, setSearch] = useState('')
  const { data, isLoading, error } = trpc.workspaces.list.useQuery({ limit: 100, offset: 0 })
  const utils = trpc.useUtils()
  const createMut = trpc.workspaces.create.useMutation({
    onSuccess: () => {
      utils.workspaces.list.invalidate()
      setShowForm(false)
      setName('')
      setType('')
      setGoal('')
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
          <div style={{ fontSize: 13 }}>Fetching workspaces</div>
        </div>
      </div>
    )
  }

  const allWorkspaces: Workspace[] = (data as Workspace[]) ?? []
  const workspaces = search
    ? allWorkspaces.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()))
    : allWorkspaces

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={styles.title}>Workspaces ({allWorkspaces.length})</h2>
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
            {showForm ? 'Cancel' : '+ New Workspace'}
          </button>
        </div>
        <p style={styles.subtitle}>
          Lifecycle-managed organizational units with bindings, goals, and execution boundaries.
        </p>
      </div>

      <input
        style={{
          width: '100%',
          background: '#1f2937',
          color: '#f9fafb',
          border: '1px solid #374151',
          borderRadius: 6,
          padding: '8px 12px',
          fontSize: 13,
          boxSizing: 'border-box' as const,
          marginBottom: 16,
        }}
        placeholder="Search workspaces..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

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
              placeholder="Workspace name..."
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
                <option value="development">Development</option>
                <option value="research">Research</option>
                <option value="operations">Operations</option>
                <option value="creative">Creative</option>
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
              placeholder="Goal (optional)..."
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
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
                    type: (type as 'general' | 'development' | 'staging' | 'system') || undefined,
                    goal: goal.trim() || undefined,
                  })
                }
                disabled={createMut.isPending || !name.trim()}
              >
                {createMut.isPending ? 'Creating...' : 'Create Workspace'}
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

      {workspaces.length === 0 ? (
        <div style={styles.empty}>No workspaces found. Create one to get started.</div>
      ) : (
        <div style={styles.grid}>
          {workspaces.map((ws) => (
            <WorkspaceCard key={ws.id} workspace={ws} />
          ))}
        </div>
      )}
    </div>
  )
}

function WorkspaceCard({ workspace: ws }: { workspace: Workspace }) {
  const bindingsQuery = trpc.workspaces.listBindings.useQuery({ workspaceId: ws.id })
  const goalsQuery = trpc.workspaces.listGoals.useQuery({ workspaceId: ws.id })

  const bindings: Binding[] = (bindingsQuery.data as Binding[]) ?? []
  const goals: Goal[] = (goalsQuery.data as Goal[]) ?? []
  const lifecycleColor = LIFECYCLE_COLORS[ws.lifecycleState] || '#6b7280'

  return (
    <div style={styles.card}>
      <div style={styles.cardTop}>
        <span style={styles.cardIcon}>{ws.type === 'system' ? '🔒' : ws.icon || '📁'}</span>
        <span style={styles.cardName}>{ws.name}</span>
        {ws.type === 'system' && (
          <span
            style={{
              fontSize: 10,
              background: '#dc2626',
              color: '#fff',
              padding: '1px 6px',
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            SYSTEM
          </span>
        )}
        <span
          style={{
            ...styles.lifecycleBadge,
            color: lifecycleColor,
            borderColor: lifecycleColor,
          }}
        >
          {ws.lifecycleState}
        </span>
      </div>

      {ws.goal && <div style={styles.cardGoal}>{ws.goal}</div>}

      <div style={styles.cardMeta}>
        {ws.type && <span>{ws.type}</span>}
        <span>Autonomy: {ws.autonomyLevel ?? 1}/5</span>
      </div>

      {bindings.length > 0 && (
        <div style={styles.bindingsSection}>
          <div style={styles.sectionLabel}>Bindings</div>
          <div style={styles.bindingList}>
            {bindings.map((b) => (
              <span
                key={b.id}
                style={{
                  ...styles.bindingTag,
                  opacity: b.enabled ? 1 : 0.5,
                }}
              >
                {BINDING_ICONS[b.bindingType] || '📦'} {b.bindingKey}
              </span>
            ))}
          </div>
        </div>
      )}

      {goals.length > 0 && (
        <div style={styles.goalsSection}>
          <div style={styles.sectionLabel}>Goals</div>
          {goals.slice(0, 3).map((g) => (
            <div key={g.id} style={styles.goalRow}>
              <span style={styles.goalTitle}>{g.title}</span>
              {g.targetMetric && g.targetValue != null && (
                <span style={styles.goalMetric}>
                  {g.currentValue != null ? `${g.currentValue}/${g.targetValue}` : g.targetValue}{' '}
                  {g.targetMetric}
                </span>
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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: 12,
  },
  card: { background: '#1f2937', borderRadius: 8, padding: 16, border: '1px solid #374151' },
  cardTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardIcon: { fontSize: 20 },
  cardName: { fontSize: 15, fontWeight: 700, flex: 1 },
  lifecycleBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    border: '1px solid',
    textTransform: 'uppercase' as const,
  },
  cardGoal: { fontSize: 12, color: '#9ca3af', marginBottom: 8, lineHeight: 1.4 },
  cardMeta: { display: 'flex', gap: 16, fontSize: 11, color: '#6b7280', marginBottom: 8 },
  bindingsSection: { marginTop: 8, paddingTop: 8, borderTop: '1px solid #374151' },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bindingList: { display: 'flex', flexWrap: 'wrap' as const, gap: 4 },
  bindingTag: {
    fontSize: 11,
    background: '#1e1b4b',
    color: '#818cf8',
    padding: '2px 8px',
    borderRadius: 4,
  },
  goalsSection: { marginTop: 8, paddingTop: 8, borderTop: '1px solid #374151' },
  goalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    marginBottom: 2,
  },
  goalTitle: { color: '#d1d5db' },
  goalMetric: { color: '#6b7280', fontSize: 11, fontFamily: 'monospace' },
}
