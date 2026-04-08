'use client'

/**
 * Learning Organism Dashboard — shows whether the system is getting smarter.
 *
 * While the Nerve Center shows real-time health, this dashboard shows
 * learning trends over time: instinct confidence growth, feedback loop
 * activity, agent reputation curves, and knowledge accumulation.
 */

import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { Sparkline } from '../../../components/ui/sparkline'
import { StatCard } from '../../../components/ui/stat-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

const NORMAL_REFRESH = 15_000
const SLOW_REFRESH = 30_000

export default function LearningOrganismPage() {
  // ── Data queries ─────────────────────────────────────────────────────
  const trendsQuery = trpc.intelligence.learningTrends.useQuery(undefined, {
    refetchInterval: SLOW_REFRESH,
  })
  const cortexQuery = trpc.healing.cortexStatus.useQuery(undefined, {
    refetchInterval: NORMAL_REFRESH,
  })
  const degradationQuery = trpc.healing.degradationProfiles.useQuery(undefined, {
    refetchInterval: NORMAL_REFRESH,
  })
  const causalQuery = trpc.intelligence.causalInsights.useQuery(
    { limit: 5 },
    { refetchInterval: SLOW_REFRESH },
  )
  const metaQuery = trpc.intelligence.metaLearningReport.useQuery(undefined, {
    refetchInterval: SLOW_REFRESH,
  })
  const instinctStatsQuery = trpc.healing.instinctExecutorStats.useQuery(undefined, {
    refetchInterval: SLOW_REFRESH,
  })

  const trends = trendsQuery.data
  const cortex = cortexQuery.data as {
    isRunning: boolean
    cycleCount: number
    totalHealingActions: number
    totalRecoveries: number
    totalDegradations: number
    systemHealth: string
  } | null
  const degradation = degradationQuery.data as Array<{
    agentId: string
    agentName: string
    level: string
    pressure: number
  }> | null
  const instinctStats = instinctStatsQuery.data as {
    totalExecutions: number
    successRate: number
    activeInstincts: number
  } | null

  // ── Computed values ──────────────────────────────────────────────────
  const instinctsLearned = trends?.instinctsLearned ?? 0
  const avgConfidence = trends?.avgConfidence ?? 0
  const totalObs = trends?.totalObservations ?? 0
  const loopHealth = trends?.loopHealth ?? {}
  const trendData = trends?.trends ?? {}

  const activeLoops = Object.values(loopHealth).filter(Boolean).length
  const totalLoops = Object.keys(loopHealth).length

  const healthyAgents = degradation?.filter((a) => a.level === 'full').length ?? 0
  const totalAgents = degradation?.length ?? 0

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Learning Organism"
        subtitle="Is the system getting smarter? Track instinct growth, feedback loops, and collective intelligence."
      />

      {/* Section 1: Vital Signs */}
      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Patterns Learned"
          value={instinctsLearned}
          color="blue"
          sub={`${instinctStats?.activeInstincts ?? 0} active`}
        />
        <StatCard
          label="Avg Accuracy"
          value={`${Math.round(avgConfidence * 100)}%`}
          color={avgConfidence > 0.6 ? 'green' : avgConfidence > 0.4 ? 'yellow' : 'red'}
          sub={`${totalObs} observations (14d)`}
        />
        <StatCard
          label="Learning Signals"
          value={`${activeLoops}/${totalLoops}`}
          color={activeLoops >= 8 ? 'green' : activeLoops >= 5 ? 'yellow' : 'red'}
          sub="active in last 24h"
        />
        <StatCard
          label="Agent Health"
          value={`${healthyAgents}/${totalAgents}`}
          color={healthyAgents === totalAgents ? 'green' : 'yellow'}
          sub={`${cortex?.totalRecoveries ?? 0} recoveries`}
        />
      </PageGrid>

      {/* Section 2: Learning Velocity (Sparklines) */}
      <SectionCard title="Learning Velocity" className="mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            {
              label: 'Pattern Effectiveness',
              key: 'instinct_effectiveness',
              color: 'green' as const,
            },
            { label: 'Error Resolution', key: 'error_resolution', color: 'blue' as const },
            { label: 'Tool Failures', key: 'tool_failure_pattern', color: 'red' as const },
            { label: 'Agent Issues', key: 'agent_degradation', color: 'yellow' as const },
            { label: 'Code Repairs', key: 'code_repair', color: 'purple' as const },
            { label: 'Self-Corrections', key: 'self_improve', color: 'teal' as const },
          ].map((metric) => (
            <div key={metric.key} className="text-center">
              <div className="text-[10px] text-slate-500 uppercase mb-1">{metric.label}</div>
              <Sparkline
                data={trendData[metric.key] ?? new Array(14).fill(0)}
                width={120}
                height={32}
                color={metric.color}
              />
              <div className="text-[10px] text-slate-400 mt-1">
                {(trendData[metric.key] ?? []).reduce((a: number, b: number) => a + b, 0)} events
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Section 3: Feedback Loop Health */}
        <SectionCard title="Learning Signal Status">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(loopHealth).map(([name, active]) => (
              <div key={name} className="flex items-center gap-2 text-[11px]">
                <span className={`neon-dot ${active ? 'neon-dot-green' : 'neon-dot-red'}`} />
                <span className={active ? 'text-slate-200' : 'text-slate-600'}>{name}</span>
              </div>
            ))}
          </div>
          {totalLoops > 0 && (
            <div className="text-[10px] text-slate-500 mt-3 border-t border-border-dim pt-2">
              {activeLoops === totalLoops
                ? 'All learning signals active — system is learning'
                : `${totalLoops - activeLoops} signals inactive — may need data flow`}
            </div>
          )}
        </SectionCard>

        {/* Section 4: Healing System Status */}
        <SectionCard title="Healing System Status">
          {cortex ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <StatusBadge
                  label={cortex.systemHealth}
                  color={
                    cortex.systemHealth === 'autonomous'
                      ? 'green'
                      : cortex.systemHealth === 'degraded'
                        ? 'yellow'
                        : 'blue'
                  }
                />
                <span className="text-[10px] text-slate-500">
                  {cortex.isRunning ? 'Running' : 'Idle'} &middot; {cortex.cycleCount} cycles
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div className="bg-bg-deep rounded px-2 py-1.5 text-center">
                  <div className="text-slate-500">Fixed</div>
                  <div className="text-lg font-bold text-neon-green">
                    {cortex.totalHealingActions}
                  </div>
                </div>
                <div className="bg-bg-deep rounded px-2 py-1.5 text-center">
                  <div className="text-slate-500">Recovered</div>
                  <div className="text-lg font-bold text-neon-blue">{cortex.totalRecoveries}</div>
                </div>
                <div className="bg-bg-deep rounded px-2 py-1.5 text-center">
                  <div className="text-slate-500">Reduced</div>
                  <div className="text-lg font-bold text-neon-yellow">
                    {cortex.totalDegradations}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-600 py-4 text-center">Health data loading...</div>
          )}
        </SectionCard>
      </div>

      {/* Section 5: Agent Degradation Profiles */}
      <SectionCard title="Agent Capability Levels" className="mb-6">
        {!degradation || degradation.length === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">No agent profiles yet</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {degradation.slice(0, 12).map((agent) => (
              <div
                key={agent.agentId}
                className="flex items-center gap-2 text-[11px] bg-bg-deep rounded px-2 py-1.5"
              >
                <span
                  className={`neon-dot ${
                    agent.level === 'full'
                      ? 'neon-dot-green'
                      : agent.level === 'reduced'
                        ? 'neon-dot-yellow'
                        : agent.level === 'minimal'
                          ? 'neon-dot-red'
                          : 'neon-dot-red'
                  }`}
                />
                <span className="text-slate-300 truncate flex-1">{agent.agentName}</span>
                <StatusBadge
                  label={agent.level}
                  color={
                    agent.level === 'full' ? 'green' : agent.level === 'reduced' ? 'yellow' : 'red'
                  }
                />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Section 5b: What's Driving Changes + Learning Channel Performance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <SectionCard title="What's Driving Changes">
          {!causalQuery.data || (causalQuery.data as unknown[]).length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">
              No data yet — run weekly analysis
            </div>
          ) : (
            <div className="space-y-2">
              {(
                causalQuery.data as Array<{
                  interventionType: string
                  target: string
                  delta: number
                  confidence: number
                }>
              )
                .slice(0, 5)
                .map((insight, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <StatusBadge label={insight.interventionType} color="purple" />
                    <span className="text-slate-300 flex-1 truncate">{insight.target}</span>
                    <span
                      className={`font-mono ${insight.delta > 0 ? 'text-neon-green' : 'text-neon-red'}`}
                    >
                      {insight.delta > 0 ? '+' : ''}
                      {(insight.delta * 100).toFixed(1)}%
                    </span>
                    <span className="text-[9px] text-slate-500">
                      {Math.round(insight.confidence * 100)}% conf
                    </span>
                  </div>
                ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Learning Channel Performance">
          {!metaQuery.data || (metaQuery.data as unknown[]).length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">
              No channel data yet — run weekly analysis
            </div>
          ) : (
            <div className="space-y-2">
              {(
                metaQuery.data as Array<{
                  eventType: string
                  yieldRate: number
                  effectivenessScore: number
                  metaInsight: string | null
                }>
              )
                .slice(0, 5)
                .map((p, i) => (
                  <div key={i} className="text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-300 font-mono">{p.eventType}</span>
                      <span
                        className={`ml-auto font-mono ${p.effectivenessScore > 0.1 ? 'text-neon-green' : p.effectivenessScore > 0.02 ? 'text-neon-yellow' : 'text-slate-500'}`}
                      >
                        {(p.yieldRate * 100).toFixed(1)}% yield
                      </span>
                    </div>
                    {p.metaInsight && (
                      <div className="text-[9px] text-slate-500 italic">{p.metaInsight}</div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Section 6: Learning Summary */}
      <SectionCard title="Learning Summary">
        <div className="text-xs text-slate-400 space-y-1">
          <p>
            <span className="text-neon-blue font-mono">{instinctsLearned}</span> instincts promoted
            at avg{' '}
            <span className="text-neon-green font-mono">{Math.round(avgConfidence * 100)}%</span>{' '}
            confidence.
          </p>
          <p>
            <span className="text-neon-purple font-mono">{totalObs}</span> observations processed in
            last 14 days across{' '}
            <span className="text-neon-teal font-mono">{Object.keys(trendData).length}</span> event
            types.
          </p>
          <p>
            <span className="text-neon-green font-mono">{activeLoops}</span> of {totalLoops}{' '}
            feedback loops active.{' '}
            {activeLoops === totalLoops
              ? 'All loops firing — organism is learning at full capacity.'
              : `${totalLoops - activeLoops} loops need activation.`}
          </p>
        </div>
      </SectionCard>
    </div>
  )
}
