'use client'

/**
 * Deployments — deployment workflow status and history.
 */

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

export default function DeploymentsPage() {
  const deploymentsQuery = trpc.deployments.list.useQuery({ limit: 50 })

  if (deploymentsQuery.isLoading) return <LoadingState message="Loading Deployments..." />

  const deployments = (deploymentsQuery.data ?? []) as Array<{
    id: string
    entityId: string
    status: string
    currentStep: string | null
    steps: unknown[]
    createdAt: Date
  }>

  const active = deployments.filter((d) => d.status === 'running').length
  const completed = deployments.filter((d) => d.status === 'completed').length
  const failed = deployments.filter((d) => d.status === 'failed').length

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Deployments"
        subtitle="Deployment workflows, rollouts, and release history"
        count={deployments.length}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="cyber-card p-3">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Total</div>
          <div className="text-lg font-mono text-neon-blue">{deployments.length}</div>
        </div>
        <div className="cyber-card p-3">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Active</div>
          <div className="text-lg font-mono text-neon-yellow">{active}</div>
        </div>
        <div className="cyber-card p-3">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Completed</div>
          <div className="text-lg font-mono text-neon-green">{completed}</div>
        </div>
        <div className="cyber-card p-3">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Failed</div>
          <div className="text-lg font-mono text-neon-red">{failed}</div>
        </div>
      </div>

      <SectionCard title="Deployment Workflows">
        {deployments.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            No deployment workflows found.
          </div>
        ) : (
          <div className="space-y-2">
            {deployments.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 bg-bg-deep rounded px-4 py-2.5 border border-border-dim"
              >
                <StatusBadge
                  label={d.status}
                  color={
                    d.status === 'completed'
                      ? 'green'
                      : d.status === 'running'
                        ? 'blue'
                        : d.status === 'failed'
                          ? 'red'
                          : 'yellow'
                  }
                />
                <div className="flex-1">
                  <div className="text-xs text-slate-200 font-mono">{d.id.slice(0, 12)}</div>
                  <div className="text-[10px] text-slate-500">
                    {d.currentStep ?? 'N/A'} &middot; {(d.steps as unknown[])?.length ?? 0} steps
                    &middot; Entity {d.entityId.slice(0, 8)}
                  </div>
                </div>
                <span className="text-[10px] text-slate-600">
                  {new Date(d.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
