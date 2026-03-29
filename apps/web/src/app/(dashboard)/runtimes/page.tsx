'use client'

/**
 * Runtimes — deployment lifecycle management for Mini Brains and Development apps.
 *
 * Shows all runtime instances with lifecycle status, endpoint, environment,
 * deployment metadata, and lifecycle management actions.
 */

import { useState } from 'react'

import { trpc } from '../../../utils/trpc'

const STATUS_STYLE: Record<string, { label: string; dot: string }> = {
  provisioning: { label: 'Provisioning', dot: 'bg-slate-400' },
  configured: { label: 'Configured', dot: 'bg-neon-blue' },
  deployed: { label: 'Deployed', dot: 'bg-neon-yellow' },
  verified: { label: 'Verified', dot: 'bg-neon-teal' },
  active: { label: 'Active', dot: 'bg-neon-green' },
  degraded: { label: 'Degraded', dot: 'bg-neon-yellow animate-pulse' },
  suspended: { label: 'Suspended', dot: 'bg-neon-red' },
  retired: { label: 'Retired', dot: 'bg-slate-600' },
}

const TIER_LABEL: Record<string, string> = {
  brain: 'Brain',
  mini_brain: 'Mini Brain',
  development: 'Development',
}

type Filter = 'all' | 'mini_brain' | 'development'

