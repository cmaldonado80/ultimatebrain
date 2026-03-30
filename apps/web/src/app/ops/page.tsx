'use client'

/**
 * Ops Overview — system-wide operational dashboard.
 */

import { DbErrorBanner } from '../../components/db-error-banner'
import { LoadingState } from '../../components/ui/loading-state'
import { PageHeader } from '../../components/ui/page-header'
import { StatCard } from '../../components/ui/stat-card'
import { trpc } from '../../utils/trpc'

export default function OpsOverviewPage() {
  const healthQuery = trpc.healing.healthCheck.useQuery()
  const tracesQuery = trpc.traces.recent.useQuery({ limit: 10 })
  const approvalsQuery = trpc.approvals.pending.useQuery()
  const gatewayHealthQuery = trpc.gateway.health.useQuery()
  const costQuery = trpc.gateway.costSummary.useQuery()

  const isLoading =
    healthQuery.isLoading ||
    tracesQuery.isLoading ||
    approvalsQuery.isLoading ||
    gatewayHealthQuery.isLoading
  const error =
    healthQuery.error || tracesQuery.error || approvalsQuery.error || gatewayHealthQuery.error

  if (error) {
    return (
      <div className="p-6 text-slate-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 text-slate-50">
        <LoadingState message="Loading ops overview..." />
      </div>
    )
  }

  const health = healthQuery.data as
    | { status: string; checks?: Record<string, { status: string; message?: string }> }
    | undefined
  const traces = (tracesQuery.data as unknown[]) ?? []
  const pendingApprovals = (approvalsQuery.data as unknown[]) ?? []
  const gatewayHealth = gatewayHealthQuery.data as { status: string } | undefined

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Ops Overview"
        subtitle="System-wide operational dashboard — health, throughput, errors, and SLA compliance."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-6">
        <StatCard
          label="System Health"
          value={health?.status || 'unknown'}
          color={health?.status === 'healthy' ? 'green' : 'red'}
        />
        <StatCard
          label="Gateway"
          value={gatewayHealth?.status || 'unknown'}
          color={gatewayHealth?.status === 'healthy' ? 'green' : 'yellow'}
        />
        <StatCard label="Recent Traces" value={traces.length} />
        <StatCard
          label="Pending Approvals"
          value={pendingApprovals.length}
          color={pendingApprovals.length > 0 ? 'yellow' : 'green'}
        />
      </div>

      {/* Cost & Performance */}
      {costQuery.data && (
        <div className="mb-6">
          <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
            Cost & Performance
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
            <div className="cyber-card p-3.5 text-center">
              <div className="text-xl font-bold text-neon-green">
                ${costQuery.data.totalCostUsd.toFixed(4)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Total Cost</div>
            </div>
            <div className="cyber-card p-3.5 text-center">
              <div className="text-xl font-bold">
                {(costQuery.data.totalTokensIn + costQuery.data.totalTokensOut).toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Total Tokens</div>
            </div>
            <div className="cyber-card p-3.5 text-center">
              <div className="text-xl font-bold">{costQuery.data.avgLatencyMs}ms</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Avg Latency</div>
            </div>
            <div className="cyber-card p-3.5 text-center">
              <div className="text-xl font-bold text-neon-purple">
                {costQuery.data.cacheHitRate}%
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Cache Hit Rate</div>
            </div>
          </div>

          {costQuery.data.byProvider.length > 0 && (
            <div className="mb-3">
              <div className="text-[11px] text-slate-500 mb-1">Cost by Provider</div>
              <div className="flex flex-col gap-1">
                {costQuery.data.byProvider.map((p) => (
                  <div
                    key={p.provider}
                    className="flex items-center gap-2 px-3 py-1 bg-bg-elevated rounded text-xs"
                  >
                    <span className="flex-1 font-mono">{p.provider}</span>
                    <span className="text-neon-green">${p.cost.toFixed(4)}</span>
                    <span className="text-slate-500">{p.tokens.toLocaleString()} tokens</span>
                    <span className="text-slate-600">{p.count} calls</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {costQuery.data.byModel.length > 0 && (
            <div>
              <div className="text-[11px] text-slate-500 mb-1">Cost by Model</div>
              <div className="flex flex-col gap-1">
                {costQuery.data.byModel.map((m) => (
                  <div
                    key={m.model}
                    className="flex items-center gap-2 px-3 py-1 bg-bg-elevated rounded text-xs"
                  >
                    <span className="flex-1 font-mono">{m.model}</span>
                    <span className="text-neon-green">${m.cost.toFixed(4)}</span>
                    <span className="text-slate-500">{m.tokens.toLocaleString()} tokens</span>
                    <span className="text-slate-600">{m.count} calls</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Health Checks */}
      {health?.checks && (
        <div className="mb-6">
          <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
            Health Checks
          </div>
          <div className="flex flex-col gap-1">
            {Object.entries(health.checks).map(([name, check]) => (
              <div
                key={name}
                className="flex items-center gap-2 px-3 py-1.5 bg-bg-elevated rounded-md border border-border text-xs"
              >
                <span
                  className={`neon-dot ${check.status === 'ok' ? 'neon-dot-green' : 'neon-dot-red'}`}
                />
                <span className="flex-1 font-mono">{name}</span>
                <span className="text-slate-500">{check.status}</span>
                {check.message && (
                  <span className="text-slate-600 max-w-[200px] truncate">{check.message}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Traces */}
      {traces.length > 0 && (
        <div className="mb-6">
          <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
            Recent Traces
          </div>
          {(
            traces as {
              spanId: string
              operation: string
              status: string | null
              durationMs: number | null
            }[]
          ).map((t) => (
            <div
              key={t.spanId}
              className="flex items-center gap-3 px-3 py-1.5 bg-bg-elevated rounded-md border border-border text-xs mb-1"
            >
              <span className="flex-1 font-mono font-semibold">{t.operation}</span>
              <span
                className={
                  t.status === 'ok'
                    ? 'text-neon-green'
                    : t.status === 'error'
                      ? 'text-neon-red'
                      : 'text-slate-500'
                }
              >
                {t.status || '—'}
              </span>
              <span className="text-slate-500">
                {t.durationMs != null ? `${t.durationMs}ms` : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
