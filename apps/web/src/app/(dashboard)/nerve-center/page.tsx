'use client'

/**
 * Nerve Center — the unified real-time command center for the AI Operating System.
 *
 * 10x better than a basic dashboard because it shows:
 * 1. LIVE PULSE  — real-time health metrics with percentile anomaly bands
 * 2. CORTEX      — the healing brain's OODA loop status + predictive interventions
 * 3. AGENTS      — every agent's capability level, sandbox, and active work
 * 4. ACTIVITY    — streaming feed of tool executions, policy blocks, healing actions
 * 5. CONTROLS    — force agent levels, trigger cortex cycle, set department quotas
 *
 * Everything auto-refreshes. Every metric is actionable.
 */

import Link from 'next/link'
import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { Sparkline } from '../../../components/ui/sparkline'
import { StatCard } from '../../../components/ui/stat-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { useNerveStream } from '../../../hooks/use-nerve-stream'
import { trpc } from '../../../utils/trpc'

// ── Refresh intervals ────────────────────────────────────────────────────

const FAST_REFRESH = 5_000 // 5s for critical metrics
const NORMAL_REFRESH = 15_000 // 15s for standard data
const SLOW_REFRESH = 30_000 // 30s for heavy queries

// ── Status colors ────────────────────────────────────────────────────────

const HEALTH_COLORS: Record<string, 'green' | 'blue' | 'yellow' | 'red' | 'purple' | 'slate'> = {
  autonomous: 'green',
  assisted: 'blue',
  degraded: 'yellow',
  manual_override: 'red',
  healthy: 'green',
  unhealthy: 'red',
  low: 'green',
  medium: 'yellow',
  high: 'red',
  critical: 'red',
}

