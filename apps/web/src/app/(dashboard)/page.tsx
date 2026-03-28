'use client'

/**
 * Dashboard — system overview with key metrics, recent activity, and quick actions.
 */

import { DbErrorBanner } from '../../components/db-error-banner'
import { trpc } from '../../utils/trpc'

const STAT_COLORS: Record<string, string> = {
  'neon-blue': 'text-neon-blue',
  'neon-green': 'text-neon-green',
  'neon-red': 'text-neon-red',
  'neon-purple': 'text-neon-purple',
  'slate-600': 'text-slate-600',
}

function StatCard({
  label,
  value,
  sub,
  color = 'neon-blue',
}: {
  label: string
  value: string | number
  sub?: string
  color?: string
}) {
  return (
    <div className="cyber-card p-4">
      <div className={`text-2xl font-bold font-orbitron ${STAT_COLORS[color] ?? 'text-neon-blue'}`}>
        {value}
      </div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
    </div>
  )
}

const PANEL_ROUTES: Record<string, string> = {
  standup_summary: '/tickets',
  ticket_board: '/tickets',
  agent_status: '/agents',
  ops_health: '/ops/healing',
  approvals: '/ops/approvals',
  security: '/ops/guardrails',
  metrics: '/ops/evals',
  dlq: '/ops/dlq',
  active_flows: '/flows',
  playbooks: '/playbooks',
  memory_graph: '/memory',
  recent_activity: '/ops/traces',
  browser_sessions: '/ops/browser-sessions',
  presence: '/ops/live',
}

