'use client'

/**
 * Agent ROI & Efficiency Dashboard — economic intelligence on agent value.
 *
 * Shows which agents deliver the most value relative to their cost,
 * surfaces efficiency recommendations, and highlights top performers
 * alongside agents that need improvement.
 */

import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 30_000

export default function AgentROIPage() {
  const roiQuery = trpc.platform.agentROI.useQuery(undefined, { refetchInterval: REFRESH })
  const effQuery = trpc.platform.efficiencyReport.useQuery(undefined, { refetchInterval: REFRESH })

  const rankings = (roiQuery.data ?? []) as Array<{
    agentId: string
    agentName: string
    completedTickets: number
    totalTokenCost: number
    avgQuality: number
    roi: number
  }>
  const efficiency = effQuery.data as {
    topPerformers: typeof rankings
    bottomPerformers: typeof rankings
    totalAgents: number
    avgROI: number
    recommendations: string[]
  } | null

  const topPerformers = efficiency?.topPerformers ?? rankings.slice(0, 3)
  const needsImprovement = efficiency?.bottomPerformers ?? rankings.slice(-3).reverse()
  const bestName = rankings.length > 0 ? rankings[0]!.agentName : '—'

  function roiColor(score: number): 'green' | 'yellow' | 'red' {
    if (score > 2) return 'green'
    if (score > 1) return 'yellow'
    return 'red'
  }

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Agent ROI"
        subtitle="Economic intelligence — which agents deliver the most value?"
      />

      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Agents Tracked"
          value={efficiency?.totalAgents ?? rankings.length}
          color="blue"
        />
        <StatCard
          label="Avg ROI"
          value={`${(efficiency?.avgROI ?? 0).toFixed(1)}x`}
          color={roiColor(efficiency?.avgROI ?? 0)}
        />
        <StatCard label="Potential Savings" value={`$${0}`} color="yellow" />
        <StatCard label="Top Performer" value={bestName} color="green" />
      </PageGrid>

      <SectionCard title="Efficiency Report" className="mb-6">
        {!efficiency || efficiency.recommendations.length === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">No recommendations yet</div>
        ) : (
          <ul className="space-y-1.5">
            {efficiency.recommendations.map((rec, i) => (
              <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                <span className="text-neon-blue mt-0.5">&#x2022;</span>
                {rec}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Agent Rankings" className="mb-6">
        {rankings.length === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">No agent data yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-slate-500 border-b border-border-dim">
                  <th className="text-left py-1.5 pr-3">Agent</th>
                  <th className="text-right py-1.5 px-3">Tickets</th>
                  <th className="text-right py-1.5 px-3">Cost</th>
                  <th className="text-right py-1.5 px-3">Quality</th>
                  <th className="text-right py-1.5 pl-3">ROI</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((agent) => (
                  <tr key={agent.agentName} className="border-b border-border-dim/50">
                    <td className="py-1.5 pr-3 text-slate-200">{agent.agentName}</td>
                    <td className="py-1.5 px-3 text-right text-slate-400">
                      {agent.completedTickets}
                    </td>
                    <td className="py-1.5 px-3 text-right text-slate-400">
                      ${agent.totalTokenCost.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-3 text-right text-slate-400">
                      {(agent.avgQuality * 100).toFixed(0)}%
                    </td>
                    <td className="py-1.5 pl-3 text-right">
                      <StatusBadge label={`${agent.roi.toFixed(1)}x`} color={roiColor(agent.roi)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SectionCard title="Top Performers">
          {topPerformers.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">No data</div>
          ) : (
            <div className="space-y-3">
              {topPerformers.map((agent, i) => (
                <div key={agent.agentName} className="bg-bg-deep rounded px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-200 font-medium">
                      #{i + 1} {agent.agentName}
                    </span>
                    <StatusBadge label={`${agent.roi.toFixed(1)}x ROI`} color="green" />
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {agent.completedTickets} tickets &middot; ${agent.totalTokenCost.toFixed(2)}{' '}
                    cost &middot; {(agent.avgQuality * 100).toFixed(0)}% quality
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Needs Improvement">
          {needsImprovement.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">No data</div>
          ) : (
            <div className="space-y-3">
              {needsImprovement.map((agent) => (
                <div key={agent.agentName} className="bg-bg-deep rounded px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-200 font-medium">{agent.agentName}</span>
                    <StatusBadge
                      label={`${agent.roi.toFixed(1)}x ROI`}
                      color={roiColor(agent.roi)}
                    />
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Consider retraining or reassigning &middot; {agent.completedTickets} tickets at
                    ${agent.totalTokenCost.toFixed(2)}
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
