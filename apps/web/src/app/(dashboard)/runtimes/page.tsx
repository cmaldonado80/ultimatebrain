'use client'

/**
 * Runtimes — deployment lifecycle management for Mini Brains and Development apps.
 *
 * Shows all runtime instances with lifecycle status, endpoint, environment,
 * deployment metadata, and lifecycle management actions.
 */

import { useState } from 'react'

import { ActionBar } from '../../../components/ui/action-bar'
import { EmptyState } from '../../../components/ui/empty-state'
import { FilterPills } from '../../../components/ui/filter-pills'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import type { StatusColor } from '../../../components/ui/status-badge'
import { StatusBadge } from '../../../components/ui/status-badge'
import { useOrgRole } from '../../../hooks/use-org-role'
import { trpc } from '../../../lib/trpc'

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

const STATUS_COLOR: Record<string, StatusColor> = {
  active: 'green',
  verified: 'teal',
  deployed: 'yellow',
  degraded: 'yellow',
  suspended: 'red',
  retired: 'slate',
  provisioning: 'slate',
  configured: 'blue',
}

const TIER_LABEL: Record<string, string> = {
  brain: 'Brain',
  mini_brain: 'Mini Brain',
  development: 'Development',
}

type Filter = 'all' | 'mini_brain' | 'development'

const FILTER_OPTIONS = ['all', 'mini_brain', 'development'] as const
const FILTER_LABELS: Partial<Record<Filter, string>> = {
  all: 'All',
  mini_brain: 'Mini Brain',
  development: 'Development',
}

const SECRET_STATUS_STYLE: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'text-neon-green' },
  rotating: { label: 'Rotating', color: 'text-neon-yellow' },
  pending_activation: { label: 'Pending', color: 'text-neon-blue' },
  revoked: { label: 'Revoked', color: 'text-slate-600' },
}

function SecretsPanel({ entityId }: { entityId: string }) {
  const [newKey, setNewKey] = useState<string | null>(null)
  const utils = trpc.useUtils()
  const secretsQuery = trpc.secrets.list.useQuery({ entityId })
  const rotateMut = trpc.secrets.rotate.useMutation({
    onSuccess: (data) => {
      setNewKey(data.plaintextKey)
      utils.secrets.list.invalidate({ entityId })
    },
  })
  const activateMut = trpc.secrets.activate.useMutation({
    onSuccess: () => {
      setNewKey(null)
      utils.secrets.list.invalidate({ entityId })
    },
  })
  const revokeMut = trpc.secrets.revoke.useMutation({
    onSuccess: () => utils.secrets.list.invalidate({ entityId }),
  })
  const rollbackMut = trpc.secrets.rollback.useMutation({
    onSuccess: () => {
      setNewKey(null)
      utils.secrets.list.invalidate({ entityId })
    },
  })

  const secrets = (secretsQuery.data ?? []).filter((s) => s.status !== 'revoked')
  if (secrets.length === 0 && !secretsQuery.isLoading) return null

  return (
    <div className="mt-2">
      <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Secrets</div>
      {newKey && (
        <div className="bg-neon-green/5 border border-neon-green/20 rounded px-2.5 py-1.5 mb-1.5 text-[10px]">
          <span className="text-neon-green font-medium">New key: </span>
          <code className="text-slate-300 font-mono select-all">{newKey}</code>
          <span className="text-neon-yellow ml-2">(copy now — shown once)</span>
        </div>
      )}
      <div className="space-y-1">
        {secrets.map((s) => {
          const style = SECRET_STATUS_STYLE[s.status] ?? SECRET_STATUS_STYLE.active
          return (
            <div
              key={s.id}
              className="flex items-center gap-2 bg-bg-elevated rounded px-2 py-1 text-[10px]"
            >
              <span className="text-slate-400 font-medium w-[100px] truncate">{s.type}</span>
              <span className="font-mono text-slate-500">{s.keyPrefix}</span>
              <span className="text-slate-600">v{s.version}</span>
              <span className={`${style!.color}`}>{style!.label}</span>
              <span className="flex-1" />
              {s.status === 'active' && (
                <button
                  className="text-neon-yellow hover:text-neon-yellow/80"
                  onClick={(e) => {
                    e.stopPropagation()
                    rotateMut.mutate({ secretId: s.id })
                  }}
                  disabled={rotateMut.isPending}
                >
                  Rotate
                </button>
              )}
              {s.status === 'pending_activation' && (
                <>
                  <button
                    className="text-neon-green hover:text-neon-green/80"
                    onClick={(e) => {
                      e.stopPropagation()
                      activateMut.mutate({ secretId: s.id })
                    }}
                    disabled={activateMut.isPending}
                  >
                    Activate
                  </button>
                  <button
                    className="text-neon-red hover:text-neon-red/80"
                    onClick={(e) => {
                      e.stopPropagation()
                      rollbackMut.mutate({ secretId: s.id })
                    }}
                    disabled={rollbackMut.isPending}
                  >
                    Rollback
                  </button>
                </>
              )}
              {s.status === 'active' && (
                <button
                  className="text-neon-red/50 hover:text-neon-red"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm('Revoke this secret? This may break running services.')) {
                      revokeMut.mutate({ secretId: s.id })
                    }
                  }}
                >
                  Revoke
                </button>
              )}
            </div>
          )
        })}
      </div>
      {(rotateMut.error || activateMut.error || revokeMut.error || rollbackMut.error) && (
        <div className="text-[10px] text-neon-red mt-1">
          {rotateMut.error?.message ??
            activateMut.error?.message ??
            revokeMut.error?.message ??
            rollbackMut.error?.message}
        </div>
      )}
    </div>
  )
}

export default function RuntimesPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const { isOperator } = useOrgRole()
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
      <PageHeader title="Runtimes" count={total > 0 ? total : undefined} />

      {/* Summary */}
      <div className="flex items-center gap-4 mb-6 p-3 rounded-lg bg-bg-elevated/50 border border-border-dim">
        <div className="text-xs text-slate-400">
          <span className="text-white font-medium">{total}</span> runtimes
        </div>
        {activeCount > 0 && <StatusBadge label={`${activeCount} active`} color="green" dot />}
        {degradedCount > 0 && (
          <StatusBadge label={`${degradedCount} degraded`} color="yellow" dot pulse />
        )}
        {provisioningCount > 0 && (
          <StatusBadge label={`${provisioningCount} pending`} color="slate" dot />
        )}
      </div>

      {/* Filters */}
      <FilterPills
        options={FILTER_OPTIONS}
        value={filter}
        onChange={setFilter}
        labels={FILTER_LABELS}
        className="mb-4"
      />

      {/* Runtime list */}
      {query.isLoading ? (
        <LoadingState message="Loading runtimes..." fullHeight={false} />
      ) : runtimes.length === 0 ? (
        <EmptyState title="No runtimes found" message="No runtimes match the current filter." />
      ) : (
        <div className="space-y-2">
          {runtimes.map((rt) => {
            const style = STATUS_STYLE[rt.status] ?? STATUS_STYLE.provisioning
            const badgeColor = STATUS_COLOR[rt.status] ?? 'slate'
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
                        <StatusBadge label={style.label} color={badgeColor} />
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

                    {/* Secrets */}
                    <SecretsPanel entityId={rt.id} />

                    {/* Actions (operator+ only) */}
                    {isOperator && (
                      <ActionBar className="mt-2">
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
                      </ActionBar>
                    )}
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
