'use client'

/**
 * Corporation Command Center — the main dashboard for the AI Operating System.
 *
 * Shows: org health, active work, recent notifications, department status,
 * financial summary, and quick actions. This is what the board of directors
 * sees when they open the system.
 */

import Link from 'next/link'

import { DbErrorBanner } from '../../components/db-error-banner'
import { LoadingState } from '../../components/ui/loading-state'
import { PageGrid } from '../../components/ui/page-grid'
import { PageHeader } from '../../components/ui/page-header'
import { SectionCard } from '../../components/ui/section-card'
import { StatCard } from '../../components/ui/stat-card'
import { StatusBadge } from '../../components/ui/status-badge'
import { trpc } from '../../lib/trpc'

export default function CommandCenter() {
  const orgQuery = trpc.org.chart.useQuery()
  const ticketsQuery = trpc.tickets.list.useQuery({ limit: 20, offset: 0 })
  const notifQuery = trpc.platform.notificationUnreadCount.useQuery()
  const heartbeatQuery = trpc.platform.heartbeatStatus.useQuery()

  const org = orgQuery.data
  const tickets = (ticketsQuery.data ?? []) as Array<{
    id: string
    title: string
    status: string
    priority: string
    assignedAgentId: string | null
  }>
  const unreadNotifs = (notifQuery.data as { count: number } | undefined)?.count ?? 0
  const heartbeats = (heartbeatQuery.data ?? []) as Array<{
    entityId: string
    name: string
    status: string
    failCount: number
  }>

  if (orgQuery.isLoading) return <LoadingState message="Loading Corporation..." />
  if (orgQuery.error) return <DbErrorBanner error={{ message: orgQuery.error.message }} />

  const inProgress = tickets.filter((t) => t.status === 'in_progress').length
  const queued = tickets.filter((t) => t.status === 'queued' || t.status === 'backlog').length
  const done = tickets.filter((t) => t.status === 'done').length
  const healthyDepts = heartbeats.filter((h) => h.status === 'active').length
  const degradedDepts = heartbeats.filter((h) => h.status === 'degraded').length

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title={org?.corporation.name ?? 'Solarc Brain'}
        subtitle={org?.corporation.mission ?? 'AI Corporation Operating System'}
      />

      {/* Key Metrics */}
      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Departments"
          value={org?.stats.totalDepartments ?? 0}
          color="purple"
          sub={`${healthyDepts} healthy${degradedDepts > 0 ? `, ${degradedDepts} degraded` : ''}`}
        />
        <StatCard
          label="Employees"
          value={org?.stats.totalEmployees ?? 0}
          color="blue"
          sub={`${org?.stats.activeEmployees ?? 0} active`}
        />
        <StatCard
          label="Active Work"
          value={inProgress}
          color="yellow"
          sub={`${queued} queued, ${done} done`}
        />
        <StatCard
          label="Notifications"
          value={unreadNotifs}
          color={unreadNotifs > 0 ? 'red' : 'green'}
          sub={unreadNotifs > 0 ? 'Needs attention' : 'All clear'}
        />
      </PageGrid>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Active Work */}
        <SectionCard title="Active Work">
          {tickets.filter((t) => t.status === 'in_progress').length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">No active tasks</div>
          ) : (
            <div className="space-y-1">
              {tickets
                .filter((t) => t.status === 'in_progress')
                .slice(0, 8)
                .map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-[10px]">
                    <StatusBadge
                      label={t.priority}
                      color={
                        t.priority === 'critical'
                          ? 'red'
                          : t.priority === 'high'
                            ? 'yellow'
                            : 'slate'
                      }
                    />
                    <span className="text-slate-300 truncate flex-1">{t.title}</span>
                  </div>
                ))}
            </div>
          )}
          <Link
            href="/board"
            className="text-[9px] text-neon-teal hover:underline mt-2 block no-underline"
          >
            View Project Board →
          </Link>
        </SectionCard>

        {/* Department Health */}
        <SectionCard title="Department Health">
          {org?.departments.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">
              <Link href="/onboarding" className="text-neon-teal hover:underline no-underline">
                Create your first department →
              </Link>
            </div>
          ) : (
            <div className="space-y-1">
              {org?.departments.slice(0, 8).map((dept) => (
                <div key={dept.id} className="flex items-center gap-2 text-[10px]">
                  <StatusBadge
                    label={dept.status}
                    color={
                      dept.status === 'active'
                        ? 'green'
                        : dept.status === 'degraded'
                          ? 'yellow'
                          : 'slate'
                    }
                  />
                  <span className="text-slate-300 flex-1">{dept.name}</span>
                  <span className="text-slate-600">{dept.employees.length} agents</span>
                </div>
              ))}
            </div>
          )}
          <Link
            href="/org-chart"
            className="text-[9px] text-neon-teal hover:underline mt-2 block no-underline"
          >
            View Org Chart →
          </Link>
        </SectionCard>

        {/* Quick Actions */}
        <SectionCard title="Quick Actions">
          <div className="space-y-2">
            <Link
              href="/onboarding"
              className="block bg-bg-deep rounded px-3 py-2 text-[11px] text-slate-300 hover:bg-bg-elevated transition-colors no-underline"
            >
              🏢 Add New Department
            </Link>
            <Link
              href="/chat"
              className="block bg-bg-deep rounded px-3 py-2 text-[11px] text-slate-300 hover:bg-bg-elevated transition-colors no-underline"
            >
              💬 Chat with an Agent
            </Link>
            <Link
              href="/board"
              className="block bg-bg-deep rounded px-3 py-2 text-[11px] text-slate-300 hover:bg-bg-elevated transition-colors no-underline"
            >
              📋 View Project Board
            </Link>
            <Link
              href="/products"
              className="block bg-bg-deep rounded px-3 py-2 text-[11px] text-slate-300 hover:bg-bg-elevated transition-colors no-underline"
            >
              📦 View Products
            </Link>
            <Link
              href="/finance"
              className="block bg-bg-deep rounded px-3 py-2 text-[11px] text-slate-300 hover:bg-bg-elevated transition-colors no-underline"
            >
              💰 Financial Report
            </Link>
            <Link
              href="/notifications"
              className="block bg-bg-deep rounded px-3 py-2 text-[11px] text-slate-300 hover:bg-bg-elevated transition-colors no-underline"
            >
              🔔 Notifications{' '}
              {unreadNotifs > 0 && <span className="text-neon-red">({unreadNotifs})</span>}
            </Link>
          </div>
        </SectionCard>
      </div>

      {/* Products */}
      <SectionCard title="Corporation Products" className="mb-6">
        {(org?.stats.totalProducts ?? 0) === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">
            No products yet. The corporation hasn&apos;t built any apps.
          </div>
        ) : (
          <div className="space-y-1">
            {org?.departments
              .flatMap((d) => d.products)
              .slice(0, 8)
              .map((prod) => (
                <Link
                  key={prod.id}
                  href={`/domain/${prod.id}`}
                  className="flex items-center gap-2 text-[10px] hover:bg-bg-elevated rounded px-2 py-1 no-underline"
                >
                  <StatusBadge
                    label={prod.status}
                    color={prod.status === 'active' ? 'green' : 'yellow'}
                  />
                  <span className="text-slate-300">{prod.name}</span>
                  <span className="text-slate-600">{prod.domain}</span>
                </Link>
              ))}
          </div>
        )}
        <Link
          href="/products"
          className="text-[9px] text-neon-teal hover:underline mt-2 block no-underline"
        >
          View All Products →
        </Link>
      </SectionCard>
    </div>
  )
}
