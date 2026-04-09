'use client'

/**
 * Knowledge Mesh Explorer — peer intelligence network with contribution
 * leaderboard, exchange history, and knowledge gap analysis.
 */

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 15_000

export default function KnowledgeMeshPage() {
  const statsQuery = trpc.orchestration.knowledgeMeshStats.useQuery(undefined, {
    refetchInterval: REFRESH,
  })
  const exchangesQuery = trpc.orchestration.knowledgeMeshExchanges.useQuery(undefined, {
    refetchInterval: REFRESH,
  })

  if (statsQuery.isLoading) return <LoadingState message="Loading Knowledge Mesh..." />

  const stats = statsQuery.data as {
    totalQueries: number
    totalFindings: number
    helpfulRate: number
    topContributors: Array<{ agentId: string; agentName: string; contributions: number }>
  } | null

  const exchanges = (exchangesQuery.data ?? []) as Array<{
    id?: string
    query: {
      askingAgentId: string
      question: string
      scope: string
    }
    findings: Array<{
      sourceAgentId: string
      sourceAgentName: string
      content: string
      relevanceScore: number
      source: string
    }>
    queriedAt: number
    feedbackGiven?: string
  }>

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Knowledge Mesh"
        subtitle="Peer intelligence network — agents learn from each other"
      />

      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Total Queries"
          value={stats?.totalQueries ?? 0}
          color="blue"
          sub="knowledge requests"
        />
        <StatCard
          label="Findings"
          value={stats?.totalFindings ?? 0}
          color="green"
          sub="peer solutions found"
        />
        <StatCard
          label="Helpful Rate"
          value={stats?.helpfulRate ? `${(stats.helpfulRate * 100).toFixed(0)}%` : '—'}
          color={
            stats?.helpfulRate && stats.helpfulRate > 0.6
              ? 'green'
              : stats?.helpfulRate && stats.helpfulRate > 0.3
                ? 'yellow'
                : 'slate'
          }
          sub="of rated exchanges"
        />
        <StatCard
          label="Contributors"
          value={stats?.topContributors?.length ?? 0}
          color="purple"
          sub="knowledge providers"
        />
      </PageGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Contribution Leaderboard */}
        <SectionCard title="Top Contributors">
          {!stats?.topContributors?.length ? (
            <div className="text-xs text-slate-600 py-6 text-center">
              No contributions yet. Agents build knowledge through peer queries.
            </div>
          ) : (
            <div className="space-y-1.5">
              {stats.topContributors.map((c, i) => (
                <div
                  key={c.agentId}
                  className="flex items-center justify-between bg-bg-deep rounded px-3 py-2 border border-border-dim"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-bold w-5 ${i < 3 ? 'text-neon-green' : 'text-slate-500'}`}
                    >
                      {i + 1}
                    </span>
                    <span className="text-[11px] text-slate-200">{c.agentName}</span>
                  </div>
                  <span className="text-[11px] font-mono text-neon-blue">
                    {c.contributions} findings
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Exchange History */}
        <SectionCard title="Recent Exchanges">
          {exchanges.length === 0 ? (
            <div className="text-xs text-slate-600 py-6 text-center">
              No knowledge exchanges yet. Agents query the mesh before starting work.
            </div>
          ) : (
            <div className="space-y-2">
              {exchanges.slice(0, 10).map((e, i) => (
                <div
                  key={e.id ?? i}
                  className="bg-bg-deep rounded px-3 py-2 border border-border-dim"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-slate-300 truncate flex-1">
                      {e.query.question}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      <StatusBadge
                        label={e.query.scope}
                        color={e.query.scope === 'organization' ? 'blue' : 'green'}
                      />
                      {e.feedbackGiven && (
                        <StatusBadge
                          label={e.feedbackGiven}
                          color={e.feedbackGiven === 'helpful' ? 'green' : 'red'}
                        />
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {e.findings.length} finding{e.findings.length !== 1 ? 's' : ''}
                    {e.findings.length > 0 && (
                      <span className="ml-2">
                        from:{' '}
                        {e.findings
                          .slice(0, 3)
                          .map((f) => f.sourceAgentName)
                          .join(', ')}
                      </span>
                    )}
                    <span className="ml-2 text-slate-600">
                      {new Date(e.queriedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Knowledge Gaps */}
      <SectionCard title="Knowledge Gaps">
        {exchanges.filter((e) => e.findings.length === 0).length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            No knowledge gaps detected — all queries have found relevant findings.
          </div>
        ) : (
          <div className="space-y-1.5">
            {exchanges
              .filter((e) => e.findings.length === 0)
              .slice(0, 10)
              .map((e, i) => (
                <div
                  key={e.id ?? `gap-${i}`}
                  className="flex items-center gap-3 bg-bg-deep rounded px-3 py-2 border border-neon-yellow/20"
                >
                  <span className="neon-dot neon-dot-yellow" />
                  <span className="text-[11px] text-slate-300 flex-1 truncate">
                    {e.query.question}
                  </span>
                  <span className="text-[10px] text-slate-600">
                    {new Date(e.queriedAt).toLocaleString()}
                  </span>
                </div>
              ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