export default function DashboardPage() {
  const agentsQuery = trpc.agents.list.useQuery({ limit: 500, offset: 0 })
  const ticketsQuery = trpc.tickets.list.useQuery({ limit: 10, offset: 0 })
  const cronQuery = trpc.orchestration.cronJobs.useQuery()
  const workspacesQuery = trpc.workspaces.list.useQuery({ limit: 100, offset: 0 })
  const sessionsQuery = trpc.intelligence.chatSessions.useQuery()
  const rankedPanelsQuery = trpc.adaptive.defaultRank.useQuery({
    role: 'developer',
    visibleCount: 6,
  })
  const timeOfDayQuery = trpc.adaptive.timeOfDay.useQuery()

  const error = agentsQuery.error || ticketsQuery.error || workspacesQuery.error
  const isLoading = agentsQuery.isLoading

  if (error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">
          <div className="text-lg font-orbitron">Loading Dashboard...</div>
        </div>
      </div>
    )
  }

  const agents = (agentsQuery.data ?? []) as Array<{
    id: string
    name: string
    status: string | null
    type: string | null
  }>
  const tickets = (ticketsQuery.data ?? []) as Array<{
    id: string
    title: string
    status: string
    priority: string | null
    createdAt: Date
  }>
  const cronJobs = (cronQuery.data ?? []) as Array<{ id: string; status: string }>
  const workspaces = (workspacesQuery.data ?? []) as Array<{ id: string }>
  const sessions = (sessionsQuery.data ?? []) as Array<{ id: string }>

  const agentsByStatus = {
    idle: agents.filter((a) => a.status === 'idle').length,
    executing: agents.filter((a) => a.status === 'executing' || a.status === 'planning').length,
    error: agents.filter((a) => a.status === 'error').length,
    offline: agents.filter((a) => a.status === 'offline').length,
  }

  const ticketsByStatus = {
    open: tickets.filter((t) => ['backlog', 'queued', 'in_progress'].includes(t.status)).length,
    review: tickets.filter((t) => t.status === 'review').length,
    done: tickets.filter((t) => t.status === 'done').length,
  }

  const activeCrons = cronJobs.filter((j) => j.status === 'active').length

  return (
    <div className="p-6 text-slate-50">
      <div className="mb-6">
        <h2 className="m-0 text-2xl font-bold font-orbitron">Dashboard</h2>
        <p className="mt-1 mb-0 text-xs text-slate-500">System overview and quick actions</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total Agents" value={agents.length} sub={`${agentsByStatus.idle} idle`} />
        <StatCard
          label="Active Agents"
          value={agentsByStatus.executing}
          color="neon-green"
          sub="executing/planning"
        />
        <StatCard
          label="Error Agents"
          value={agentsByStatus.error}
          color={agentsByStatus.error > 0 ? 'neon-red' : 'slate-600'}
          sub={agentsByStatus.error > 0 ? 'needs attention' : 'all healthy'}
        />
        <StatCard label="Workspaces" value={workspaces.length} color="neon-purple" />
        <StatCard label="Cron Jobs" value={activeCrons} sub={`of ${cronJobs.length} total`} />
        <StatCard label="Chat Sessions" value={sessions.length} color="neon-blue" />
      </div>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Tickets */}
        <div className="cyber-card p-4">
          <h3 className="text-sm font-orbitron text-white mb-3">Recent Tickets</h3>
          {tickets.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">No tickets yet</div>
          ) : (
            <div className="space-y-2">
              {tickets.slice(0, 8).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between py-1.5 border-b border-border-dim last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-200 truncate">{t.title}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    {t.priority && (
                      <span
                        className={`text-[9px] font-mono uppercase ${
                          t.priority === 'critical'
                            ? 'text-neon-red'
                            : t.priority === 'high'
                              ? 'text-neon-yellow'
                              : 'text-slate-500'
                        }`}
                      >
                        {t.priority}
                      </span>
                    )}
                    <span
                      className={`cyber-badge text-[9px] ${
                        t.status === 'done'
                          ? 'text-neon-green border-neon-green/20'
                          : t.status === 'in_progress'
                            ? 'text-neon-blue border-neon-blue/20'
                            : 'text-slate-500 border-slate-500/20'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 text-center">
            <a href="/tickets" className="text-[10px] text-neon-blue hover:text-neon-blue/80">
              View all tickets →
            </a>
          </div>
        </div>

        {/* Ticket Stats */}
        <div className="cyber-card p-4">
          <h3 className="text-sm font-orbitron text-white mb-3">Ticket Summary</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <div className="text-xl font-bold text-neon-yellow">{ticketsByStatus.open}</div>
              <div className="text-[10px] text-slate-500">Open</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-neon-blue">{ticketsByStatus.review}</div>
              <div className="text-[10px] text-slate-500">In Review</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-neon-green">{ticketsByStatus.done}</div>
              <div className="text-[10px] text-slate-500">Done</div>
            </div>
          </div>

          <h3 className="text-sm font-orbitron text-white mb-3 mt-4">Quick Actions</h3>
          <div className="flex flex-wrap gap-2">
            <a href="/chat" className="cyber-btn-primary cyber-btn-sm">
              New Chat
            </a>
            <a href="/tickets" className="cyber-btn-secondary cyber-btn-sm">
              View Tickets
            </a>
            <a href="/agents" className="cyber-btn-secondary cyber-btn-sm">
              Manage Agents
            </a>
            <a href="/ops/cron" className="cyber-btn-secondary cyber-btn-sm">
              Cron Jobs
            </a>
          </div>
        </div>
      </div>

      {/* Adaptive Recommended Panels */}
      {rankedPanelsQuery.data && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-orbitron text-white">Recommended for You</h3>
            {timeOfDayQuery.data && (
              <span className="cyber-badge text-[9px] bg-neon-teal/10 text-neon-teal border-neon-teal/20">
                {timeOfDayQuery.data.timeOfDay}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {(
              rankedPanelsQuery.data as Array<{
                id: string
                label: string
                description: string
                score: number
                isVisible: boolean
                isPinned: boolean
              }>
            )
              .filter((p) => p.isVisible)
              .map((panel) => (
                <a
                  key={panel.id}
                  href={PANEL_ROUTES[panel.id] ?? '/'}
                  className="cyber-card p-3 hover:border-neon-teal/40 transition-colors group"
                >
                  <div className="text-xs font-medium text-slate-200 group-hover:text-neon-teal transition-colors">
                    {panel.label}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">
                    {panel.description}
                  </div>
                  <div className="text-[9px] text-slate-600 mt-1.5">
                    score: {panel.score.toFixed(1)}
                    {panel.isPinned && ' · pinned'}
                  </div>
                </a>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
