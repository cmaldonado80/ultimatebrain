'use client'

/**
 * Mission Control — real-time system overview with live activity,
 * agent status, and adaptive recommendations.
 */

import Link from 'next/link'

import { DbErrorBanner } from '../../components/db-error-banner'
import { OrgBadge } from '../../components/ui/org-badge'
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

function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return d.toLocaleDateString()
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

export default function MissionControlPage() {
  const agentsQuery = trpc.agents.list.useQuery({ limit: 500, offset: 0 })
  const ticketsQuery = trpc.tickets.list.useQuery(
    { limit: 20, offset: 0 },
    { refetchInterval: 5000 },
  )
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
          <div className="text-lg font-orbitron">Loading Mission Control...</div>
        </div>
      </div>
    )
  }

  const agents = (agentsQuery.data ?? []) as Array<{
    id: string
    name: string
    status: string | null
    type: string | null
    model: string | null
  }>
  const tickets = (ticketsQuery.data ?? []) as Array<{
    id: string
    title: string
    status: string
    priority: string | null
    assignedAgentId: string | null
    createdAt: Date
    updatedAt: Date
  }>
  const cronJobs = (cronQuery.data ?? []) as Array<{ id: string; status: string }>
  const workspaces = (workspacesQuery.data ?? []) as Array<{ id: string }>
  const sessions = (sessionsQuery.data ?? []) as Array<{ id: string }>

  const agentsByStatus = {
    idle: agents.filter((a) => a.status === 'idle').length,
    executing: agents.filter((a) => a.status === 'executing' || a.status === 'planning').length,
    error: agents.filter((a) => a.status === 'error').length,
  }

  const inProgress = tickets.filter((t) => t.status === 'in_progress')
  const recentlyDone = tickets.filter((t) => t.status === 'done').slice(0, 5)
  const activeAgents = agents.filter((a) => a.status === 'executing' || a.status === 'planning')
  const activeCrons = cronJobs.filter((j) => j.status === 'active').length

  return (
    <div className="p-6 text-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="m-0 text-2xl font-bold font-orbitron flex items-center gap-2">
            Mission Control <OrgBadge />
          </h2>
          <p className="mt-1 mb-0 text-xs text-slate-500">Real-time overview of all systems</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="neon-dot neon-dot-green animate-pulse" />
          <span className="text-xs text-slate-500">Live</span>
          {timeOfDayQuery.data && (
            <span className="cyber-badge text-[9px] bg-neon-teal/10 text-neon-teal border-neon-teal/20 ml-2">
              {timeOfDayQuery.data.timeOfDay}
            </span>
          )}
        </div>
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

      {/* Agents at Work */}
      {activeAgents.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-orbitron text-white mb-3">Agents at Work</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeAgents.map((agent) => {
              const agentTicket = tickets.find(
                (t) => t.assignedAgentId === agent.id && t.status === 'in_progress',
              )
              return (
                <div key={agent.id} className="cyber-card p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="neon-dot neon-dot-green animate-pulse" />
                    <span className="text-sm font-medium text-slate-200">{agent.name}</span>
                    <span className="cyber-badge text-[9px] text-neon-blue border-neon-blue/20">
                      {agent.status}
                    </span>
                  </div>
                  {agentTicket && (
                    <div className="text-xs text-slate-400 truncate">{agentTicket.title}</div>
                  )}
                  <div className="text-[10px] text-slate-600 mt-1">
                    {agent.model ?? 'no model'} &middot; {agent.type ?? 'agent'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Live Activity + Recent Completed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Live Activity */}
        <div className="cyber-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="neon-dot neon-dot-blue animate-pulse" />
            <h3 className="text-sm font-orbitron text-white">Live Activity</h3>
          </div>
          {inProgress.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">
              No tasks in progress. Agents are waiting for work.
            </div>
          ) : (
            <div className="space-y-2">
              {inProgress.map((t) => {
                const assignedAgent = agents.find((a) => a.id === t.assignedAgentId)
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 py-1.5 border-b border-border-dim last:border-0"
                  >
                    <div className="neon-dot neon-dot-green animate-pulse" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-200 truncate">{t.title}</div>
                      <div className="text-[10px] text-slate-500">
                        {assignedAgent ? assignedAgent.name : 'Unassigned'} &middot;{' '}
                        {timeAgo(t.updatedAt)}
                      </div>
                    </div>
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
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recently Completed */}
        <div className="cyber-card p-4">
          <h3 className="text-sm font-orbitron text-white mb-3">Recently Completed</h3>
          {recentlyDone.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">No completed tasks yet.</div>
          ) : (
            <div className="space-y-2">
              {recentlyDone.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 py-1.5 border-b border-border-dim last:border-0"
                >
                  <span className="text-neon-green text-xs">&#10003;</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-200 truncate">{t.title}</div>
                  </div>
                  <span className="text-[10px] text-slate-500">{timeAgo(t.updatedAt)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 text-center">
            <Link
              href="/tickets"
              className="text-[10px] text-neon-blue hover:text-neon-blue/80 no-underline"
            >
              View all tickets →
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="cyber-card p-4 mb-6">
        <h3 className="text-sm font-orbitron text-white mb-3">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <Link href="/chat" className="cyber-btn-primary cyber-btn-sm no-underline">
            New Chat
          </Link>
          <Link href="/tickets" className="cyber-btn-secondary cyber-btn-sm no-underline">
            Tickets
          </Link>
          <Link href="/agents" className="cyber-btn-secondary cyber-btn-sm no-underline">
            Agents
          </Link>
          <Link href="/workshop" className="cyber-btn-secondary cyber-btn-sm no-underline">
            Workshop
          </Link>
          <Link href="/intelligence" className="cyber-btn-secondary cyber-btn-sm no-underline">
            Intelligence
          </Link>
          <Link href="/ops/cron" className="cyber-btn-secondary cyber-btn-sm no-underline">
            Cron Jobs
          </Link>
          <Link href="/ops/gateway" className="cyber-btn-secondary cyber-btn-sm no-underline">
            API Costs
          </Link>
        </div>
      </div>

      {/* Adaptive Recommended Panels */}
      {rankedPanelsQuery.data && (
        <div>
          <h3 className="text-sm font-orbitron text-white mb-3">Recommended for You</h3>
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
                <Link
                  key={panel.id}
                  href={PANEL_ROUTES[panel.id] ?? '/'}
                  className="cyber-card p-3 hover:border-neon-teal/40 transition-colors group no-underline"
                >
                  <div className="text-xs font-medium text-slate-200 group-hover:text-neon-teal transition-colors">
                    {panel.label}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">
                    {panel.description}
                  </div>
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
