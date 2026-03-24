'use client'

/**
 * Projects — list all projects from the database.
 */

import { trpc } from '../../../utils/trpc'

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
  const { data, isLoading, error } = trpc.projects.list.useQuery({ limit: 100, offset: 0 })

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

  const projects: Project[] = (data as Project[]) ?? []

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Projects</h2>
        <p style={styles.subtitle}>
          Organize agents, tickets, and resources into scoped project groups.
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

      {projects.length === 0 ? (
        <div style={styles.empty}>No projects found. Create one to get started.</div>
      ) : (
        <div style={styles.grid}>
          {projects.map((p) => (
            <div key={p.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.cardName}>{p.name}</span>
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
