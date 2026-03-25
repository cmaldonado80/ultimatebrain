'use client'

/**
 * Projects — list all projects from the database.
 */

import { useState } from 'react'
import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

interface Project {
  id: string
  name: string
  goal: string | null
  status: string
  deadline: Date | null
  healthScore: number | null
  healthDiagnosis: string | null
  synthesis: string | null
  cancelled: boolean | null
  createdAt: Date
  updatedAt: Date
}

const STATUS_COLORS: Record<string, string> = {
  planning: '#eab308',
  active: '#22c55e',
  completed: '#818cf8',
  cancelled: '#ef4444',
}

export default function ProjectsPage() {
  const [showForm, setShowForm] = useState(false)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [search, setSearch] = useState('')
  const { data, isLoading, error } = trpc.projects.list.useQuery({ limit: 100, offset: 0 })

  const utils = trpc.useUtils()
  const createMut = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate()
      setShowForm(false)
      setName('')
      setGoal('')
    },
  })

  if (error) {
    return (
      <div style={styles.page}>
        <DbErrorBanner error={error} />
      </div>
    )
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
          <div style={{ fontSize: 13 }}>Fetching projects</div>
        </div>
      </div>
    )
  }

  const allProjects: Project[] = (data as Project[]) ?? []
  const projects = search
    ? allProjects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : allProjects

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={styles.title}>Projects ({allProjects.length})</h2>
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
            {showForm ? 'Cancel' : '+ New Project'}
          </button>
        </div>
        <p style={styles.subtitle}>
          Organize agents, tickets, and resources into scoped project groups.
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
        placeholder="Search projects..."
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
              placeholder="Project name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
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
                  createMut.mutate({ name: name.trim(), goal: goal.trim() || undefined })
                }
                disabled={createMut.isPending || !name.trim()}
              >
                {createMut.isPending ? 'Creating...' : 'Create Project'}
              </button>
              {createMut.error && (
                <span style={{ color: '#fca5a5', fontSize: 11 }}>{createMut.error.message}</span>
              )}
            </div>
          </div>
        </div>
      )}
      {projects.length === 0 ? (
        <div style={styles.empty}>No projects found. Create one to get started.</div>
      ) : (
        <div style={styles.grid}>
          {projects.map((p) => (
            <div key={p.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span
                  style={{
                    ...styles.cardName,
                    cursor: 'pointer',
                    borderBottom: '1px dashed #4b5563',
                  }}
                  onClick={() => setExpandedProject(expandedProject === p.id ? null : p.id)}
                  title="Click to expand"
                >
                  {p.name}
                </span>
                <span
                  style={{
                    ...styles.statusBadge,
                    color: STATUS_COLORS[p.status] || '#6b7280',
                    borderColor: STATUS_COLORS[p.status] || '#6b7280',
                  }}
                >
                  {p.status}
                </span>
              </div>
              {p.goal && <div style={styles.cardGoal}>{p.goal}</div>}
              <div style={styles.cardMeta}>
                {p.deadline && <span>Deadline: {new Date(p.deadline).toLocaleDateString()}</span>}
                {p.healthScore && <span>Health: {p.healthScore}</span>}
              </div>
              {p.synthesis && <div style={styles.synthesis}>{p.synthesis}</div>}
              {expandedProject === p.id && (
                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: '1px solid #374151',
                    fontSize: 12,
                    color: '#9ca3af',
                  }}
                >
                  <div>
                    <strong>ID:</strong> {p.id}
                  </div>
                  {p.healthDiagnosis && (
                    <div style={{ marginTop: 4 }}>
                      <strong>Diagnosis:</strong> {p.healthDiagnosis}
                    </div>
                  )}
                  <div style={{ marginTop: 4 }}>
                    <strong>Created:</strong> {new Date(p.createdAt).toLocaleString()}
                  </div>
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
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 },
  card: { background: '#1f2937', borderRadius: 8, padding: 16, border: '1px solid #374151' },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardName: { fontSize: 15, fontWeight: 700 },
  statusBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    border: '1px solid',
    textTransform: 'uppercase' as const,
  },
  cardGoal: { fontSize: 12, color: '#9ca3af', marginBottom: 8, lineHeight: 1.4 },
  cardMeta: { display: 'flex', gap: 16, fontSize: 11, color: '#6b7280' },
  synthesis: { fontSize: 11, color: '#4b5563', marginTop: 8, fontStyle: 'italic' },
}
