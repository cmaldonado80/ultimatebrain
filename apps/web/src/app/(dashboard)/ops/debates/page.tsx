'use client'

/**
 * Collective Decisions (Debate History) — multi-agent deliberation.
 *
 * Shows structured debates where multiple agents weigh in on high-stakes
 * decisions, with outcomes, participant counts, and reasoning summaries.
 */

import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 30_000

export default function CollectiveDecisionsPage() {
  const debatesQuery = trpc.orchestration.debateHistory.useQuery(undefined, {
    refetchInterval: REFRESH,
  })

  const debates = debatesQuery.data as any

  const debateList = debates?.debates ?? []
  const totalDebates = debateList.length
  const avgParticipants =
    totalDebates > 0
      ? Math.round(
          debateList.reduce(
            (sum: number, d: { participantCount: number | null }) =>
              sum + (d.participantCount ?? 0),
            0,
          ) / totalDebates,
        )
      : 0

  function outcomeColor(outcome: string): 'green' | 'red' | 'yellow' {
    if (outcome === 'approved') return 'green'
    if (outcome === 'rejected') return 'red'
    return 'yellow'
  }

  function truncate(text: string, max: number): string {
    return text.length > max ? text.slice(0, max) + '...' : text
  }

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Collective Decisions"
        subtitle="Multi-agent deliberation — structured debate for high-stakes decisions"
      />

      <PageGrid cols="2" className="mb-6">
        <StatCard label="Total Debates" value={totalDebates} color="blue" />
        <StatCard
          label="Avg Participants"
          value={avgParticipants}
          color="purple"
          sub="agents per debate"
        />
      </PageGrid>

      <SectionCard title="Debate History">
        {debateList.length === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">No debates recorded yet</div>
        ) : (
          <div className="space-y-2">
            {debateList.map((debate: any, i: number) => (
              <div key={i} className="bg-bg-deep rounded px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-200 font-medium flex-1 mr-3">
                    {truncate(debate.topic, 80)}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-500">
                      {debate.participantCount} agents
                    </span>
                    <StatusBadge label={debate.outcome} color={outcomeColor(debate.outcome)} />
                  </div>
                </div>
                <div className="text-[10px] text-slate-500">{truncate(debate.reasoning, 120)}</div>
                <div className="text-[10px] text-slate-600 mt-1">
                  {new Date(debate.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
