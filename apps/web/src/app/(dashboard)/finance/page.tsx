'use client'

/**
 * Financial Reports — CFO dashboard for the AI Corporation.
 */

import { LoadingState } from '../../../components/ui/loading-state'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

export default function FinancePage() {
  const reportQuery = trpc.platform.financialReport.useQuery({ days: 30 })

  if (reportQuery.isLoading) return <LoadingState message="Generating Financial Report..." />

  const report = reportQuery.data as {
    period: string
    totalSpent: number
    totalBudget: number
    utilization: number
    departments: Array<{
      entityId: string
      name: string
      domain: string | null
      monthlySpent: number
      monthlyLimit: number | null
      utilization: number
      status: string
    }>
    topSpenders: Array<{ name: string; spent: number }>
    costByModel: Array<{ model: string; spent: number; requests: number }>
    dailyTrend: Array<{ date: string; spent: number }>
  } | null

  if (!report) return <div className="p-6 text-slate-600">No financial data available.</div>

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Financial Reports"
        subtitle={`Corporate spending — ${report.period} period`}
      />

      {/* Summary Stats */}
      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Total Spent"
          value={`$${report.totalSpent.toFixed(2)}`}
          color={report.utilization > 0.8 ? 'red' : 'blue'}
          sub="This month"
        />
        <StatCard
          label="Total Budget"
          value={report.totalBudget > 0 ? `$${report.totalBudget.toFixed(2)}` : 'Unlimited'}
          color="green"
          sub="Monthly allocation"
        />
        <StatCard
          label="Utilization"
          value={`${(report.utilization * 100).toFixed(0)}%`}
          color={report.utilization > 0.8 ? 'red' : report.utilization > 0.5 ? 'yellow' : 'green'}
          sub="Budget used"
        />
        <StatCard
          label="Departments"
          value={report.departments.length}
          color="purple"
          sub="With spending"
        />
      </PageGrid>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Department Spending */}
        <SectionCard title="Department Spending">
          {report.departments.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">
              No department spending data
            </div>
          ) : (
            <div className="space-y-2">
              {report.departments
                .sort((a, b) => b.monthlySpent - a.monthlySpent)
                .map((dept) => (
                  <div key={dept.entityId} className="flex items-center gap-2 text-[11px]">
                    <div className="flex-1">
                      <span className="text-slate-200">{dept.name}</span>
                      {dept.domain && <span className="text-slate-600 ml-1">({dept.domain})</span>}
                    </div>
                    <span className="text-neon-yellow font-mono">
                      ${dept.monthlySpent.toFixed(2)}
                    </span>
                    {dept.monthlyLimit && (
                      <span className="text-slate-600">/ ${dept.monthlyLimit.toFixed(2)}</span>
                    )}
                    <StatusBadge
                      label={dept.status.replace('_', ' ')}
                      color={
                        dept.status === 'over_budget'
                          ? 'red'
                          : dept.status === 'warning'
                            ? 'yellow'
                            : 'green'
                      }
                    />
                  </div>
                ))}
            </div>
          )}
        </SectionCard>

        {/* Cost by Model */}
        <SectionCard title="Cost by Model">
          {report.costByModel.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">No model usage data</div>
          ) : (
            <div className="space-y-2">
              {report.costByModel.map((m) => (
                <div key={m.model} className="flex items-center gap-2 text-[11px]">
                  <span className="text-slate-300 flex-1 font-mono text-[10px]">{m.model}</span>
                  <span className="text-slate-500">{m.requests} req</span>
                  <span className="text-neon-yellow font-mono">${m.spent.toFixed(4)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Daily Trend */}
      <SectionCard title="Daily Spending Trend">
        {report.dailyTrend.length === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">No trend data</div>
        ) : (
          <div>
            <div className="flex items-end gap-1 h-24 mb-2">
              {report.dailyTrend.map((d) => {
                const max = Math.max(...report.dailyTrend.map((x) => x.spent), 0.01)
                const h = Math.max((d.spent / max) * 100, 2)
                return (
                  <div
                    key={d.date}
                    className="flex-1 bg-neon-teal/40 rounded-t"
                    style={{ height: `${h}%` }}
                    title={`${d.date}: $${d.spent.toFixed(4)}`}
                  />
                )
              })}
            </div>
            <div className="flex justify-between text-[8px] text-slate-600">
              <span>{report.dailyTrend[0]?.date}</span>
              <span>{report.dailyTrend[report.dailyTrend.length - 1]?.date}</span>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
