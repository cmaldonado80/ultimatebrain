'use client'

/**
 * Decision Archive & Playbooks — institutional memory.
 *
 * Every high-impact decision with reasoning, validation status,
 * and auto-generated playbooks from successful patterns.
 */

import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 30_000

export default function DecisionArchivePage() {
  const decisionsQuery = trpc.intelligence.decisions.useQuery(undefined, {
    refetchInterval: REFRESH,
  })
  const playbooksQuery = trpc.intelligence.playbooks.useQuery(undefined, {
    refetchInterval: REFRESH,
  })

  const decisions = (decisionsQuery.data ?? []) as Array<{
    type: string
    description: string
    status: string
    createdAt: string | Date
  }>

  const playbooks = (playbooksQuery.data ?? []) as Array<{
    pattern: string
    steps: string[]
    decisionCount: number
    successRate: number
  }>

  // ── Computed values ──────────────────────────────────────────────────
  const totalDecisions = decisions?.length ?? 0
  const validatedCount = decisions?.filter((d) => d.status === 'validated').length ?? 0
  const totalPlaybooks = playbooks?.length ?? 0

  const statusColor = (status: string) => {
    switch (status) {
      case 'validated':
        return 'green' as const
      case 'pending':
        return 'yellow' as const
      case 'failed':
        return 'red' as const
      case 'mixed':
        return 'blue' as const
      default:
        return 'blue' as const
    }
  }

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Decision Archive"
        subtitle="Institutional memory — every high-impact decision with reasoning"
      />

      <PageGrid cols="3" className="mb-6">
        <StatCard
          label="Total Decisions"
          value={totalDecisions}
          color="blue"
          sub="archived decisions"
        />
        <StatCard
          label="Validated"
          value={validatedCount}
          color="green"
          sub={
            totalDecisions > 0
              ? `${Math.round((validatedCount / totalDecisions) * 100)}% success`
              : 'no data'
          }
        />
        <StatCard
          label="Playbooks"
          value={totalPlaybooks}
          color="purple"
          sub="generated from patterns"
        />
      </PageGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SectionCard title="Recent Decisions">
          {!decisions || decisions.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">No decisions recorded yet</div>
          ) : (
            <div className="space-y-2">
              {decisions.slice(0, 10).map((d, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 bg-bg-deep rounded-lg px-3 py-2 border border-border-dim"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge label={d.type} color="blue" />
                      <StatusBadge label={d.status} color={statusColor(d.status)} />
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">{d.description}</p>
                    <span className="text-[10px] text-slate-600 font-mono">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Playbooks">
          {!playbooks || playbooks.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">
              No playbooks generated yet — needs validated decision patterns
            </div>
          ) : (
            <div className="space-y-2">
              {playbooks.map((pb, i) => (
                <div key={i} className="bg-bg-deep rounded-lg px-3 py-2.5 border border-border-dim">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-200 font-medium">{pb.pattern}</span>
                    <span
                      className={`text-xs font-mono font-medium ${
                        pb.successRate >= 0.8
                          ? 'text-neon-green'
                          : pb.successRate >= 0.5
                            ? 'text-neon-yellow'
                            : 'text-neon-red'
                      }`}
                    >
                      {Math.round(pb.successRate * 100)}%
                    </span>
                  </div>
                  <div className="flex gap-3 text-[10px] text-slate-500">
                    <span>
                      <span className="text-neon-blue font-mono">{pb.steps.length}</span> steps
                    </span>
                    <span>
                      <span className="text-neon-purple font-mono">{pb.decisionCount}</span>{' '}
                      decisions
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
