'use client'

/**
 * Gateway — LLM routing, cost tracking, and model usage.
 */

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 30_000

export default function GatewayPage() {
  const providersQuery = trpc.gateway.listProviders.useQuery(undefined, {
    refetchInterval: REFRESH,
  })
  const costQuery = trpc.gateway.costSummary.useQuery(undefined, { refetchInterval: REFRESH })
  if (providersQuery.isLoading) return <LoadingState message="Loading Gateway..." />

  const providers = (providersQuery.data ?? []) as Array<{
    provider: string
    createdAt: Date
  }>

  const cost = costQuery.data as {
    totalCostUsd: number
    totalTokensIn: number
    totalTokensOut: number
    totalCalls: number
    byProvider: Array<{ provider: string; cost: number; tokens: number; count: number }>
  } | null

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Gateway"
        subtitle="LLM provider routing, cost tracking, and model analytics"
      />

      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Total Cost"
          value={`$${(cost?.totalCostUsd ?? 0).toFixed(2)}`}
          color="yellow"
          sub="all providers"
        />
        <StatCard
          label="Total Tokens"
          value={
            (((cost?.totalTokensIn ?? 0) + (cost?.totalTokensOut ?? 0)) / 1000).toFixed(0) + 'k'
          }
          color="blue"
          sub="input + output"
        />
        <StatCard label="Providers" value={providers.length} color="purple" sub="API keys stored" />
        <StatCard
          label="By Provider"
          value={cost?.byProvider?.length ?? 0}
          color="green"
          sub="with usage data"
        />
      </PageGrid>

      <SectionCard title="Cost by Provider">
        {!cost?.byProvider?.length ? (
          <div className="text-xs text-slate-600 py-6 text-center">No usage data yet.</div>
        ) : (
          <div className="space-y-2">
            {cost.byProvider.map((bp) => (
              <div
                key={bp.provider}
                className="flex items-center justify-between bg-bg-deep rounded px-4 py-3 border border-border-dim"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-200 font-medium capitalize">
                    {bp.provider}
                  </span>
                  <span className="text-[10px] text-slate-500">{bp.count} requests</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400 font-mono">
                    {(bp.tokens / 1000).toFixed(0)}k tokens
                  </span>
                  <span className="text-xs text-neon-yellow font-mono">${bp.cost.toFixed(4)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Configured Providers" className="mt-6">
        <div className="space-y-2">
          {providers.map((p) => (
            <div
              key={p.provider}
              className="flex items-center justify-between bg-bg-deep rounded px-4 py-2.5 border border-border-dim"
            >
              <span className="text-xs text-slate-200 capitalize">{p.provider}</span>
              <span className="text-[10px] text-slate-500">
                Added {new Date(p.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
