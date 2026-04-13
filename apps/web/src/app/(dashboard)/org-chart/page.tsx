'use client'

import Link from 'next/link'
/**
 * Corporate Org Chart — The Brain as a Corporation.
 *
 * Visualizes: Corporation → Departments → Employees → Products
 * Shows mission, team roster, performance, and lifecycle management.
 */
import { useState } from 'react'

import { LoadingState } from '../../../components/ui/loading-state'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../lib/trpc'

const ROLE_COLORS: Record<string, 'green' | 'blue' | 'yellow' | 'purple' | 'red' | 'slate'> = {
  department_head: 'green',
  specialist: 'blue',
  monitor: 'yellow',
  healer: 'purple',
  ceo: 'green',
}

const STATUS_COLORS: Record<string, 'green' | 'yellow' | 'red' | 'slate'> = {
  idle: 'green',
  executing: 'blue' as 'green',
  planning: 'yellow',
  reviewing: 'yellow',
  error: 'red',
  offline: 'slate',
}

export default function OrgChartPage() {
  const orgQuery = trpc.org.chart.useQuery()
  const [expandedDept, setExpandedDept] = useState<string | null>(null)
  const [reviewAgent, setReviewAgent] = useState<string | null>(null)

  const reviewQuery = trpc.org.performanceReview.useQuery(
    { agentId: reviewAgent! },
    { enabled: !!reviewAgent },
  )

  const terminateMutation = trpc.org.terminate.useMutation({
    onSuccess: () => orgQuery.refetch(),
  })
  const reactivateMutation = trpc.org.reactivate.useMutation({
    onSuccess: () => orgQuery.refetch(),
  })

  if (orgQuery.isLoading) return <LoadingState message="Loading Organization..." />

  const org = orgQuery.data
  if (!org) return <div className="p-6 text-slate-500">No organizational data available.</div>

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title={org.corporation.name}
        subtitle={org.corporation.mission ?? 'AI Corporation — Autonomous Agent Organization'}
      />

      {/* Stats */}
      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Departments"
          value={org.stats.totalDepartments}
          color="purple"
          sub="Mini Brains"
        />
        <StatCard label="Employees" value={org.stats.totalEmployees} color="blue" sub="Agents" />
        <StatCard
          label="Active"
          value={org.stats.activeEmployees}
          color="green"
          sub="Working now"
        />
        <StatCard
          label="Products"
          value={org.stats.totalProducts}
          color="yellow"
          sub="Development apps"
        />
      </PageGrid>

      {/* Corporation */}
      <SectionCard title="Corporate Structure" className="mb-6">
        <div className="space-y-3">
          {org.departments.map((dept) => {
            const isExpanded = expandedDept === dept.id
            const head = dept.employees.find((e) => e.orgRole === 'department_head')

            return (
              <div key={dept.id} className="cyber-card p-4">
                {/* Department Header */}
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => setExpandedDept(isExpanded ? null : dept.id)}
                >
                  <div className="w-8 h-8 rounded bg-neon-purple/20 flex items-center justify-center text-neon-purple text-sm font-bold">
                    {dept.domain?.charAt(0).toUpperCase() ?? 'D'}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{dept.name}</div>
                    <div className="text-[10px] text-slate-500">
                      {dept.domain ?? 'general'} &middot; {dept.employees.length} employees
                      {dept.products.length > 0 && ` &middot; ${dept.products.length} products`}
                    </div>
                  </div>
                  {head && (
                    <div className="text-[10px] text-slate-400">
                      Head: <span className="text-neon-green">{head.name}</span>
                    </div>
                  )}
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
                  <span className="text-[10px] text-slate-600">{isExpanded ? '▾' : '▸'}</span>
                </div>

                {/* Department Mission */}
                {dept.mission && (
                  <div className="mt-2 ml-11 text-[10px] text-slate-400 italic">
                    Mission: {dept.mission}
                  </div>
                )}

                {/* Expanded: Employee Roster */}
                {isExpanded && (
                  <div className="mt-3 ml-11 space-y-2">
                    {/* Employees */}
                    <div className="text-[10px] text-slate-500 uppercase mb-1">Team Roster</div>
                    {dept.employees.map((emp) => (
                      <div
                        key={emp.id}
                        className="flex items-center gap-2 bg-bg-deep rounded px-3 py-1.5"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/agents/${emp.id}`}
                              className="text-[11px] text-slate-200 hover:text-neon-teal no-underline"
                            >
                              {emp.name}
                            </Link>
                            <StatusBadge
                              label={emp.orgRole.replace('_', ' ')}
                              color={ROLE_COLORS[emp.orgRole] ?? 'slate'}
                            />
                            <StatusBadge
                              label={emp.status}
                              color={STATUS_COLORS[emp.status] ?? 'slate'}
                            />
                          </div>
                          <div className="text-[9px] text-slate-600">
                            {emp.reportsToName ? `Reports to: ${emp.reportsToName}` : 'No manager'}
                            {emp.skills.length > 0 &&
                              ` · Skills: ${emp.skills.slice(0, 3).join(', ')}`}
                            {emp.model && ` · Model: ${emp.model}`}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setReviewAgent(reviewAgent === emp.id ? null : emp.id)
                            }}
                            className="text-[9px] text-slate-500 hover:text-neon-teal"
                          >
                            Review
                          </button>
                          {emp.status === 'offline' ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                reactivateMutation.mutate({ agentId: emp.id })
                              }}
                              className="text-[9px] text-neon-green hover:underline"
                            >
                              Reactivate
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                terminateMutation.mutate({
                                  agentId: emp.id,
                                  reason: 'Manual termination from org chart',
                                })
                              }}
                              className="text-[9px] text-slate-600 hover:text-neon-red"
                            >
                              Terminate
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Performance Review Panel */}
                    {reviewAgent &&
                      dept.employees.some((e) => e.id === reviewAgent) &&
                      reviewQuery.data && (
                        <div className="bg-bg-elevated border border-border-dim rounded p-3 mt-2">
                          <div className="text-[10px] text-slate-500 uppercase mb-2">
                            Performance Review
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-[10px]">
                            <div>
                              <span className="text-slate-500">Total Runs:</span>{' '}
                              <span className="text-slate-300">
                                {(reviewQuery.data as { totalRuns: number }).totalRuns}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500">Success Rate:</span>{' '}
                              <span className="text-slate-300">
                                {(
                                  (reviewQuery.data as { successRate: number }).successRate * 100
                                ).toFixed(0)}
                                %
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500">Avg Duration:</span>{' '}
                              <span className="text-slate-300">
                                {(
                                  (reviewQuery.data as { avgDurationMs: number }).avgDurationMs /
                                  1000
                                ).toFixed(1)}
                                s
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500">Recommendation:</span>{' '}
                              <StatusBadge
                                label={
                                  (reviewQuery.data as { recommendation: string }).recommendation
                                }
                                color={
                                  (reviewQuery.data as { recommendation: string })
                                    .recommendation === 'promote'
                                    ? 'green'
                                    : (reviewQuery.data as { recommendation: string })
                                          .recommendation === 'terminate'
                                      ? 'red'
                                      : 'yellow'
                                }
                              />
                            </div>
                          </div>
                          <div className="text-[9px] text-slate-400 mt-1">
                            {(reviewQuery.data as { reasoning: string }).reasoning}
                          </div>
                        </div>
                      )}

                    {/* Products */}
                    {dept.products.length > 0 && (
                      <>
                        <div className="text-[10px] text-slate-500 uppercase mt-3 mb-1">
                          Products Built
                        </div>
                        {dept.products.map((prod) => (
                          <Link
                            key={prod.id}
                            href={`/domain/${prod.id}`}
                            className="flex items-center gap-2 bg-bg-deep rounded px-3 py-1.5 hover:bg-bg-elevated transition-colors no-underline"
                          >
                            <span className="text-[10px] text-slate-400">└</span>
                            <span className="text-[11px] text-neon-teal">{prod.name}</span>
                            <StatusBadge
                              label={prod.status}
                              color={prod.status === 'active' ? 'green' : 'yellow'}
                            />
                            <span className="text-[9px] text-slate-600 ml-auto">→</span>
                          </Link>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SectionCard>
    </div>
  )
}
