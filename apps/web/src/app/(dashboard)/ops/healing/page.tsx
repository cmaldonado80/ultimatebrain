'use client'

/**
 * Healing — self-healing system dashboard with predictive risk and recovery history.
 */

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 15_000

export default function HealingPage() {
  const cortexQuery = trpc.healing.cortexStatus.useQuery(undefined, { refetchInterval: REFRESH })
  const predictiveQuery = trpc.healing.predictiveReport.useQuery(undefined, {
    refetchInterval: REFRESH,
  })
  const recoveryQuery = trpc.healing.recoveryHistory.useQuery()
  const degradationQuery = trpc.healing.degradationProfiles.useQuery(undefined, {
    refetchInterval: REFRESH,
  })

  if (cortexQuery.isLoading) return <LoadingState message="Loading Healing System..." />

  const cortex = cortexQuery.data as {
    totalRecoveries: number
    totalHealingActions: number
    cycleCount: number
    systemHealth: string
  } | null

  const predictive = predictiveQuery.data as {
    riskLevel: string
    interventions: Array<{ metric: string; action: string; reason: string; urgency: string }>
  } | null

  const recoveries = (recoveryQuery.data ?? []) as Array<{
    planId: string
    planName: string
    trigger: string
    status: string
    startedAt: Date
  }>

  const profiles = (degradationQuery.data ?? []) as Array<{
    agentId: string
    agentName: string
    level: string
    pressure: number
    consecutiveFailures: number
  }>

  const degraded = profiles.filter((p) => p.level !== 'full')

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Healing System"
        subtitle="Self-healing system — observe, orient, decide, act, learn"
      />

      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Risk Level"
          value={predictive?.riskLevel ?? 'Unknown'}
          color={
            predictive?.riskLevel === 'low'
              ? 'green'
              : predictive?.riskLevel === 'medium'
                ? 'yellow'
                : 'red'
          }
          sub="predictive assessment"
        />
        <StatCard
          label="Cycles"
          value={cortex?.cycleCount ?? 0}
          color="blue"
          sub="healing iterations"
        />
        <StatCard
          label="Recoveries"
          value={cortex?.totalRecoveries ?? 0}
          color="green"
          sub={`of ${cortex?.totalHealingActions ?? 0} actions`}
        />
        <StatCard
          label="Degraded Agents"
          value={degraded.length}
          color={degraded.length > 0 ? 'yellow' : 'green'}
          sub={`of ${profiles.length} total`}
        />
      </PageGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SectionCard title="Predictive Interventions">
          {!predictive?.interventions?.length ? (
            <div className="text-xs text-slate-600 py-6 text-center">No interventions needed.</div>
          ) : (
            <div className="space-y-2">
              {predictive.interventions.map((a, i) => (
                <div key={i} className="bg-bg-deep rounded px-3 py-2 border border-border-dim">
                  <div className="flex items-center gap-2 mb-0.5">
                    <StatusBadge
                      label={a.urgency}
                      color={
                        a.urgency === 'immediate' ? 'red' : a.urgency === 'soon' ? 'yellow' : 'blue'
                      }
                    />
                    <span className="text-[11px] text-slate-300">{a.metric}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 ml-4">{a.reason}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Agent Degradation">
          {degraded.length === 0 ? (
            <div className="text-xs text-slate-600 py-6 text-center">
              All agents at full capability.
            </div>
          ) : (
            <div className="space-y-2">
              {degraded.map((p) => (
                <div
                  key={p.agentId}
                  className="flex items-center justify-between bg-bg-deep rounded px-3 py-2 border border-border-dim"
                >
                  <span className="text-xs text-slate-200">{p.agentName}</span>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      label={p.level}
                      color={
                        p.level === 'reduced' ? 'yellow' : p.level === 'minimal' ? 'red' : 'slate'
                      }
                    />
                    <span className="text-[10px] text-slate-500">
                      {p.consecutiveFailures} failures
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Recovery History">
        {recoveries.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">No recovery events yet.</div>
        ) : (
          <div className="space-y-1.5">
            {recoveries.map((r) => (
              <div
                key={r.planId}
                className="flex items-center gap-3 bg-bg-deep rounded px-3 py-2 border border-border-dim"
              >
                <StatusBadge
                  label={r.status}
                  color={
                    r.status === 'succeeded' ? 'green' : r.status === 'failed' ? 'red' : 'yellow'
                  }
                />
                <span className="text-[11px] text-slate-300 flex-1">{r.planName}</span>
                <span className="text-[10px] text-slate-500 truncate">{r.trigger}</span>
                <span className="text-[10px] text-slate-600">
                  {new Date(r.startedAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