const LEVEL_COLORS: Record<string, string> = {
  full: 'text-neon-green',
  reduced: 'text-neon-yellow',
  minimal: 'text-neon-red',
  suspended: 'text-slate-600',
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function NerveCenterPage() {
  const [activeTab, setActiveTab] = useState<'pulse' | 'agents' | 'activity'>('pulse')

  // Real-time SSE stream
  const stream = useNerveStream()

  // Core data queries with auto-refresh
  const cortexQuery = trpc.healing.cortexStatus.useQuery(undefined, {
    refetchInterval: FAST_REFRESH,
  })
  const predictiveQuery = trpc.healing.predictiveReport.useQuery(undefined, {
    refetchInterval: NORMAL_REFRESH,
  })
  const degradationQuery = trpc.healing.degradationProfiles.useQuery(undefined, {
    refetchInterval: NORMAL_REFRESH,
  })
  const sandboxQuery = trpc.sandbox.status.useQuery(undefined, {
    refetchInterval: NORMAL_REFRESH,
  })
  const tuningQuery = trpc.healing.tuningStates.useQuery(undefined, {
    refetchInterval: SLOW_REFRESH,
  })
  const auditQuery = trpc.sandbox.auditSummary.useQuery(undefined, {
    refetchInterval: NORMAL_REFRESH,
  })
  const instinctQuery = trpc.healing.instinctExecutorStats.useQuery(undefined, {
    refetchInterval: SLOW_REFRESH,
  })

  // Mutations
  const cortexCycle = trpc.healing.cortexCycle.useMutation()

  const cortex = cortexQuery.data as
    | {
        isRunning: boolean
        cycleCount: number
        totalHealingActions: number
        totalRecoveries: number
        totalDegradations: number
        systemHealth: string
        lastCycle: {
          durationMs: number
          phases: {
            orient: { riskLevel: string; immediateThreats: number }
            act: {
              healingActions: Array<{ action: string; target: string; success: boolean }>
              tuningActions: Array<{ entityId: string; field: string; reason: string }>
              degradationEvents: Array<{ agentName: string; from: string; to: string }>
            }
            observe: {
              predictiveReport: {
                interventions: Array<{ metric: string; urgency: string; reason: string }>
              }
            }
          }
        } | null
      }
    | undefined

  const predictive = predictiveQuery.data as
    | {
        riskLevel: string
        trends: Array<{
          metric: string
          current: number
          slope: number
          anomalyScore: number
          percentiles: { p10: number; p50: number; p90: number }
          percentileAnomaly: boolean
          predictedBreachIn: number | null
        }>
        interventions: Array<{ metric: string; urgency: string; reason: string; action: string }>
      }
    | undefined

  const degradations = (degradationQuery.data ?? []) as Array<{
    agentId: string
    agentName: string
    level: string
    pressure: number
    consecutiveFailures: number
    consecutiveSuccesses: number
    executionCount?: number
  }>

  const sandbox = sandboxQuery.data as
    | {
        executor: {
          totalExecutions: number
          blockedByPolicy: number
          timeouts: number
          crashes: number
        }
        audit: { totalEntries: number; successRate: number; policyBlocks: number }
        poolStats: { total: number; executing: number; totalViolations: number }
      }
    | undefined

  const tuning = (tuningQuery.data ?? []) as Array<{
    entityId: string
    entityType: string
    pressure: number
    successRate: number
    avgLatencyMs: number
  }>

  const instincts = instinctQuery.data as
    | {
        totalExecutions: number
        successRate: number
        activeInstincts: number
        registeredHandlers: number
      }
    | undefined

  const audit = auditQuery.data as
    | {
        totalEntries: number
        successRate: number
        policyBlocks: number
        timeouts: number
        topBlockedTools: Array<{ tool: string; count: number }>
        topViolatingAgents: Array<{ agentId: string; agentName: string; count: number }>
      }
    | undefined

  if (cortexQuery.isLoading) return <LoadingState message="Connecting to Nerve Center..." />
  if (cortexQuery.error) return <DbErrorBanner error={{ message: cortexQuery.error.message }} />

  const systemHealth = cortex?.systemHealth ?? 'unknown'
  const riskLevel = predictive?.riskLevel ?? 'low'

  return (
    <div className="p-6 text-slate-50">
      <div className="flex items-center gap-3 mb-2">
        <PageHeader
          title="Nerve Center"
          subtitle="Real-time autonomous nervous system — observe, orient, decide, act"
        />
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${stream.connected ? 'bg-neon-green animate-pulse' : 'bg-slate-600'}`}
          />
          <span className="text-[10px] text-slate-500">
            {stream.connected ? 'LIVE' : 'CONNECTING...'}
          </span>
        </div>
      </div>

      {/* ── Live Sparklines (from SSE stream) ─────────────────────── */}
      {Object.keys(stream.metrics).length > 0 && (
        <div className="flex gap-4 mb-4 overflow-x-auto pb-1">
          {Object.entries(stream.metrics).map(([metric, values]) => (
            <div key={metric} className="flex items-center gap-2 min-w-0">
              <span className="text-[9px] text-slate-500 whitespace-nowrap">
                {metric.replace('_', ' ')}
              </span>
              <Sparkline
                data={values}
                width={100}
                height={24}
                color={
                  metric.includes('error') || metric.includes('fail')
                    ? 'red'
                    : metric.includes('healing')
                      ? 'yellow'
                      : 'blue'
                }
                showDot
              />
              <span className="text-[10px] text-slate-400 font-mono">
                {values.length > 0 ? values[values.length - 1]!.toFixed(2) : '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── System Vital Signs ──────────────────────────────────────── */}
      <PageGrid cols="6" className="mb-6">
        <StatCard
          label="System Health"
          value={systemHealth.replace('_', ' ')}
          color={HEALTH_COLORS[systemHealth] ?? 'slate'}
        />
        <StatCard
          label="Risk Level"
          value={riskLevel}
          color={HEALTH_COLORS[riskLevel] ?? 'green'}
          sub={`${predictive?.interventions.length ?? 0} interventions`}
        />
        <StatCard
          label="Cortex Cycles"
          value={cortex?.cycleCount ?? 0}
          color="purple"
          sub={cortex?.isRunning ? 'Running...' : `${cortex?.lastCycle?.durationMs ?? 0}ms last`}
        />
        <StatCard
          label="Healing Actions"
          value={cortex?.totalHealingActions ?? 0}
          color="blue"
          sub={`${cortex?.totalRecoveries ?? 0} recoveries`}
        />
        <StatCard
          label="Sandbox Execs"
          value={sandbox?.executor.totalExecutions ?? 0}
          color="green"
          sub={`${sandbox?.executor.blockedByPolicy ?? 0} blocked`}
        />
        <StatCard
          label="Instinct Actions"
          value={instincts?.totalExecutions ?? 0}
          color="yellow"
          sub={`${instincts?.activeInstincts ?? 0} active patterns`}
        />
      </PageGrid>

      {/* ── Sub-Page Links ───────────────────────────────────────── */}
      <div className="flex gap-2 mb-4">
        <Link
          href="/nerve-center/tools"
          className="text-xs px-3 py-1.5 rounded-lg bg-bg-card border border-border-dim text-slate-400 hover:text-neon-blue hover:border-neon-blue/30 transition-colors no-underline"
        >
          Tool Catalog
        </Link>
        <Link
          href="/nerve-center/agent"
          className="text-xs px-3 py-1.5 rounded-lg bg-bg-card border border-border-dim text-slate-400 hover:text-neon-purple hover:border-neon-purple/30 transition-colors no-underline"
        >
          Agent Forensics ({degradations.length} agents)
        </Link>
      </div>

      {/* ── Tab Navigation ─────────────────────────────────────────── */}
      <div className="flex gap-2 mb-6">
        {(['pulse', 'agents', 'activity'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/30'
                : 'bg-bg-card text-slate-400 border border-border-dim hover:text-slate-200'
            }`}
          >
            {tab === 'pulse' && '◉ System Pulse'}
            {tab === 'agents' && '◈ Agent Grid'}
            {tab === 'activity' && '⊞ Live Activity'}
          </button>
        ))}
        <div className="ml-auto">
          <button
            onClick={() => cortexCycle.mutate()}
            disabled={cortexCycle.isPending || cortex?.isRunning}
            className="cyber-btn-primary text-sm px-4 py-2 disabled:opacity-50"
          >
            {cortexCycle.isPending ? 'Running...' : '▶ Run OODA Cycle'}
          </button>
        </div>
      </div>

      {/* ── Tab Content ────────────────────────────────────────────── */}
      {activeTab === 'pulse' && (
        <PulseTab
          predictive={predictive}
          tuning={tuning}
          audit={audit}
          streamMetrics={stream.metrics}
        />
      )}
      {activeTab === 'agents' && <AgentGridTab degradations={degradations} />}
      {activeTab === 'activity' && <ActivityTab cortex={cortex} audit={audit} />}
    </div>
  )
}

