'use client'

/**
 * CEO Dashboard — Executive overview of the AI Corporation.
 *
 * Shows: org stats, department health, recent activity, budget utilization,
 * guardrail risk level, and active routines.
 */

import { LoadingState } from '../../../components/ui/loading-state'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

export default function CeoDashboardPage() {
  const orgQuery = trpc.org.chart.useQuery()
  const heartbeatQuery = trpc.platform.heartbeatStatus.useQuery()
  const guardrailQuery = trpc.evolution.guardrailDiagnostic.useQuery()
  const lifecycleQuery = trpc.org.lifecycleLog.useQuery()

  if (orgQuery.isLoading) return <LoadingState message="Loading Corporation Overview..." />

  const org = orgQuery.data
  const heartbeats = (heartbeatQuery.data ?? []) as Array<{
    entityId: string
    name: string
    status: string
    failCount: number
    lastHealthCheck: Date | null
  }>
  const guardrails = guardrailQuery.data as {
    totalViolations: number
    riskLevel: string
    byCategory: Record<string, { count: number }>
  } | null
  const lifecycle = (lifecycleQuery.data ?? []) as Array<{
    agentName: string
    event: string
    detail: string
    timestamp: number
  }>

  const healthyDepts = heartbeats.filter((h) => h.status === 'active').length
  const degradedDepts = heartbeats.filter((h) => h.status === 'degraded').length

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="CEO Dashboard"
        subtitle={org?.corporation.mission ?? 'Solarc Brain Corporation — Executive Overview'}
      />

      {/* Key Metrics */}
      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Departments"
          value={org?.stats.totalDepartments ?? 0}
          color="purple"
          sub={`${healthyDepts} healthy, ${degradedDepts} degraded`}
        />
        <StatCard
          label="Employees"
          value={org?.stats.totalEmployees ?? 0}
          color="blue"
          sub={`${org?.stats.activeEmployees ?? 0} active`}
        />
        <StatCard
          label="Products"
          value={org?.stats.totalProducts ?? 0}
          color="green"
          sub="Development apps"
        />
        <StatCard
          label="Risk Level"
          value={guardrails?.riskLevel ?? 'safe'}
          color={
            guardrails?.riskLevel === 'critical'
              ? 'red'
              : guardrails?.riskLevel === 'high'
                ? 'red'
                : guardrails?.riskLevel === 'medium'
                  ? 'yellow'
                  : 'green'
          }
          sub={`${guardrails?.totalViolations ?? 0} violations`}
        />
      </PageGrid>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
        {/* Department Health */}
        <SectionCard title="Department Health">
          {org?.departments.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">No departments yet</div>
          ) : (
            <div className="space-y-2">
              {org?.departments.map((dept) => {
                const hb = heartbeats.find((h) => h.entityId === dept.id)
                return (
                  <div key={dept.id} className="flex items-center gap-2 text-[11px]">
                    <div className="w-6 h-6 rounded bg-neon-purple/20 flex items-center justify-center text-neon-purple text-[10px] font-bold">
                      {dept.domain?.charAt(0).toUpperCase() ?? 'D'}
                    </div>
                    <div className="flex-1">
                      <span className="text-slate-200">{dept.name}</span>
                      <span className="text-slate-600 ml-1">({dept.employees.length} agents)</span>
                    </div>
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
                    {hb && hb.failCount > 0 && (
                      <span className="text-[9px] text-neon-red">{hb.failCount} fails</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

        {/* Guardrail Summary */}
        <SectionCard title="Safety & Compliance">
          {guardrails ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div className="bg-bg-deep rounded px-2 py-1.5 text-center">
                  <div className="text-slate-500">Structural</div>
                  <div className="text-lg font-bold text-slate-300">
                    {guardrails.byCategory?.structural?.count ?? 0}
                  </div>
                </div>
                <div className="bg-bg-deep rounded px-2 py-1.5 text-center">
                  <div className="text-slate-500">Content</div>
                  <div className="text-lg font-bold text-neon-yellow">
                    {guardrails.byCategory?.content?.count ?? 0}
                  </div>
                </div>
                <div className="bg-bg-deep rounded px-2 py-1.5 text-center">
                  <div className="text-slate-500">Security</div>
                  <div className="text-lg font-bold text-neon-red">
                    {guardrails.byCategory?.security?.count ?? 0}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-slate-500">
                Total violations: {guardrails.totalViolations} &middot; Risk: {guardrails.riskLevel}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-600 py-4 text-center">No guardrail data</div>
          )}
        </SectionCard>
      </div>

      {/* Recent Lifecycle Events */}
      <SectionCard title="Recent Activity" className="mb-6">
        {lifecycle.length === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">No activity yet</div>
        ) : (
          <div className="space-y-1">
            {lifecycle.slice(0, 20).map((event, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] py-0.5">
                <span className="text-slate-600 w-16">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
                <StatusBadge
                  label={event.event.replace(/_/g, ' ')}
                  color={
                    event.event === 'terminated'
                      ? 'red'
                      : event.event === 'onboarded'
                        ? 'green'
                        : event.event === 'promoted'
                          ? 'purple'
                          : 'blue'
                  }
                />
                <span className="text-slate-300">{event.agentName}</span>
                <span className="text-slate-600 truncate flex-1">{event.detail}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
