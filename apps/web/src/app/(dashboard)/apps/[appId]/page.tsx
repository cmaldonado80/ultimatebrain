'use client'

/**
 * Single App View — detailed dashboard for a connected agent
 *
 * Shows: agent info, model, skills, tags, etc.
 */

import { useParams } from 'next/navigation'
import { trpc } from '../../../../utils/trpc'

/** Row shape returned by `trpc.agents.byId` (drizzle `agents` table select) */
interface AgentRecord {
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


export default function AppDetailPage() {
  const params = useParams()
  const appId = params.appId as string

  const { data: app, isLoading, error } = trpc.agents.byId.useQuery({ id: appId })

  if (isLoading) {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>Loading...</div>
          <div style={{ fontSize: 13 }}>Fetching app details</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: '#f87171' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Error loading app</div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>{error.message}</div>
        </div>
      </div>
    )
  }

  if (!app) {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: '#f87171' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>App not found</div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>No agent with ID {appId}</div>
        </div>
      </div>
    )
  }

  const agent = app as AgentRecord
  const agentName = agent.name ?? `Agent ${appId.slice(0, 8)}`
  const agentType = agent.type ?? 'agent'
  const agentDescription = agent.description ?? ''
  const agentModel = agent.model ?? 'N/A'
  const agentSkills: string[] = agent.skills ?? []
  const agentTags: string[] = agent.tags ?? []

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <a href="/apps" style={styles.back}>← Apps</a>
        <div style={styles.headerMain}>
          <div>
            <h1 style={styles.title}>{agentName}</h1>
            <div style={styles.headerMeta}>
              <span style={styles.tierBadge}>{agentType}</span>
              {agentDescription && <span style={styles.metaText}>{agentDescription}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statBig}>{agentModel}</div>
          <div style={styles.statLabel}>Model</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statBig}>{agentSkills.length}</div>
          <div style={styles.statLabel}>Skills</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statBig}>{agentTags.length}</div>
          <div style={styles.statLabel}>Tags</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statBig}>{agentType}</div>
          <div style={styles.statLabel}>Type</div>
        </div>
      </div>

      <div style={styles.columns}>
        {/* Left: Skills */}
        <div style={styles.colLeft}>
          <div style={styles.section}>
            <div style={styles.sectionHeader}>Skills</div>
            {agentSkills.length === 0 ? (
              <div style={styles.emptyText}>No skills assigned</div>
            ) : (
              agentSkills.map((skill) => (
                <div key={skill} style={styles.engineRow}>
                  <span style={{ ...styles.eDot, background: '#22c55e' }} />
                  <span style={styles.eName}>{skill}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Tags & Details */}
        <div style={styles.colRight}>
          <div style={styles.section}>
            <div style={styles.sectionHeader}>Tags</div>
            {agentTags.length === 0 ? (
              <div style={styles.emptyText}>No tags</div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                {agentTags.map((tag) => (
                  <span key={tag} style={styles.tagChip}>{tag}</span>
                ))}
              </div>
            )}
          </div>

          <div style={styles.section}>
            <div style={styles.sectionHeader}>Details</div>
            <div style={styles.detailRow}>
              <span style={styles.detailKey}>ID:</span>
              <span style={styles.detailVal}>{appId}</span>
            </div>
            {agent.workspaceId && (
              <div style={styles.detailRow}>
                <span style={styles.detailKey}>Workspace:</span>
                <span style={styles.detailVal}>{agent.workspaceId}</span>
              </div>
            )}
            {agent.createdAt && (
              <div style={styles.detailRow}>
                <span style={styles.detailKey}>Created:</span>
                <span style={styles.detailVal}>{new Date(agent.createdAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: { background: '#0f172a', minHeight: '100vh', color: '#f9fafb', fontFamily: 'sans-serif', padding: 24 },
  header: { marginBottom: 20 },
  back: { fontSize: 12, color: '#6b7280', textDecoration: 'none', display: 'block', marginBottom: 8 },
  headerMain: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { margin: '0 0 6px', fontSize: 22, fontWeight: 700 },
  headerMeta: { display: 'flex', gap: 8, alignItems: 'center' },
  tierBadge: { fontSize: 10, background: '#1e3a5f', color: '#93c5fd', padding: '2px 8px', borderRadius: 4, fontWeight: 600 },
  metaText: { fontSize: 12, color: '#6b7280' },
  ring: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', background: '#1f2937', borderRadius: 8, padding: '12px 20px', border: '1px solid #374151' },
  ringValue: { fontSize: 28, fontWeight: 700 },
  ringLabel: { fontSize: 10, color: '#6b7280' },
  // Stats
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 },
  statCard: { background: '#1f2937', borderRadius: 8, padding: 12, textAlign: 'center' as const, border: '1px solid #374151' },
  statBig: { fontSize: 22, fontWeight: 700 },
  statLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  // Columns
  columns: { display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 },
  colLeft: {},
  colRight: {},
  section: { background: '#1f2937', borderRadius: 8, padding: 16, border: '1px solid #374151', marginBottom: 12 },
  sectionHeader: { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 10 },
  // Engine rows
  engineRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #111827', fontSize: 12 },
  eDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  eName: { flex: 1, fontWeight: 600 },
  // Tags
  tagChip: { fontSize: 11, background: '#374151', borderRadius: 4, padding: '2px 8px', color: '#9ca3af' },
  // Details
  detailRow: { display: 'flex', gap: 8, padding: '4px 0', fontSize: 12, borderBottom: '1px solid #111827' },
  detailKey: { color: '#6b7280', minWidth: 80 },
  detailVal: { color: '#d1d5db', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' as const },
  emptyText: { fontSize: 12, color: '#4b5563', textAlign: 'center' as const, padding: 16 },
}