// ── Pulse Tab ────────────────────────────────────────────────────────────

function PulseTab({
  predictive,
  tuning,
  audit,
  streamMetrics,
}: {
  streamMetrics: Record<string, number[]>
  predictive:
    | {
        trends: Array<{
          metric: string
          current: number
          slope: number
          anomalyScore: number
          percentiles: { p10: number; p50: number; p90: number }
          percentileAnomaly: boolean
          predictedBreachIn: number | null
        }>
        interventions: Array<{ metric: string; urgency: string; reason: string; action: string }>
      }
    | undefined
  tuning: Array<{
    entityId: string
    entityType: string
    pressure: number
    successRate: number
    avgLatencyMs: number
  }>
  audit:
    | {
        totalEntries: number
        successRate: number
        policyBlocks: number
        timeouts: number
        topBlockedTools: Array<{ tool: string; count: number }>
        topViolatingAgents: Array<{ agentId: string; agentName: string; count: number }>
      }
    | undefined
}) {
  return (
    <div className="space-y-6">
      {/* Metric Trends with Percentile Bands */}
      <SectionCard title="Metric Trends" variant="intelligence">
        {!predictive?.trends || predictive.trends.length === 0 ? (
          <p className="text-slate-500 text-sm">
            No trend data yet. Cortex needs a few cycles to collect metrics.
          </p>
        ) : (
          <div className="space-y-3">
            {predictive.trends.map((trend) => (
              <div
                key={trend.metric}
                className="flex items-center gap-4 p-3 rounded-lg bg-bg-surface/50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{trend.metric}</span>
                    {trend.percentileAnomaly && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-neon-red/20 text-neon-red">
                        ANOMALY
                      </span>
                    )}
                    {trend.predictedBreachIn !== null && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-neon-yellow/20 text-neon-yellow">
                        Breach in {Math.round(trend.predictedBreachIn / 60000)}min
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4 mt-1 text-[10px] text-slate-500">
                    <span>Current: {trend.current.toFixed(3)}</span>
                    <span>P10: {trend.percentiles.p10.toFixed(3)}</span>
                    <span>P50: {trend.percentiles.p50.toFixed(3)}</span>
                    <span>P90: {trend.percentiles.p90.toFixed(3)}</span>
                    <span>
                      Slope: {trend.slope > 0 ? '+' : ''}
                      {trend.slope.toFixed(4)}/s
                    </span>
                  </div>
                </div>
                {/* Sparkline chart with percentile band */}
                <Sparkline
                  data={streamMetrics[trend.metric] ?? [trend.current]}
                  width={140}
                  height={28}
                  color={trend.percentileAnomaly ? 'red' : trend.slope > 0 ? 'yellow' : 'green'}
                  percentileBand={trend.percentiles}
                  showDot
                />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Predictive Interventions */}
      {predictive?.interventions && predictive.interventions.length > 0 && (
        <SectionCard title="Predictive Interventions" variant="warning">
          <div className="space-y-2">
            {predictive.interventions.map((intervention, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded bg-bg-surface/30">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    intervention.urgency === 'immediate'
                      ? 'bg-neon-red/20 text-neon-red'
                      : intervention.urgency === 'soon'
                        ? 'bg-neon-yellow/20 text-neon-yellow'
                        : 'bg-slate-700/50 text-slate-400'
                  }`}
                >
                  {intervention.urgency}
                </span>
                <div className="flex-1 text-xs text-slate-300">{intervention.reason}</div>
                <span className="text-[10px] text-slate-500 font-mono">{intervention.action}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Adaptive Tuning Pressure */}
      <PageGrid cols="2">
        <SectionCard title="Resource Pressure">
          {tuning.length === 0 ? (
            <p className="text-slate-500 text-sm">No tuning data yet.</p>
          ) : (
            <div className="space-y-2">
              {tuning.slice(0, 8).map((state) => (
                <div key={state.entityId} className="flex items-center gap-3 text-xs">
                  <span className="text-slate-400 w-24 truncate" title={state.entityId}>
                    {state.entityId.slice(0, 12)}
                  </span>
                  <div className="flex-1 h-2 rounded bg-bg-deep overflow-hidden">
                    <div
                      className={`h-full rounded transition-all ${
                        state.pressure > 0.7
                          ? 'bg-neon-red'
                          : state.pressure > 0.3
                            ? 'bg-neon-yellow'
                            : 'bg-neon-green'
                      }`}
                      style={{ width: `${state.pressure * 100}%` }}
                    />
                  </div>
                  <span className="text-slate-500 w-16 text-right">
                    {(state.successRate * 100).toFixed(0)}% ok
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Sandbox Audit">
          {!audit || audit.totalEntries === 0 ? (
            <p className="text-slate-500 text-sm">No audit entries yet.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-neon-green">
                    {(audit.successRate * 100).toFixed(0)}%
                  </div>
                  <div className="text-[10px] text-slate-500">Success Rate</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-neon-red">{audit.policyBlocks}</div>
                  <div className="text-[10px] text-slate-500">Blocked</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-neon-yellow">{audit.timeouts}</div>
                  <div className="text-[10px] text-slate-500">Timeouts</div>
                </div>
              </div>
              {audit.topBlockedTools.length > 0 && (
                <div>
                  <div className="text-[10px] text-slate-500 mb-1">Top Blocked Tools</div>
                  {audit.topBlockedTools.map((t) => (
                    <div key={t.tool} className="flex justify-between text-xs text-slate-400">
                      <span className="font-mono">{t.tool}</span>
                      <span className="text-neon-red">{t.count}x</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </PageGrid>
    </div>
  )
}

// ── Agent Grid Tab ───────────────────────────────────────────────────────

function AgentGridTab({
  degradations,
}: {
  degradations: Array<{
    agentId: string
    agentName: string
    level: string
    pressure: number
    consecutiveFailures: number
    consecutiveSuccesses: number
  }>
}) {
  const forceLevel = trpc.healing.forceAgentLevel.useMutation()

  return (
    <SectionCard title="Agent Capability Grid">
      {degradations.length === 0 ? (
        <p className="text-slate-500 text-sm">
          No agent degradation data. Agents will appear here after their first task execution.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {degradations.map((agent) => (
            <div
              key={agent.agentId}
              className="p-3 rounded-lg bg-bg-surface/50 border border-border-dim"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-200 truncate">
                  {agent.agentName}
                </span>
                <span
                  className={`text-xs font-bold ${LEVEL_COLORS[agent.level] ?? 'text-slate-400'}`}
                >
                  {agent.level?.toUpperCase()}
                </span>
              </div>
              <div className="flex gap-4 text-[10px] text-slate-500 mb-2">
                <span>Pressure: {(agent.pressure * 100).toFixed(0)}%</span>
                <span>Fails: {agent.consecutiveFailures}</span>
                <span>Wins: {agent.consecutiveSuccesses}</span>
              </div>
              {/* Quick controls */}
              <div className="flex gap-1">
                {['full', 'reduced', 'minimal', 'suspended'].map((level) => (
                  <button
                    key={level}
                    onClick={() =>
                      forceLevel.mutate({
                        agentId: agent.agentId,
                        agentName: agent.agentName,
                        level: level as 'full' | 'reduced' | 'minimal' | 'suspended',
                        reason: 'Manual override from Nerve Center',
                      })
                    }
                    disabled={agent.level === level}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                      agent.level === level
                        ? 'border-neon-blue/30 bg-neon-blue/10 text-neon-blue'
                        : 'border-border-dim text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ── Activity Tab ─────────────────────────────────────────────────────────

function ActivityTab({
  cortex,
  audit,
}: {
  cortex:
    | {
        lastCycle: {
          durationMs: number
          phases: {
            orient: { riskLevel: string; immediateThreats: number }
            act: {
              healingActions: Array<{ action: string; target: string; success: boolean }>
              tuningActions: Array<{ entityId: string; field: string; reason: string }>
              degradationEvents: Array<{ agentName: string; from: string; to: string }>
            }
          }
        } | null
      }
    | undefined
  audit:
    | {
        topViolatingAgents: Array<{ agentId: string; agentName: string; count: number }>
      }
    | undefined
}) {
  const lastCycle = cortex?.lastCycle

  return (
    <div className="space-y-6">
      {/* Last OODA Cycle Breakdown */}
      <SectionCard title="Last Cortex Cycle" variant="highlighted">
        {!lastCycle ? (
          <p className="text-slate-500 text-sm">
            No cycle data yet. Click &quot;Run OODA Cycle&quot; to start.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-4 text-xs text-slate-400">
              <span>Duration: {lastCycle.durationMs}ms</span>
              <span>
                Risk:{' '}
                <StatusBadge
                  label={lastCycle.phases.orient.riskLevel}
                  color={HEALTH_COLORS[lastCycle.phases.orient.riskLevel] ?? 'slate'}
                />
              </span>
              <span>Threats: {lastCycle.phases.orient.immediateThreats}</span>
            </div>

            {/* Healing Actions */}
            {lastCycle.phases.act.healingActions.length > 0 && (
              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">
                  Healing Actions
                </div>
                {lastCycle.phases.act.healingActions.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                    <span className={a.success ? 'text-neon-green' : 'text-neon-red'}>
                      {a.success ? '✓' : '✗'}
                    </span>
                    <span className="text-slate-300 font-mono">{a.action}</span>
                    <span className="text-slate-500">→ {a.target}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tuning Actions */}
            {lastCycle.phases.act.tuningActions.length > 0 && (
              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">
                  Adaptive Tuning
                </div>
                {lastCycle.phases.act.tuningActions.map((a, i) => (
                  <div key={i} className="text-xs text-slate-400 py-0.5">
                    <span className="text-neon-purple font-mono">{a.field}</span>
                    <span className="text-slate-500"> on {a.entityId.slice(0, 12)} — </span>
                    <span className="text-slate-400">{a.reason}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Degradation Events */}
            {lastCycle.phases.act.degradationEvents.length > 0 && (
              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">
                  Agent Degradation
                </div>
                {lastCycle.phases.act.degradationEvents.map((e, i) => (
                  <div key={i} className="text-xs py-0.5">
                    <span className="text-slate-300">{e.agentName}</span>
                    <span className={`ml-2 ${LEVEL_COLORS[e.from] ?? ''}`}>{e.from}</span>
                    <span className="text-slate-600 mx-1">→</span>
                    <span className={LEVEL_COLORS[e.to] ?? ''}>{e.to}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Top Violating Agents */}
      {audit?.topViolatingAgents && audit.topViolatingAgents.length > 0 && (
        <SectionCard title="Top Violating Agents" variant="error">
          <div className="space-y-1">
            {audit.topViolatingAgents.map((a) => (
              <div key={a.agentId} className="flex justify-between text-xs">
                <span className="text-slate-300">{a.agentName}</span>
                <span className="text-neon-red font-mono">{a.count} violations</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
