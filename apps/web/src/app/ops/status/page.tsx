'use client'

/**
 * Runtime Status — operator-facing platform health dashboard.
 *
 * Shows Brain, Mini Brains, and Development apps with real-time
 * health status, dependency breakdown, and recent issues.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { FilterPills } from '../../../components/ui/filter-pills'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../utils/trpc'

// ── Status Badge ──────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { label: string; dot: string; bg: string }> = {
  ok: { label: 'Healthy', dot: 'bg-neon-green', bg: 'bg-neon-green/5 border-neon-green/20' },
  degraded: {
    label: 'Degraded',
    dot: 'bg-neon-yellow',
    bg: 'bg-neon-yellow/5 border-neon-yellow/20',
  },
  down: { label: 'Down', dot: 'bg-neon-red', bg: 'bg-neon-red/5 border-neon-red/20' },
  unknown: { label: 'Unknown', dot: 'bg-slate-500', bg: 'bg-slate-800/50 border-slate-700' },
}

const TIER_LABEL: Record<string, string> = {
  brain: 'Brain',
  mini_brain: 'Mini Brain',
  development: 'Development',
}

type Filter = 'all' | 'brain' | 'mini_brain' | 'development' | 'issues'

export default function StatusPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const statusQuery = trpc.runtimeStatus.getRuntimeStatus.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 10_000,
  })
  const issuesQuery = trpc.runtimeStatus.getRecentIssues.useQuery(
    { limit: 10 },
    {
      staleTime: 30_000,
    },
  )

  const data = statusQuery.data
  const issues = issuesQuery.data ?? []

  const filteredServices = (data?.services ?? []).filter((s) => {
    if (filter === 'all') return true
    if (filter === 'issues') return s.status === 'degraded' || s.status === 'down'
    return s.serviceType === filter
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader title="Runtime Status" />

      {statusQuery.error && <DbErrorBanner error={{ message: statusQuery.error.message }} />}

      {/* Summary Bar */}
      {data && (
        <div className="flex items-center gap-4 mb-6 p-3 rounded-lg bg-bg-elevated/50 border border-border-dim">
          <div className="text-xs text-slate-400">
            <span className="text-white font-medium">{data.summary.total}</span> services
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full bg-neon-green" />
            <span className="text-neon-green">{data.summary.ok}</span>
          </div>
          {data.summary.degraded > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-neon-yellow" />
              <span className="text-neon-yellow">{data.summary.degraded}</span>
            </div>
          )}
          {data.summary.down > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-neon-red" />
              <span className="text-neon-red">{data.summary.down}</span>
            </div>
          )}
          {data.summary.unknown > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              <span className="text-slate-400">{data.summary.unknown}</span>
            </div>
          )}
          <span className="ml-auto text-[10px] text-slate-600">Auto-refresh 30s</span>
        </div>
      )}

      {/* Filters */}
      <FilterPills
        options={['all', 'brain', 'mini_brain', 'development', 'issues'] as const}
        value={filter}
        onChange={setFilter}
        labels={{
          all: 'All',
          brain: 'Brain',
          mini_brain: 'Mini Brains',
          development: 'Developments',
          issues: 'Issues Only',
        }}
        className="mb-4"
      />

      {/* Service Cards */}
      {statusQuery.isLoading ? (
        <LoadingState message="Loading runtime status..." />
      ) : filteredServices.length === 0 ? (
        <div className="text-sm text-slate-600 py-12 text-center">
          {filter === 'issues' ? 'No issues detected' : 'No services found'}
        </div>
      ) : (
        <div className="space-y-2 mb-8">
          {filteredServices.map((svc) => {
            const style = STATUS_STYLE[svc.status] ?? STATUS_STYLE.unknown
            const isExpanded = expanded === svc.serviceId
            return (
              <div
                key={svc.serviceId}
                className={`cyber-card border ${style.bg} transition-colors`}
              >
                <button
                  onClick={() => setExpanded(isExpanded ? null : svc.serviceId)}
                  className="w-full text-left p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-200 font-medium">{svc.name}</span>
                        <span className="text-[9px] text-slate-600 font-mono">
                          {TIER_LABEL[svc.serviceType] ?? svc.serviceType}
                        </span>
                        {svc.domain && (
                          <span className="text-[9px] text-neon-blue">{svc.domain}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-500">
                        {svc.latencyMs != null && <span>{svc.latencyMs}ms</span>}
                        {svc.uptimeSeconds != null && (
                          <span>{Math.round(svc.uptimeSeconds / 60)}m uptime</span>
                        )}
                        {svc.message && (
                          <span className="text-slate-400 truncate">{svc.message}</span>
                        )}
                        <span className="ml-auto text-slate-700">
                          {new Date(svc.checkedAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                    {/* Dependency chips */}
                    {svc.dependencies.length > 0 && (
                      <div className="flex items-center gap-1">
                        {svc.dependencies.map((dep) => (
                          <span
                            key={dep.name}
                            className={`text-[8px] px-1.5 py-0.5 rounded ${
                              dep.status === 'ok'
                                ? 'bg-neon-green/10 text-neon-green'
                                : dep.status === 'degraded'
                                  ? 'bg-neon-yellow/10 text-neon-yellow'
                                  : dep.status === 'down'
                                    ? 'bg-neon-red/10 text-neon-red'
                                    : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            {dep.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="text-[10px] text-slate-700">{isExpanded ? '▾' : '▸'}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-border-dim pt-2 space-y-2">
                    {svc.endpoint && (
                      <div className="text-[10px] text-slate-500">
                        Endpoint: <span className="font-mono text-slate-400">{svc.endpoint}</span>
                      </div>
                    )}
                    {svc.dependencies.length > 0 && (
                      <div>
                        <div className="text-[10px] text-slate-600 mb-1">Dependencies:</div>
                        {svc.dependencies.map((dep) => (
                          <div key={dep.name} className="flex items-center gap-2 text-[10px]">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                STATUS_STYLE[dep.status]?.dot ?? 'bg-slate-500'
                              }`}
                            />
                            <span className="text-slate-400">{dep.name}</span>
                            <span className="text-slate-500">{dep.status}</span>
                            {dep.latencyMs != null && (
                              <span className="text-slate-600">{dep.latencyMs}ms</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <a
                      href={`/ops/traces?service=${encodeURIComponent(svc.name)}`}
                      className="text-[10px] text-neon-teal hover:underline"
                    >
                      View traces →
                    </a>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Recent Issues */}
      {issues.length > 0 && (
        <div>
          <h2 className="text-xs font-orbitron text-slate-400 uppercase tracking-wider mb-3">
            Recent Issues (last hour)
          </h2>
          <div className="space-y-1">
            {issues.map((issue) => (
              <div key={issue.id} className="cyber-card p-2.5 flex items-center gap-3 text-xs">
                <span className="w-2 h-2 rounded-full bg-neon-red flex-shrink-0" />
                <span className="text-slate-400 font-mono w-24 flex-shrink-0">
                  {new Date(issue.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-slate-300">{issue.service}</span>
                <span className="text-slate-500">{issue.operation}</span>
                {issue.error && (
                  <span className="text-neon-red truncate flex-1">{issue.error}</span>
                )}
                {issue.durationMs != null && (
                  <span className="text-slate-600 flex-shrink-0">{issue.durationMs}ms</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
