'use client'

/**
 * Agent Routines — Manage recurring automation (cron, webhook, manual triggers).
 */

import { useState } from 'react'

import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

export default function RoutinesPage() {
  const topologyQuery = trpc.entities.topology.useQuery()
  const departments = (topologyQuery.data?.miniBrains ?? []) as Array<{ id: string }>
  const firstWs = departments[0]?.id
  const routinesQuery = trpc.orchestration.routinesList.useQuery(
    { workspaceId: firstWs! },
    { enabled: !!firstWs },
  )
  const utils = trpc.useUtils()
  const dispatchMutation = trpc.orchestration.routineDispatch.useMutation({
    onSuccess: () => utils.orchestration.routinesList.invalidate(),
  })

  const [showHistory, setShowHistory] = useState<string | null>(null)
  const historyQuery = trpc.orchestration.routineHistory.useQuery(
    { routineId: showHistory! },
    { enabled: !!showHistory },
  )

  if (topologyQuery.isLoading) return <LoadingState message="Loading Routines..." />

  const routines = (routinesQuery.data ?? []) as Array<{
    id: string
    name: string
    schedule: string | null
    status: string
    task: string | null
    type: string | null
    agentId: string | null
  }>

  const history = (historyQuery.data ?? []) as Array<{
    status: string
    triggerSource: string
    startedAt: number
    completedAt?: number
    result?: string
    error?: string
  }>

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Agent Routines"
        subtitle="Recurring automation — cron, webhook, and manual triggers"
      />

      <SectionCard title={`Active Routines (${routines.length})`}>
        {routines.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            No routines configured. Create one via the API or agent tools.
          </div>
        ) : (
          <div className="space-y-2">
            {routines.map((r) => (
              <div key={r.id} className="cyber-card p-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{r.name}</div>
                    <div className="text-[10px] text-slate-500">
                      {r.type ?? 'schedule'} &middot; {r.schedule ?? 'manual'} &middot;{' '}
                      {r.task?.slice(0, 80)}
                    </div>
                  </div>
                  <StatusBadge
                    label={r.status}
                    color={r.status === 'active' ? 'green' : 'yellow'}
                  />
                  <button
                    onClick={() => dispatchMutation.mutate({ routineId: r.id })}
                    disabled={dispatchMutation.isPending}
                    className="cyber-btn-primary text-[9px] px-2 py-0.5"
                  >
                    {dispatchMutation.isPending ? '...' : 'Run Now'}
                  </button>
                  <button
                    onClick={() => setShowHistory(showHistory === r.id ? null : r.id)}
                    className="text-[9px] text-slate-500 hover:text-neon-teal"
                  >
                    {showHistory === r.id ? 'Hide' : 'History'}
                  </button>
                </div>

                {showHistory === r.id && (
                  <div className="mt-2 space-y-1">
                    {history.length === 0 ? (
                      <div className="text-[10px] text-slate-600">No run history</div>
                    ) : (
                      history.slice(0, 10).map((h, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-[10px] bg-bg-deep rounded px-2 py-1"
                        >
                          <StatusBadge
                            label={h.status}
                            color={
                              h.status === 'completed'
                                ? 'green'
                                : h.status === 'failed'
                                  ? 'red'
                                  : 'yellow'
                            }
                          />
                          <span className="text-slate-500">{h.triggerSource}</span>
                          <span className="text-slate-600">
                            {new Date(h.startedAt).toLocaleTimeString()}
                          </span>
                          {h.error && (
                            <span className="text-neon-red truncate flex-1">{h.error}</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
