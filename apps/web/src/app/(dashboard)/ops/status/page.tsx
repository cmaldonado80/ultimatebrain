'use client'

/**
 * Runtime Status — gateway providers, circuit breakers, and rate limiters.
 */

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 15_000

export default function RuntimeStatusPage() {
  const providersQuery = trpc.gateway.listProviders.useQuery(undefined, {
    refetchInterval: REFRESH,
  })
  const healthQuery = trpc.gateway.health.useQuery(undefined, { refetchInterval: REFRESH })

  if (providersQuery.isLoading) return <LoadingState message="Loading Runtime Status..." />

  const providers = (providersQuery.data ?? []) as Array<{
    provider: string
    createdAt: Date
  }>
  const health = (healthQuery.data ?? {}) as Record<string, { state: string; failures: number }>

  const healthEntries = Object.entries(health)
  const healthy = healthEntries.filter(([, v]) => v.state === 'closed').length

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Runtime Status"
        subtitle="LLM provider health, circuit breakers, and rate limits"
      />

      <PageGrid cols="3" className="mb-6">
        <StatCard label="Providers" value={providers.length} color="blue" sub="API keys stored" />
        <StatCard
          label="Circuit Breakers"
          value={healthEntries.length}
          color="purple"
          sub="monitored"
        />
        <StatCard
          label="Healthy"
          value={healthy}
          color="green"
          sub={`of ${healthEntries.length} breakers`}
        />
      </PageGrid>

      <SectionCard title="API Key Providers">
        {providers.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">No providers configured.</div>
        ) : (
          <div className="space-y-2">
            {providers.map((p) => (
              <div
                key={p.provider}
                className="flex items-center justify-between bg-bg-deep rounded px-4 py-3 border border-border-dim"
              >
                <span className="text-sm text-slate-200 font-medium capitalize">{p.provider}</span>
                <span className="text-[10px] text-slate-500">
                  Added {new Date(p.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Circuit Breaker States" className="mt-6">
        {healthEntries.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">No circuit breaker data.</div>
        ) : (
          <div className="space-y-2">
            {healthEntries.map(([name, cb]) => (
              <div
                key={name}
                className="flex items-center justify-between bg-bg-deep rounded px-4 py-2.5 border border-border-dim"
              >
                <span className="text-xs text-slate-200 capitalize">{name}</span>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    label={cb.state}
                    color={
                      cb.state === 'closed' ? 'green' : cb.state === 'half-open' ? 'yellow' : 'red'
                    }
                  />
                  {cb.failures > 0 && (
                    <span className="text-[10px] text-neon-red">{cb.failures} failures</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
