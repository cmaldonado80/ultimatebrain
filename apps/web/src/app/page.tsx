'use client'

/**
 * Home Dashboard — stat cards, sparklines, progress rings, recent activity
 * Data is fetched from tRPC endpoints.
 */

import { trpc } from '../utils/trpc'

// ── Types ─────────────────────────────────────────────────────────────────

/** Row shape returned by `trpc.tickets.list` (drizzle `tickets` table select) */
interface Ticket {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  complexity: string
  executionMode: string | null
  workspaceId: string | null
  assignedAgentId: string | null
  projectId: string | null
  dagId: string | null
  dagNodeType: string | null
  metadata: unknown
  result: string | null
  createdAt: Date
  updatedAt: Date
}

/** Row shape returned by `trpc.agents.list` (drizzle `agents` table select) */
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

/** Row shape returned by `trpc.workspaces.list` (drizzle `workspaces` table select) */
interface Workspace {
  id: string
  name: string
  type: string | null
  goal: string | null
  color: string | null
  icon: string | null
  autonomyLevel: number | null
  settings: unknown
  createdAt: Date
  updatedAt: Date
}

interface TopologyEntry {
  name: string
  tier: 'brain'
  children: number
}

interface StatCardData {
  label: string
  value: string
  change?: { value: number; label: string }
  sparkline?: number[]
  color: string
}

interface RecentItem {
  id: string
  type: 'ticket' | 'agent' | 'incident' | 'flow'
  title: string
  subtitle: string
  time: string
  status: string
  statusColor: string
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────

function Sparkline({
  data,
  color,
  width = 80,
  height = 24,
}: {
  data: number[]
  color: string
  width?: number
  height?: number
}) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((v - min) / range) * height
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Progress Ring ─────────────────────────────────────────────────────────

// ProgressRing removed (unused)

// ── Stat Card ─────────────────────────────────────────────────────────────

function StatCard({ stat }: { stat: StatCardData }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statTop}>
        <div>
          <div style={styles.statValue}>{stat.value}</div>
          <div style={styles.statLabel}>{stat.label}</div>
        </div>
        {stat.sparkline && <Sparkline data={stat.sparkline} color={stat.color} />}
      </div>
      {stat.change && (
        <div
          style={{ ...styles.statChange, color: stat.change.value >= 0 ? '#4ade80' : '#f87171' }}
        >
          {stat.change.value >= 0 ? '↑' : '↓'} {Math.abs(stat.change.value)} {stat.change.label}
        </div>
      )}
    </div>
  )
}

// ── Helper: format relative time ──────────────────────────────────────────

