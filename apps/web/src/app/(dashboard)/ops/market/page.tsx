'use client'

/**
 * Work Market — agent talent marketplace with live auctions, reputation leaderboard,
 * and skill demand tracking.
 */

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 10_000

export default function WorkMarketPage() {
  const statsQuery = trpc.orchestration.workMarketStats.useQuery(undefined, {
    refetchInterval: REFRESH,
  })
  const reputationsQuery = trpc.orchestration.workMarketReputations.useQuery(undefined, {
    refetchInterval: REFRESH,
  })
  const listingsQuery = trpc.orchestration.workMarketOpenListings.useQuery(undefined, {
    refetchInterval: REFRESH,
  })

  if (statsQuery.isLoading) return <LoadingState message="Loading Work Market..." />

  const stats = statsQuery.data as {
    totalListings: number
    openListings: number
    awardedListings: number
    avgBidsPerListing: number
    topAgents: Array<{
      agentId: string
      agentName: string
      totalBids: number
      totalWins: number
      totalCompletions: number
      totalFailures: number
      winRate: number
      successRate: number
      avgCompletionMs: number
      skills: string[]
    }>
  } | null

  const reputations = (reputationsQuery.data ?? []) as Array<{
    agentId: string
    agentName: string
    totalBids: number
    totalWins: number
    totalCompletions: number
    totalFailures: number
    winRate: number
    successRate: number
    avgCompletionMs: number
    skills: string[]
  }>

  const listings = (listingsQuery.data ?? []) as Array<{
    ticketId: string
    title: string
    requiredSkills: string[]
    priority: string
    complexity: string
    listedAt: number
    expiresAt: number
    bids: Array<{
      agentId: string
      agentName: string
      score: number
      skillMatch: number
      successRate: number
      currentLoad: number
      costEfficiency: number
      bidAt: number
    }>
    winnerId?: string
    status: string
  }>

  const openListings = listings.filter((l) => l.status === 'open')

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Work Market"
        subtitle="Agent talent marketplace — skill-based auction and reputation tracking"
      />

      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Total Auctions"
          value={stats?.totalListings ?? 0}
          color="blue"
          sub="all time"
        />
        <StatCard
          label="Open Now"
          value={stats?.openListings ?? 0}
          color={stats?.openListings ? 'green' : 'slate'}
          sub="active auctions"
        />
        <StatCard
          label="Awarded"
          value={stats?.awardedListings ?? 0}
          color="green"
          sub="completed auctions"
        />
        <StatCard
          label="Avg Bids"
          value={stats?.avgBidsPerListing?.toFixed(1) ?? '0'}
          color="blue"
          sub="per listing"
        />
      </PageGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Open Auctions */}
        <SectionCard title={`Open Auctions (${openListings.length})`}>
          {openListings.length === 0 ? (
            <div className="text-xs text-slate-600 py-6 text-center">
              No active auctions. Tasks are assigned as they arrive.
            </div>
          ) : (
            <div className="space-y-2">
              {openListings.map((l) => {
                const timeLeft = Math.max(0, l.expiresAt - Date.now())
                const timeLeftSec = Math.floor(timeLeft / 1000)
                return (
                  <div
                    key={l.ticketId}
                    className="bg-bg-deep rounded px-3 py-2 border border-border-dim"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-slate-300 truncate flex-1">
                        {l.title || l.ticketId.slice(0, 8)}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge
                          label={l.priority}
                          color={
                            l.priority === 'critical'
                              ? 'red'
                              : l.priority === 'high'
                                ? 'yellow'
                                : 'blue'
                          }
                        />
                        <span className="text-[10px] text-slate-500">
                          {timeLeftSec > 0 ? `${timeLeftSec}s left` : 'expired'}
                        </span>
                      </div>
                    </div>
                    {l.requiredSkills.length > 0 && (
                      <div className="flex gap-1 mb-1 flex-wrap">
                        {l.requiredSkills.map((s) => (
                          <span
                            key={s}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-neon-blue/10 text-neon-blue border border-neon-blue/20"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500">
                      {l.bids.length} bid{l.bids.length !== 1 ? 's' : ''}
                      {l.bids.length > 0 && (
                        <span className="ml-2 text-neon-green">
                          top: {(l.bids[0]?.score * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

        {/* Reputation Leaderboard */}
        <SectionCard title="Agent Leaderboard">
          {reputations.length === 0 ? (
            <div className="text-xs text-slate-600 py-6 text-center">
              No reputation data yet. Agents build reputation through market participation.
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center text-[9px] text-slate-600 uppercase px-3 py-1">
                <span className="w-6">#</span>
                <span className="flex-1">Agent</span>
                <span className="w-14 text-right">Win Rate</span>
                <span className="w-14 text-right">Success</span>
                <span className="w-12 text-right">Bids</span>
                <span className="w-12 text-right">Wins</span>
              </div>
              {reputations.slice(0, 15).map((r, i) => (
                <div
                  key={r.agentId}
                  className="flex items-center bg-bg-deep rounded px-3 py-1.5 border border-border-dim"
                >
                  <span className="w-6 text-[10px] text-slate-500">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] text-slate-200 truncate block">{r.agentName}</span>
                    {r.skills.length > 0 && (
                      <div className="flex gap-1 mt-0.5">
                        {r.skills.slice(0, 3).map((s) => (
                          <span key={s} className="text-[8px] text-slate-600">
                            {s}
                          </span>
                        ))}
                        {r.skills.length > 3 && (
                          <span className="text-[8px] text-slate-600">+{r.skills.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span
                    className={`w-14 text-right text-[11px] font-mono ${r.winRate > 0.5 ? 'text-neon-green' : 'text-slate-400'}`}
                  >
                    {(r.winRate * 100).toFixed(0)}%
                  </span>
                  <span
                    className={`w-14 text-right text-[11px] font-mono ${r.successRate > 0.7 ? 'text-neon-green' : r.successRate > 0.4 ? 'text-neon-yellow' : 'text-neon-red'}`}
                  >
                    {(r.successRate * 100).toFixed(0)}%
                  </span>
                  <span className="w-12 text-right text-[11px] font-mono text-slate-400">
                    {r.totalBids}
                  </span>
                  <span className="w-12 text-right text-[11px] font-mono text-neon-blue">
                    {r.totalWins}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Recent Awards / Top Agents */}
      <SectionCard title="Top Agents by Impact">
        {(stats?.topAgents ?? []).length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            No agent activity tracked yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(stats?.topAgents ?? []).slice(0, 6).map((a) => (
              <div key={a.agentId} className="bg-bg-deep rounded p-3 border border-border-dim">
                <div className="text-xs font-semibold text-slate-200 mb-1 truncate">
                  {a.agentName}
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <div>
                    <span className="text-slate-500">Completions:</span>{' '}
                    <span className="text-neon-green">{a.totalCompletions}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Failures:</span>{' '}
                    <span className="text-neon-red">{a.totalFailures}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Success:</span>{' '}
                    <span className={a.successRate > 0.7 ? 'text-neon-green' : 'text-neon-yellow'}>
                      {(a.successRate * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Avg Time:</span>{' '}
                    <span className="text-slate-300">
                      {a.avgCompletionMs > 0 ? `${(a.avgCompletionMs / 1000).toFixed(1)}s` : '—'}
                    </span>
                  </div>
                </div>
                {a.skills.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {a.skills.slice(0, 4).map((s) => (
                      <span
                        key={s}
                        className="text-[8px] px-1 py-0.5 rounded bg-neon-purple/10 text-neon-purple border border-neon-purple/20"
                      >
                        {s}
                      </span>
                    ))}
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
