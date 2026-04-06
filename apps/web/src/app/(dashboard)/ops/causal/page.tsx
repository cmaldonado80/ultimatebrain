'use client'

/**
 * Causal Insights — understand WHY interventions work.
 *
 * Surfaces causal analysis results: which interventions drive
 * which metric improvements, with confidence and sample sizes.
 */

import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 30_000

export default function CausalInsightsPage() {
  const insightsQuery = trpc.intelligence.causalInsights.useQuery(
    { limit: 20 },
    { refetchInterval: REFRESH },
  )

  const insights = insightsQuery.data as Array<{
    interventionType: string
    target: string
    metric: string
    delta: number
    confidence: number
    sampleSize: number
  }> | null

  // ── Computed values ──────────────────────────────────────────────────
  const total = insights?.length ?? 0
  const avgConfidence = total > 0 ? insights!.reduce((s, i) => s + i.confidence, 0) / total : 0
  const avgDelta = total > 0 ? insights!.reduce((s, i) => s + i.delta, 0) / total : 0

  return (
    <div className="p-6 text-slate-50">
      <PageHeader title="Causal Insights" subtitle="Understand WHY interventions work" />

      <PageGrid cols="3" className="mb-6">
        <StatCard label="Total Insights" value={total} color="purple" sub="causal relationships" />
        <StatCard
          label="Avg Confidence"
          value={`${Math.round(avgConfidence * 100)}%`}
          color={avgConfidence > 0.7 ? 'green' : avgConfidence > 0.4 ? 'yellow' : 'red'}
          sub="across all insights"
        />
        <StatCard
          label="Avg Delta"
          value={`${avgDelta >= 0 ? '+' : ''}${avgDelta.toFixed(2)}`}
          color={avgDelta >= 0 ? 'green' : 'red'}
          sub="metric improvement"
        />
      </PageGrid>

      <SectionCard title="Top Causal Insights">
        {!insights || insights.length === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">
            No causal insights yet — the system needs more observation data
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-border-dim">
                  <th className="text-left py-2 pr-3">Intervention</th>
                  <th className="text-left py-2 pr-3">Target</th>
                  <th className="text-left py-2 pr-3">Metric</th>
                  <th className="text-right py-2 pr-3">Delta</th>
                  <th className="text-right py-2 pr-3">Confidence</th>
                  <th className="text-right py-2">Samples</th>
                </tr>
              </thead>
              <tbody>
                {insights.map((row, i) => (
                  <tr key={i} className="border-b border-border-dim hover:bg-white/[0.02]">
                    <td className="py-2 pr-3">
                      <StatusBadge label={row.interventionType} color="blue" />
                    </td>
                    <td className="py-2 pr-3 text-slate-300 font-mono">{row.target}</td>
                    <td className="py-2 pr-3 text-slate-400">{row.metric}</td>
                    <td
                      className={`py-2 pr-3 text-right font-mono font-medium ${
                        row.delta >= 0 ? 'text-neon-green' : 'text-neon-red'
                      }`}
                    >
                      {row.delta >= 0 ? '+' : ''}
                      {row.delta.toFixed(2)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-slate-300">
                      {Math.round(row.confidence * 100)}%
                    </td>
                    <td className="py-2 text-right font-mono text-slate-500">{row.sampleSize}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
