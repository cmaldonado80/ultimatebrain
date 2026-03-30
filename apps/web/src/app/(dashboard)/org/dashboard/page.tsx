'use client'

/**
 * Org Dashboard — "I am operating this organization"
 * Shows resource counts, recent members, incidents, and audit events.
 */

import Link from 'next/link'

import { OrgBadge } from '../../../../components/ui/org-badge'
import { PermissionGate } from '../../../../components/ui/permission-gate'
import { useActiveOrg } from '../../../../hooks/use-active-org'
import { trpc } from '../../../../utils/trpc'

// ── Stat Card ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  href,
  color = 'teal',
}: {
  label: string
  value: number | string
  href: string
  color?: 'teal' | 'blue' | 'green' | 'yellow' | 'red'
}) {
  const colorMap = {
    teal: 'text-neon-teal',
    blue: 'text-neon-blue',
    green: 'text-neon-green',
    yellow: 'text-neon-yellow',
    red: 'text-neon-red',
  }
  return (
    <Link
      href={href}
      className="cyber-card p-4 no-underline hover:border-white/15 transition-colors block"
    >
      <div className={`text-3xl font-bold font-mono ${colorMap[color]} mb-1`}>{value}</div>
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div>
    </Link>
  )
}

// ── Page ────────────────────────────────────────────────────────────────

