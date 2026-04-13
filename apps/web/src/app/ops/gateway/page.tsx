'use client'

/**
 * Gateway — LLM Gateway metrics, health, and provider status.
 */

import { DbErrorBanner } from '../../../components/db-error-banner'
import { EmptyState } from '../../../components/ui/empty-state'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../lib/trpc'

interface GatewayMetric {
  id: string
  provider: string
  model: string
  agentId: string | null
  ticketId: string | null
  tokensIn: number | null
  tokensOut: number | null
  latencyMs: number | null
  costUsd: number | null
  cached: boolean | null
  error: string | null
  createdAt: Date
}

export default function GatewayPage() {
  const metricsQuery = trpc.gateway.metrics.useQuery({ limit: 100 })
  const healthQuery = trpc.gateway.health.useQuery()
  const providersQuery = trpc.gateway.listProviders.useQuery()

  const error = metricsQuery.error || healthQuery.error || providersQuery.error

  if (error) {
    return (
      <div className="p-6 text-slate-100">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  const isLoading = metricsQuery.isLoading || healthQuery.isLoading || providersQuery.isLoading

  if (isLoading) {
    return <LoadingState message="Loading gateway data..." />
  }

  const metrics: GatewayMetric[] = (metricsQuery.data as GatewayMetric[]) ?? []
  const health = healthQuery.data as
    | { status: string; uptime?: number; requestCount?: number }
    | undefined
  const providers = providersQuery.data as string[] | undefined

  const totalCost = metrics.reduce((sum, m) => sum + (m.costUsd ?? 0), 0)
  const totalTokens = metrics.reduce((sum, m) => sum + (m.tokensIn ?? 0) + (m.tokensOut ?? 0), 0)
  const avgLatency =
    metrics.length > 0
      ? Math.round(metrics.reduce((sum, m) => sum + (m.latencyMs ?? 0), 0) / metrics.length)
      : 0

  return (
    <div className="p-6 text-slate-100">
      <PageHeader title="Gateway" subtitle="API costs, latency, and provider health." />
      <div className="grid grid-cols-6 gap-2.5 mb-5">
        <div className="cyber-card p-3.5 text-center">
          <div
            className={`text-lg font-bold ${health?.status === 'healthy' ? 'text-neon-green' : 'text-neon-yellow'}`}
          >
            {health?.status || 'unknown'}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Health</div>
        </div>
        <div className="cyber-card p-3.5 text-center">
          <div className="text-lg font-bold">{metrics.length}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Requests</div>
        </div>
        <div className="cyber-card p-3.5 text-center">
          <div className="text-lg font-bold">${totalCost.toFixed(4)}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Total Cost</div>
        </div>
        <div className="cyber-card p-3.5 text-center">
          <div className="text-lg font-bold">{totalTokens.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Total Tokens</div>
        </div>
        <div className="cyber-card p-3.5 text-center">
          <div className="text-lg font-bold">{avgLatency}ms</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Avg Latency</div>
        </div>
        <div className="cyber-card p-3.5 text-center">
          <div className="text-lg font-bold">{providers?.length ?? 0}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Providers</div>
        </div>
      </div>

      {metrics.length === 0 ? (
        <EmptyState title="No gateway metrics yet" />
      ) : (
        <div className="cyber-card overflow-hidden">
          <div className="flex px-4 py-2.5 bg-bg-elevated border-b border-border">
            <span className="flex-1 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Provider
            </span>
            <span className="flex-1 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Model
            </span>
            <span className="flex-1 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Tokens
            </span>
            <span className="flex-1 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Latency
            </span>
            <span className="flex-1 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Cost
            </span>
            <span className="flex-1 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Cached
            </span>
          </div>
          {metrics.map((m) => (
            <div key={m.id} className="flex px-4 py-2.5 border-b border-border-dim items-center">
              <span className="flex-1 text-xs">{m.provider}</span>
              <span className="flex-1 text-[11px] font-mono">{m.model}</span>
              <span className="flex-1 text-xs">{(m.tokensIn ?? 0) + (m.tokensOut ?? 0)}</span>
              <span className="flex-1 text-xs">
                {m.latencyMs != null ? `${m.latencyMs}ms` : '—'}
              </span>
              <span className="flex-1 text-xs">
                {m.costUsd != null ? `$${m.costUsd.toFixed(4)}` : '—'}
              </span>
              <span className="flex-1 text-xs">{m.cached ? 'Yes' : 'No'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