function timeAgo(date: Date | string): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diffMs = now - then
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const agentsQuery = trpc.agents.list.useQuery({ limit: 100, offset: 0 })
  const ticketsQuery = trpc.tickets.list.useQuery()
  const workspacesQuery = trpc.workspaces.list.useQuery({ limit: 100, offset: 0 })
  const healthQuery = trpc.healing.healthCheck.useQuery()

  const isLoading =
    agentsQuery.isLoading ||
    ticketsQuery.isLoading ||
    workspacesQuery.isLoading ||
    healthQuery.isLoading
  const error =
    agentsQuery.error || ticketsQuery.error || workspacesQuery.error || healthQuery.error

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
          <div style={{ fontSize: 13 }}>Fetching dashboard data</div>
        </div>
      </div>
    )
  }

  const agents = (agentsQuery.data as Agent[]) ?? []
  const tickets = (ticketsQuery.data as Ticket[]) ?? []
  const workspacesData = (workspacesQuery.data as Workspace[]) ?? []

  const activeAgents = agents.length
  const openTickets = tickets.filter(
    (t: Ticket) => t.status !== 'done' && t.status !== 'cancelled',
  ).length

  const STATS: StatCardData[] = [
    { label: 'Active Agents', value: String(activeAgents), color: '#818cf8' },
    { label: 'Open Tickets', value: String(openTickets), color: '#f97316' },
    { label: 'Total Tickets', value: String(tickets.length), color: '#22c55e' },
    { label: 'Workspaces', value: String(workspacesData.length), color: '#eab308' },
  ]

  // Build recent activity from tickets
  const RECENT: RecentItem[] = tickets
    .slice()
    .sort(
      (a: Ticket, b: Ticket) =>
        new Date(b.updatedAt ?? b.createdAt).getTime() -
        new Date(a.updatedAt ?? a.createdAt).getTime(),
    )
    .slice(0, 6)
    .map((t: Ticket) => ({
      id: t.id,
      type: 'ticket' as const,
      title: t.title ?? `Ticket ${t.id.slice(0, 8)}`,
      subtitle: t.priority ? `Priority: ${t.priority}` : 'No priority set',
      time: timeAgo(t.updatedAt ?? t.createdAt),
      status: t.status ?? 'unknown',
      statusColor:
        t.status === 'done'
          ? '#22c55e'
          : t.status === 'in_progress'
            ? '#818cf8'
            : t.status === 'failed'
              ? '#ef4444'
              : '#f97316',
    }))

  const healthData = healthQuery.data as
    | { status?: string; checks?: Record<string, { status: string }> }
    | undefined
  const ENGINES_HEALTH = healthData?.checks
    ? Object.entries(healthData.checks).map(([name, check]) => ({
        name,
        status: check.status === 'ok' ? 'healthy' : check.status,
        rpm: 0,
      }))
    : [
        { name: 'LLM Gateway', status: healthData?.status || 'unknown', rpm: 0 },
        { name: 'Memory', status: healthData?.status || 'unknown', rpm: 0 },
        { name: 'Orchestration', status: healthData?.status || 'unknown', rpm: 0 },
        { name: 'A2A Protocol', status: healthData?.status || 'unknown', rpm: 0 },
        { name: 'Guardrails', status: healthData?.status || 'unknown', rpm: 0 },
        { name: 'Self-Healing', status: healthData?.status || 'unknown', rpm: 0 },
        { name: 'Eval', status: healthData?.status || 'unknown', rpm: 0 },
        { name: 'MCP', status: healthData?.status || 'unknown', rpm: 0 },
      ]

  const TOPOLOGY: TopologyEntry[] = workspacesData.slice(0, 5).map((ws: Workspace) => ({
    name: ws.name ?? `Workspace ${ws.id.slice(0, 8)}`,
    tier: 'brain' as const,
    children: agents.filter((a: Agent) => a.workspaceId === ws.id).length,
  }))

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Brain Dashboard</h2>
        <p style={styles.subtitle}>Central Intelligence Core — Solarc v4</p>
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

      {/* Stat cards */}
      <div style={styles.statsGrid}>
        {STATS.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </div>

      {/* Three-column bottom section */}
      <div style={styles.bottomGrid}>
        {/* Recent Activity */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>Recent Activity</div>
          {RECENT.length === 0 ? (
            <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: 20 }}>
              No recent activity
            </div>
          ) : (
            RECENT.map((item) => (
              <div key={item.id} style={styles.activityRow}>
                <div style={styles.activityMain}>
                  <div style={styles.activityTitle}>{item.title}</div>
                  <div style={styles.activitySub}>{item.subtitle}</div>
                </div>
                <div style={styles.activityRight}>
                  <span style={{ ...styles.activityStatus, color: item.statusColor }}>
                    {item.status}
                  </span>
                  <span style={styles.activityTime}>{item.time}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Engine Health */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>Engine Health</div>
          {ENGINES_HEALTH.map((e) => (
            <div key={e.name} style={styles.engineRow}>
              <span
                style={{
                  ...styles.engineDot,
                  background: e.status === 'healthy' ? '#22c55e' : '#f97316',
                }}
              />
              <span style={styles.engineName}>{e.name}</span>
            </div>
          ))}
        </div>

        {/* Entity Topology */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>Entity Topology</div>
          {TOPOLOGY.length === 0 ? (
            <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: 20 }}>
              No workspaces found
            </div>
          ) : (
            TOPOLOGY.map((entity: TopologyEntry) => (
              <div key={entity.name} style={styles.topoRow}>
                <span style={styles.topoConnector}>◆</span>
                <span style={styles.topoName}>{entity.name}</span>
                <span style={styles.topoBadge}>Workspace</span>
                <span style={styles.topoChildren}>{entity.children} agents</span>
              </div>
            ))
          )}
          <div style={styles.topoSummary}>
            {workspacesData.length} workspace{workspacesData.length !== 1 ? 's' : ''} ·{' '}
            {agents.length} total agents
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb' },
  header: { marginBottom: 20 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  // Stats
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 },
  statCard: { background: '#1f2937', borderRadius: 8, padding: 14, border: '1px solid #374151' },
  statTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  statValue: { fontSize: 22, fontWeight: 700 },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  statChange: { fontSize: 11 },
  // Bottom
  bottomGrid: { display: 'grid', gridTemplateColumns: '1fr 280px 280px', gap: 12 },
  panel: { background: '#1f2937', borderRadius: 8, padding: 16, border: '1px solid #374151' },
  panelHeader: {
    fontSize: 11,
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 12,
  },
  // Activity
  activityRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #111827',
    gap: 12,
  },
  activityMain: { flex: 1 },
  activityTitle: { fontSize: 13, fontWeight: 600 },
  activitySub: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  activityRight: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  activityStatus: { fontSize: 11, fontWeight: 600 },
  activityTime: { fontSize: 10, color: '#4b5563' },
  // Engines
  engineRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 12 },
  engineDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  engineName: { flex: 1 },
  engineRpm: { color: '#6b7280', fontSize: 11 },
  // Topology
  topoRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', fontSize: 12 },
  topoConnector: { color: '#4b5563', fontFamily: 'monospace', width: 20 },
  topoName: { flex: 1, fontWeight: 600 },
  topoBadge: {
    fontSize: 10,
    background: '#1e3a5f',
    color: '#93c5fd',
    padding: '1px 5px',
    borderRadius: 4,
  },
  topoChildren: { fontSize: 10, color: '#6b7280' },
  topoSummary: { marginTop: 12, fontSize: 11, color: '#4b5563', textAlign: 'center' as const },
}
