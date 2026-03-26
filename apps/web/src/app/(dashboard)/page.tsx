'use client'

export const dynamic = 'force-dynamic'

/**
 * Dashboard — Landing page with key system metrics.
 */

import { trpc } from '../../utils/trpc'
import { CyberCard } from '../../components/ui/cyber-card'

export default function DashboardPage() {
  const agentsQuery = trpc.agents.list.useQuery({ limit: 500, offset: 0 })
  const workspacesQuery = trpc.workspaces.list.useQuery({ limit: 100, offset: 0 })
  const healthQuery = trpc.healing.healthCheck.useQuery(undefined, {
    refetchInterval: 30_000,
    retry: false,
  })
  const sessionsQuery = trpc.intelligence.chatSessions.useQuery({ limit: 5 })

  const agentCount = agentsQuery.data?.length ?? 0
  const workspaceCount = workspacesQuery.data?.length ?? 0

  const checks = healthQuery.data?.checks ?? []
  const okCount = checks.filter(
    (c: { status: string }) => c.status === 'pass' || c.status === 'ok',
  ).length
  const healthScore = checks.length > 0 ? Math.round((okCount / checks.length) * 100) : 100
  const healthColor =
    healthScore >= 90 ? 'text-neon-green' : healthScore >= 70 ? 'text-neon-yellow' : 'text-neon-red'
  const healthDot =
    healthScore >= 90
      ? 'neon-dot-green neon-dot-pulse'
      : healthScore >= 70
        ? 'neon-dot-yellow'
        : 'neon-dot-red'

  const sessionCount = sessionsQuery.data?.length ?? 0

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-orbitron font-bold tracking-widest">
          SOLARC<span className="text-neon-blue">.</span>BRAIN
        </h1>
        <p className="text-sm text-slate-500 mt-1">Central Intelligence Core — System Overview</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CyberCard>
          <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">
            Agents
          </div>
          <div className="text-4xl font-orbitron font-bold text-neon-blue">{agentCount}</div>
          <div className="text-xs text-slate-600 mt-1">
            {agentsQuery.isLoading ? (
              <span className="neon-shimmer inline-block w-16 h-3 rounded" />
            ) : (
              'registered agents'
            )}
          </div>
        </CyberCard>

        <CyberCard>
          <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">
            Workspaces
          </div>
          <div className="text-4xl font-orbitron font-bold text-neon-purple">{workspaceCount}</div>
          <div className="text-xs text-slate-600 mt-1">
            {workspacesQuery.isLoading ? (
              <span className="neon-shimmer inline-block w-16 h-3 rounded" />
            ) : (
              'active workspaces'
            )}
          </div>
        </CyberCard>

        <CyberCard>
          <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">
            System Health
          </div>
          <div className="flex items-center gap-3">
            <span className={`neon-dot ${healthDot}`} />
            <span className={`text-4xl font-orbitron font-bold ${healthColor}`}>
              {healthScore}%
            </span>
          </div>
          <div className="text-xs text-slate-600 mt-1">
            {healthQuery.isLoading ? (
              <span className="neon-shimmer inline-block w-20 h-3 rounded" />
            ) : (
              `${okCount}/${checks.length} checks passing`
            )}
          </div>
        </CyberCard>

        <CyberCard>
          <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">
            Recent Sessions
          </div>
          <div className="text-4xl font-orbitron font-bold text-neon-green">{sessionCount}</div>
          <div className="text-xs text-slate-600 mt-1">
            {sessionsQuery.isLoading ? (
              <span className="neon-shimmer inline-block w-16 h-3 rounded" />
            ) : (
              'chat sessions'
            )}
          </div>
        </CyberCard>
      </div>

      {/* Quick Links */}
      <div className="cyber-grid">
        <CyberCard padding="p-5">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <a
              href="/agents"
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-neon-blue transition-colors no-underline"
            >
              <span className="text-xs opacity-60">⬡</span> Browse Agents
            </a>
            <a
              href="/chat"
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-neon-blue transition-colors no-underline"
            >
              <span className="text-xs opacity-60">◉</span> Open Chat
            </a>
            <a
              href="/workspaces"
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-neon-blue transition-colors no-underline"
            >
              <span className="text-xs opacity-60">▦</span> Manage Workspaces
            </a>
            <a
              href="/ops"
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-neon-blue transition-colors no-underline"
            >
              <span className="text-xs opacity-60">◎</span> Ops Center
            </a>
          </div>
        </CyberCard>
      </div>
    </div>
  )
}