export default function OrgDashboardPage() {
  const { activeOrg, isLoading: orgLoading } = useActiveOrg()

  const membersQuery = trpc.organizations.getMembers.useQuery(
    { organizationId: activeOrg?.id ?? '' },
    { enabled: !!activeOrg?.id, staleTime: 30_000 },
  )
  const runtimesQuery = trpc.runtimes.getRuntimes.useQuery(undefined, { staleTime: 30_000 })
  const workspacesQuery = trpc.workspaces.list.useQuery(
    { limit: 100, offset: 0 },
    { staleTime: 30_000 },
  )
  const incidentsQuery = trpc.alerting.getActiveIncidents.useQuery(undefined, {
    refetchInterval: 30_000,
  })
  const auditQuery = trpc.governance.getAuditEvents.useQuery({ limit: 5 }, { staleTime: 30_000 })

  if (orgLoading) {
    return <div className="p-6 text-slate-500 text-sm font-mono">Loading organization...</div>
  }

  if (!activeOrg) {
    return (
      <div className="p-6 text-slate-400">
        <p className="text-sm">
          No active organization.{' '}
          <Link href="/org" className="text-neon-teal hover:underline">
            Set one up
          </Link>
          .
        </p>
      </div>
    )
  }

  const members = membersQuery.data ?? []
  const runtimes = runtimesQuery.data ?? []
  const workspaces = workspacesQuery.data ?? []
  const activeIncidents = incidentsQuery.data ?? []
  const auditEvents = auditQuery.data ?? []

  return (
    <div className="p-6 max-w-[1100px] text-slate-50">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h2 className="m-0 text-[22px] font-bold font-orbitron">{activeOrg.name}</h2>
        <OrgBadge />
        <span className="text-[10px] text-slate-500 font-mono ml-1">/{activeOrg.slug}</span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Members"
          value={membersQuery.isLoading ? '…' : members.length}
          href="/org/members"
          color="teal"
        />
        <StatCard
          label="Runtimes"
          value={runtimesQuery.isLoading ? '…' : runtimes.length}
          href="/runtimes"
          color="blue"
        />
        <StatCard
          label="Workspaces"
          value={workspacesQuery.isLoading ? '…' : workspaces.length}
          href="/workspaces"
          color="green"
        />
        <StatCard
          label="Active Incidents"
          value={incidentsQuery.isLoading ? '…' : activeIncidents.length}
          href="/ops/incidents"
          color={activeIncidents.length > 0 ? 'red' : 'teal'}
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          {/* Recent Members */}
          <div className="cyber-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[12px] font-bold text-slate-400 uppercase tracking-wide">
                Members
              </div>
              <Link href="/org/members" className="text-[10px] text-neon-teal hover:underline">
                Manage →
              </Link>
            </div>
            {membersQuery.isLoading ? (
              <div className="text-[11px] text-slate-600">Loading...</div>
            ) : members.length === 0 ? (
              <div className="text-[11px] text-slate-600">No members yet.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {members.slice(0, 5).map((m) => (
                  <div key={m.id} className="flex items-center gap-2 py-1">
                    <div className="w-6 h-6 rounded-full bg-neon-teal/10 border border-neon-teal/20 flex items-center justify-center text-[9px] text-neon-teal font-bold">
                      {(m.name ?? m.email).charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[12px] text-slate-300 flex-1 truncate">
                      {m.name ?? m.email}
                    </span>
                    <span className="text-[9px] text-slate-600 font-mono">{m.role}</span>
                  </div>
                ))}
                {members.length > 5 && (
                  <div className="text-[10px] text-slate-600 mt-1">+{members.length - 5} more</div>
                )}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="cyber-card p-4">
            <div className="text-[12px] font-bold text-slate-400 uppercase tracking-wide mb-3">
              Quick Actions
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/runtimes"
                className="cyber-btn text-[11px] text-center no-underline py-2"
              >
                Runtimes
              </Link>
              <Link
                href="/workspaces"
                className="cyber-btn text-[11px] text-center no-underline py-2"
              >
                Workspaces
              </Link>
              <PermissionGate require="operator">
                <Link
                  href="/ops/deployments"
                  className="cyber-btn text-[11px] text-center no-underline py-2"
                >
                  Deployments
                </Link>
              </PermissionGate>
              <PermissionGate require="operator">
                <Link
                  href="/builder"
                  className="cyber-btn text-[11px] text-center no-underline py-2"
                >
                  Builder
                </Link>
              </PermissionGate>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Active Incidents */}
          <div className="cyber-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[12px] font-bold text-slate-400 uppercase tracking-wide">
                Active Incidents
              </div>
              <Link href="/ops/incidents" className="text-[10px] text-neon-teal hover:underline">
                View all →
              </Link>
            </div>
            {incidentsQuery.isLoading ? (
              <div className="text-[11px] text-slate-600">Loading...</div>
            ) : activeIncidents.length === 0 ? (
              <div className="text-[11px] text-neon-green/60">No active incidents ✓</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {activeIncidents
                  .slice(0, 3)
                  .map(
                    (inc: {
                      id: string
                      serviceName: string
                      message?: string | null
                      severity?: string
                    }) => (
                      <div
                        key={inc.id}
                        className="flex items-center gap-2 py-1 border-b border-white/5 last:border-0"
                      >
                        <span className="text-neon-red text-[10px]">⚡</span>
                        <span className="text-[11px] text-slate-300 flex-1 truncate">
                          {inc.message ?? inc.serviceName}
                        </span>
                        {inc.severity && (
                          <span className="text-[9px] text-slate-600 font-mono">
                            {inc.severity}
                          </span>
                        )}
                      </div>
                    ),
                  )}
              </div>
            )}
          </div>

          {/* Recent Audit Events */}
          <div className="cyber-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[12px] font-bold text-slate-400 uppercase tracking-wide">
                Recent Activity
              </div>
              <Link href="/audit" className="text-[10px] text-neon-teal hover:underline">
                Audit log →
              </Link>
            </div>
            {auditQuery.isLoading ? (
              <div className="text-[11px] text-slate-600">Loading...</div>
            ) : auditEvents.length === 0 ? (
              <div className="text-[11px] text-slate-600">No recent activity.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {auditEvents
                  .slice(0, 5)
                  .map((ev: { id: string; action: string; createdAt: Date | string }) => (
                    <div key={ev.id} className="flex items-center gap-2 py-0.5">
                      <span className="text-[9px] text-neon-blue/60 font-mono w-4">◆</span>
                      <span className="text-[11px] text-slate-400 flex-1 truncate font-mono">
                        {ev.action}
                      </span>
                      <span className="text-[9px] text-slate-600 font-mono">
                        {new Date(ev.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer settings link */}
      <PermissionGate require="admin">
        <div className="mt-6 text-center">
          <Link
            href="/org"
            className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
          >
            Organization Settings →
          </Link>
        </div>
      </PermissionGate>
    </div>
  )
}
