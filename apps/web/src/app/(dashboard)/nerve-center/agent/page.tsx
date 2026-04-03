'use client'

/**
 * Agent Forensics — deep-dive into individual agent state, work history,
 * degradation timeline, sandbox violations, and verification results.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../../components/db-error-banner'
import { LoadingState } from '../../../../components/ui/loading-state'
import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { trpc } from '../../../../utils/trpc'

const LEVEL_COLORS: Record<string, string> = {
  full: 'text-neon-green',
  reduced: 'text-neon-yellow',
  minimal: 'text-neon-red',
  suspended: 'text-slate-600',
}

export default function AgentForensicsPage() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  const degradationQuery = trpc.healing.degradationProfiles.useQuery(undefined, {
    refetchInterval: 15_000,
  })
  const eventsQuery = trpc.healing.degradationEvents.useQuery(undefined, {
    refetchInterval: 15_000,
  })
  const recoveryQuery = trpc.healing.recoveryHistory.useQuery(undefined, {
    refetchInterval: 30_000,
  })

  const profiles = (degradationQuery.data ?? []) as Array<{
    agentId: string
    agentName: string
    level: string
    pressure: number
    consecutiveFailures: number
    consecutiveSuccesses: number
    transitionHistory: Array<{ from: string; to: string; timestamp: number; reason: string }>
  }>

  const events = (eventsQuery.data ?? []) as Array<{
    agentId: string
    agentName: string
    from: string
    to: string
    reason: string
  }>

  const recoveries = (recoveryQuery.data ?? []) as Array<{
    planId: string
    planName: string
    trigger: string
    status: string
    startedAt: Date
    completedAt?: Date
    steps: Array<{
      name: string
      status: string
      attempts: number
      durationMs: number
      error?: string
    }>
  }>

  if (degradationQuery.isLoading) return <LoadingState message="Loading agent data..." />
  if (degradationQuery.error)
    return <DbErrorBanner error={{ message: degradationQuery.error.message }} />

  const selected = profiles.find((p) => p.agentId === selectedAgentId)
  const activeAgents = profiles.filter((p) => p.level !== 'suspended')
  const degradedAgents = profiles.filter((p) => p.level !== 'full' && p.level !== 'suspended')

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Agent Forensics"
        subtitle="Deep-dive into agent health, degradation history, and recovery operations"
      />

      {/* Summary Stats */}
      <PageGrid cols="4" className="mb-6">
        <StatCard label="Total Agents" value={profiles.length} color="blue" />
        <StatCard label="Active" value={activeAgents.length} color="green" />
        <StatCard label="Degraded" value={degradedAgents.length} color="yellow" />
        <StatCard
          label="Recoveries"
          value={recoveries.length}
          color="purple"
          sub={`${recoveries.filter((r) => r.status === 'succeeded').length} succeeded`}
        />
      </PageGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent List */}
        <div className="lg:col-span-1">
          <SectionCard title="Agents">
            {profiles.length === 0 ? (
              <p className="text-slate-500 text-sm">No agent data yet.</p>
            ) : (
              <div className="space-y-1">
                {profiles.map((agent) => (
                  <button
                    key={agent.agentId}
                    onClick={() => setSelectedAgentId(agent.agentId)}
                    className={`w-full text-left p-2 rounded-lg transition-colors flex items-center justify-between ${
                      selectedAgentId === agent.agentId
                        ? 'bg-neon-blue/10 border border-neon-blue/30'
                        : 'hover:bg-bg-surface/50 border border-transparent'
                    }`}
                  >
                    <span className="text-sm text-slate-200 truncate">{agent.agentName}</span>
                    <span
                      className={`text-[10px] font-bold ${LEVEL_COLORS[agent.level] ?? 'text-slate-400'}`}
                    >
                      {agent.level?.toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Agent Detail */}
        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <SectionCard title="Select an Agent">
              <p className="text-slate-500 text-sm">
                Click an agent from the list to view forensics.
              </p>
            </SectionCard>
          ) : (
            <>
              {/* Vitals */}
              <SectionCard title={`${selected.agentName} — Vitals`} variant="highlighted">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div
                      className={`text-xl font-bold font-orbitron ${LEVEL_COLORS[selected.level] ?? ''}`}
                    >
                      {selected.level?.toUpperCase()}
                    </div>
                    <div className="text-[10px] text-slate-500">Capability</div>
                  </div>
                  <div>
                    <div
                      className={`text-xl font-bold ${selected.pressure > 0.5 ? 'text-neon-red' : selected.pressure > 0.2 ? 'text-neon-yellow' : 'text-neon-green'}`}
                    >
                      {(selected.pressure * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-slate-500">Pressure</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-neon-red">
                      {selected.consecutiveFailures}
                    </div>
                    <div className="text-[10px] text-slate-500">Consecutive Fails</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-neon-green">
                      {selected.consecutiveSuccesses}
                    </div>
                    <div className="text-[10px] text-slate-500">Consecutive Wins</div>
                  </div>
                </div>
              </SectionCard>

              {/* Transition Timeline */}
              <SectionCard title="Transition Timeline">
                {!selected.transitionHistory || selected.transitionHistory.length === 0 ? (
                  <p className="text-slate-500 text-sm">No transitions recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selected.transitionHistory
                      .slice()
                      .reverse()
                      .map((t, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 text-xs p-2 rounded bg-bg-surface/30"
                        >
                          <span className="text-slate-500 w-24 text-[10px]">
                            {new Date(t.timestamp).toLocaleTimeString()}
                          </span>
                          <span className={LEVEL_COLORS[t.from] ?? 'text-slate-400'}>{t.from}</span>
                          <span className="text-slate-600">→</span>
                          <span className={LEVEL_COLORS[t.to] ?? 'text-slate-400'}>{t.to}</span>
                          <span className="text-slate-500 flex-1 truncate">{t.reason}</span>
                        </div>
                      ))}
                  </div>
                )}
              </SectionCard>

              {/* Recent Events for this agent */}
              <SectionCard title="Recent Events">
                {events.filter((e) => e.agentId === selected.agentId).length === 0 ? (
                  <p className="text-slate-500 text-sm">No events for this agent.</p>
                ) : (
                  <div className="space-y-1">
                    {events
                      .filter((e) => e.agentId === selected.agentId)
                      .slice(-10)
                      .map((e, i) => (
                        <div key={i} className="text-xs text-slate-400">
                          <span className={LEVEL_COLORS[e.from] ?? ''}>{e.from}</span>
                          <span className="text-slate-600 mx-1">→</span>
                          <span className={LEVEL_COLORS[e.to] ?? ''}>{e.to}</span>
                          <span className="text-slate-500 ml-2">{e.reason}</span>
                        </div>
                      ))}
                  </div>
                )}
              </SectionCard>
            </>
          )}

          {/* Recovery Operations */}
          {recoveries.length > 0 && (
            <SectionCard title="Recovery Operations" variant="intelligence">
              <div className="space-y-3">
                {recoveries
                  .slice(-5)
                  .reverse()
                  .map((r, i) => (
                    <div key={i} className="p-3 rounded bg-bg-surface/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-200">{r.planName}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            r.status === 'succeeded'
                              ? 'bg-neon-green/20 text-neon-green'
                              : r.status === 'failed'
                                ? 'bg-neon-red/20 text-neon-red'
                                : r.status === 'escalated'
                                  ? 'bg-neon-yellow/20 text-neon-yellow'
                                  : 'bg-slate-700/50 text-slate-400'
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mb-2">Trigger: {r.trigger}</div>
                      <div className="space-y-1">
                        {r.steps.map((step, j) => (
                          <div key={j} className="flex items-center gap-2 text-[10px]">
                            <span
                              className={
                                step.status === 'succeeded'
                                  ? 'text-neon-green'
                                  : step.status === 'failed'
                                    ? 'text-neon-red'
                                    : 'text-slate-500'
                              }
                            >
                              {step.status === 'succeeded'
                                ? '✓'
                                : step.status === 'failed'
                                  ? '✗'
                                  : '○'}
                            </span>
                            <span className="text-slate-300">{step.name}</span>
                            <span className="text-slate-600">{step.durationMs}ms</span>
                            {step.error && (
                              <span className="text-neon-red truncate">{step.error}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  )
}
