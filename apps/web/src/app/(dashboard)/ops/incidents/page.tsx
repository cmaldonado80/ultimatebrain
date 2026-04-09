'use client'

/**
 * Incidents — healing log entries filtered to failures and critical events.
 */

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 30_000

export default function IncidentsPage() {
  const logsQuery = trpc.healing.healingLog.useQuery({ limit: 100 }, { refetchInterval: REFRESH })

  if (logsQuery.isLoading) return <LoadingState message="Loading Incidents..." />

  const logs = (logsQuery.data ?? []) as Array<{
    action: string
    target: string
    reason: string
    success: boolean
    timestamp: Date
  }>

  const failures = logs.filter((l) => !l.success)
  const recent = logs.slice(0, 50)

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Incidents"
        subtitle="Healing failures and system incidents"
        count={failures.length}
      />

      <SectionCard title={`Failures (${failures.length})`} className="mb-6">
        {failures.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            No failures recorded — all healing actions succeeded.
          </div>
        ) : (
          <div className="space-y-2">
            {failures.map((log, i) => (
              <div
                key={`${log.action}-${i}`}
                className="bg-bg-deep rounded px-3 py-2.5 border border-neon-red/20"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-200 font-medium">{log.action}</span>
                  <StatusBadge label="Failed" color="red" />
                </div>
                <div className="text-[10px] text-slate-500">
                  Target: {log.target} &middot; {log.reason}
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5">
                  {new Date(log.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recent Healing Log">
        <div className="space-y-1.5">
          {recent.map((log, i) => (
            <div
              key={`${log.action}-${log.target}-${i}`}
              className="flex items-center gap-3 bg-bg-deep rounded px-3 py-2 border border-border-dim"
            >
              <StatusBadge
                label={log.success ? 'OK' : 'Fail'}
                color={log.success ? 'green' : 'red'}
              />
              <span className="text-[11px] text-slate-300 flex-1 truncate">{log.action}</span>
              <span className="text-[10px] text-slate-600 truncate max-w-[200px]">
                {log.target}
              </span>
              <span className="text-[10px] text-slate-600 whitespace-nowrap">
                {new Date(log.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
