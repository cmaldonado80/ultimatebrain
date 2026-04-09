'use client'

/**
 * Stress Testing — chaos engineering dashboard.
 *
 * Shows stress test scenarios, recovery metrics, and whether
 * the system gets stronger from induced failures.
 */

import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 30_000

const STRESS_SCENARIOS = [
  {
    name: 'Agent Cascade Failure',
    description: 'Suspend 3 agents simultaneously and verify OODA recovery within 2 cycles.',
    frequency: 'Weekly',
  },
  {
    name: 'LLM Provider Outage',
    description: 'Block primary LLM provider; confirm circuit breaker routes to fallback.',
    frequency: 'Weekly',
  },
  {
    name: 'Memory Pressure',
    description: 'Flood memory store with 10k observations; verify pruning and recall quality.',
    frequency: 'Bi-weekly',
  },
  {
    name: 'Tool Permission Escalation',
    description: 'Attempt privileged tool calls from restricted agents; verify sandbox blocks.',
    frequency: 'Weekly',
  },
  {
    name: 'Network Partition',
    description:
      'Isolate Departments from parent Corporation; verify graceful degradation and reconnect.',
    frequency: 'Monthly',
  },
] as const

export default function StressTestPage() {
  const cortexQuery = trpc.healing.cortexStatus.useQuery(undefined, {
    refetchInterval: REFRESH,
  })
  const trendsQuery = trpc.intelligence.learningTrends.useQuery(undefined, {
    refetchInterval: REFRESH,
  })

  const cortex = cortexQuery.data as {
    totalRecoveries: number
    totalHealingActions: number
    cycleCount: number
  } | null

  const trends = trendsQuery.data as {
    totalObservations: number
    trends: Record<string, number[]>
  } | null

  const stressEvents = trends?.trends?.['stress_test'] ?? []
  const totalStressTests = stressEvents.reduce((a: number, b: number) => a + b, 0)
  const recoveries = cortex?.totalRecoveries ?? 0
  const healingActions = cortex?.totalHealingActions ?? 0
  const recoveryRate = healingActions > 0 ? Math.round((recoveries / healingActions) * 100) : 0

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Stress Testing"
        subtitle="Chaos engineering — does the system get stronger from stress?"
      />

      <PageGrid cols="3" className="mb-6">
        <StatCard
          label="Stress Tests"
          value={totalStressTests}
          color="red"
          sub="events in last 14d"
        />
        <StatCard
          label="Recovery Rate"
          value={`${recoveryRate}%`}
          color={recoveryRate > 80 ? 'green' : recoveryRate > 50 ? 'yellow' : 'red'}
          sub={`${recoveries} of ${healingActions} actions`}
        />
        <StatCard
          label="OODA Cycles"
          value={cortex?.cycleCount ?? 0}
          color="blue"
          sub="healing loop iterations"
        />
      </PageGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SectionCard title="Stress Scenarios">
          <div className="space-y-3">
            {STRESS_SCENARIOS.map((scenario) => (
              <div
                key={scenario.name}
                className="bg-bg-deep rounded-lg px-3 py-2.5 border border-border-dim"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="neon-dot neon-dot-red" />
                  <span className="text-xs text-slate-200 font-medium">{scenario.name}</span>
                  <StatusBadge label={scenario.frequency} color="blue" />
                </div>
                <p className="text-[10px] text-slate-500 ml-4">{scenario.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Recent Results">
          {totalStressTests === 0 ? (
            <div className="text-xs text-slate-600 py-8 text-center">
              No stress test results yet — scenarios run on their scheduled cadence
            </div>
          ) : (
            <div className="text-xs text-slate-400 py-4 text-center">
              <span className="text-neon-red font-mono">{totalStressTests}</span> stress events
              recorded in the last 14 days.
              <br />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Recovery pipeline handled{' '}
                <span className="text-neon-green font-mono">{recoveries}</span> recoveries across{' '}
                <span className="text-neon-blue font-mono">{cortex?.cycleCount ?? 0}</span> OODA
                cycles.
              </span>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