export default function RuntimesPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const utils = trpc.useUtils()

  const query = trpc.runtimes.getRuntimes.useQuery(
    { tier: filter === 'all' ? undefined : filter },
    { staleTime: 15_000 },
  )
  const verify = trpc.runtimes.verifyRuntime.useMutation({
    onSuccess: () => utils.runtimes.getRuntimes.invalidate(),
  })
  const suspend = trpc.runtimes.suspendRuntime.useMutation({
    onSuccess: () => utils.runtimes.getRuntimes.invalidate(),
  })
  const activate = trpc.runtimes.activateRuntime.useMutation({
    onSuccess: () => utils.runtimes.getRuntimes.invalidate(),
  })
  const retire = trpc.runtimes.retireRuntime.useMutation({
    onSuccess: () => utils.runtimes.getRuntimes.invalidate(),
  })

  const runtimes = query.data ?? []

  // Summary counts
  const total = runtimes.length
  const activeCount = runtimes.filter((r) => r.status === 'active').length
  const degradedCount = runtimes.filter((r) => r.status === 'degraded').length
  const provisioningCount = runtimes.filter(
    (r) => r.status === 'provisioning' || r.status === 'configured' || r.status === 'deployed',
  ).length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-orbitron text-white mb-6">Runtimes</h1>

      {/* Summary */}
      <div className="flex items-center gap-4 mb-6 p-3 rounded-lg bg-bg-elevated/50 border border-border-dim">
        <div className="text-xs text-slate-400">
          <span className="text-white font-medium">{total}</span> runtimes
        </div>
        {activeCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full bg-neon-green" />
            <span className="text-neon-green">{activeCount} active</span>
          </div>
        )}
        {degradedCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full bg-neon-yellow" />
            <span className="text-neon-yellow">{degradedCount} degraded</span>
          </div>
        )}
        {provisioningCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-slate-400">{provisioningCount} pending</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 mb-4">
        {(['all', 'mini_brain', 'development'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[10px] px-2.5 py-1 rounded transition-colors ${
              filter === f
                ? 'bg-neon-teal/10 text-neon-teal ring-1 ring-neon-teal/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            {f === 'all' ? 'All' : (TIER_LABEL[f] ?? f)}
          </button>
        ))}
      </div>

      {/* Runtime list */}
      {query.isLoading ? (
        <div className="text-sm text-slate-500 py-12 text-center">Loading runtimes...</div>
      ) : runtimes.length === 0 ? (
        <div className="text-sm text-slate-600 py-12 text-center">No runtimes found</div>
      ) : (
        <div className="space-y-2">
          {runtimes.map((rt) => {
            const style = STATUS_STYLE[rt.status] ?? STATUS_STYLE.provisioning
            const isExpanded = expanded === rt.id
            return (
              <div key={rt.id} className="cyber-card transition-colors">
                <button
                  onClick={() => setExpanded(isExpanded ? null : rt.id)}
                  className="w-full text-left p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm text-slate-200 font-medium">{rt.name}</span>
                        <span className="text-[9px] text-slate-600 font-mono">
                          {TIER_LABEL[rt.tier] ?? rt.tier}
                        </span>
                        {rt.domain && (
                          <span className="text-[9px] text-neon-blue">{rt.domain}</span>
                        )}
                        <span
                          className={`text-[8px] px-1.5 py-0.5 rounded ${
                            rt.status === 'active'
                              ? 'bg-neon-green/10 text-neon-green'
                              : rt.status === 'suspended'
                                ? 'bg-neon-red/10 text-neon-red'
                                : 'bg-slate-700/50 text-slate-400'
                          }`}
                        >
                          {style.label}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 flex gap-3">
                        {rt.endpoint && (
                          <span className="font-mono truncate max-w-[200px]">{rt.endpoint}</span>
                        )}
                        {rt.environment && <span>{rt.environment}</span>}
                        {rt.deploymentProvider && <span>{rt.deploymentProvider}</span>}
                        {rt.version && <span>v{rt.version}</span>}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-700">{isExpanded ? '▾' : '▸'}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-border-dim pt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                      <div className="text-slate-500">ID</div>
                      <div className="text-slate-400 font-mono">{rt.id.slice(0, 12)}...</div>
                      {rt.endpoint && (
                        <>
                          <div className="text-slate-500">Endpoint</div>
                          <div className="text-slate-400 font-mono truncate">{rt.endpoint}</div>
                        </>
                      )}
                      {rt.environment && (
                        <>
                          <div className="text-slate-500">Environment</div>
                          <div className="text-slate-300">{rt.environment}</div>
                        </>
                      )}
                      {rt.deploymentProvider && (
                        <>
                          <div className="text-slate-500">Provider</div>
                          <div className="text-slate-300">{rt.deploymentProvider}</div>
                        </>
                      )}
                      {rt.lastDeployedAt && (
                        <>
                          <div className="text-slate-500">Last deployed</div>
                          <div className="text-slate-400">
                            {new Date(rt.lastDeployedAt).toLocaleString()}
                          </div>
                        </>
                      )}
                      <div className="text-slate-500">Created</div>
                      <div className="text-slate-400">
                        {new Date(rt.createdAt).toLocaleString()}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-2">
                      {rt.endpoint && rt.status !== 'active' && rt.status !== 'retired' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            verify.mutate({ entityId: rt.id })
                          }}
                          className="text-[10px] px-2.5 py-1 rounded bg-neon-teal/10 text-neon-teal hover:bg-neon-teal/20 transition-colors"
                        >
                          Verify
                        </button>
                      )}
                      {rt.status === 'suspended' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            activate.mutate({ entityId: rt.id })
                          }}
                          className="text-[10px] px-2.5 py-1 rounded bg-neon-green/10 text-neon-green hover:bg-neon-green/20 transition-colors"
                        >
                          Activate
                        </button>
                      )}
                      {(rt.status === 'active' || rt.status === 'degraded') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            suspend.mutate({ entityId: rt.id })
                          }}
                          className="text-[10px] px-2.5 py-1 rounded bg-neon-yellow/10 text-neon-yellow hover:bg-neon-yellow/20 transition-colors"
                        >
                          Suspend
                        </button>
                      )}
                      {rt.status !== 'retired' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            retire.mutate({ entityId: rt.id })
                          }}
                          className="text-[10px] px-2.5 py-1 rounded bg-neon-red/10 text-neon-red hover:bg-neon-red/20 transition-colors"
                        >
                          Retire
                        </button>
                      )}
                      <a
                        href={`/ops/status`}
                        className="text-[10px] text-neon-teal hover:underline ml-auto"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View status →
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
