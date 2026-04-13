'use client'

/**
 * Incidents — tracked problem lifecycle for operator response.
 *
 * Shows active and resolved incidents with acknowledge/resolve actions.
 */

import { useState } from 'react'

import { ActionBar } from '../../../components/ui/action-bar'
import { EmptyState } from '../../../components/ui/empty-state'
import { FilterPills } from '../../../components/ui/filter-pills'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { PermissionGate } from '../../../components/ui/permission-gate'
import type { StatusColor } from '../../../components/ui/status-badge'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../lib/trpc'

const SEVERITY_STYLE: Record<string, { dot: string; border: string }> = {
  critical: { dot: 'bg-neon-red', border: 'border-neon-red/30' },
  high: { dot: 'bg-neon-red', border: 'border-neon-red/20' },
  medium: { dot: 'bg-neon-yellow', border: 'border-neon-yellow/20' },
  low: { dot: 'bg-slate-400', border: 'border-slate-600' },
}

const INCIDENT_STATUS_COLOR: Record<string, StatusColor> = {
  triggered: 'red',
  acknowledged: 'yellow',
  resolved: 'green',
}

const INCIDENT_STATUS_LABEL: Record<string, string> = {
  triggered: 'Triggered',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
}

type StatusFilter = 'all' | 'triggered' | 'acknowledged' | 'resolved'

const FILTER_OPTIONS = ['all', 'triggered', 'acknowledged', 'resolved'] as const

export default function IncidentsPage() {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const utils = trpc.useUtils()

  const query = trpc.alerting.getIncidents.useQuery(
    { status: filter === 'all' ? undefined : filter, limit: 30 },
    { refetchInterval: 15_000 },
  )
  const activeQuery = trpc.alerting.getActiveIncidents.useQuery(undefined, { staleTime: 15_000 })
  const ack = trpc.alerting.acknowledgeIncident.useMutation({
    onSuccess: () => {
      utils.alerting.getIncidents.invalidate()
      utils.alerting.getActiveIncidents.invalidate()
    },
  })
  const resolve = trpc.alerting.resolveIncident.useMutation({
    onSuccess: () => {
      utils.alerting.getIncidents.invalidate()
      utils.alerting.getActiveIncidents.invalidate()
    },
  })

  const incidents = query.data ?? []
  const activeCount = (activeQuery.data ?? []).length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader title="Incidents" count={activeCount > 0 ? `${activeCount} active` : undefined} />

      {/* Filters */}
      <FilterPills options={FILTER_OPTIONS} value={filter} onChange={setFilter} className="mb-4" />

      {/* Incident List */}
      {query.isLoading ? (
        <LoadingState message="Loading incidents..." fullHeight={false} />
      ) : incidents.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? 'No incidents recorded' : `No ${filter} incidents`}
          message="When incidents occur, they will appear here."
        />
      ) : (
        <div className="space-y-2">
          {incidents.map((inc) => {
            const sev = SEVERITY_STYLE[inc.severity] ?? SEVERITY_STYLE.low
            const statusColor = INCIDENT_STATUS_COLOR[inc.status] ?? 'slate'
            const statusLabel = INCIDENT_STATUS_LABEL[inc.status] ?? inc.status
            const isExpanded = expanded === inc.id
            return (
              <div key={inc.id} className={`cyber-card border ${sev.border} transition-colors`}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : inc.id)}
                  className="w-full text-left p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sev.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm text-slate-200 font-medium">
                          {inc.serviceName}
                        </span>
                        <StatusBadge label={statusLabel} color={statusColor} />
                        <span className="text-[9px] text-slate-600 font-mono">{inc.severity}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{inc.message}</div>
                    </div>
                    <span className="text-[10px] text-slate-600 flex-shrink-0">
                      {new Date(inc.triggeredAt).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-700">{isExpanded ? '▾' : '▸'}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-border-dim pt-2 space-y-2">
                    <div className="text-[10px] text-slate-500">
                      Service: <span className="text-slate-400">{inc.serviceId}</span>
                    </div>
                    {inc.acknowledgedAt && (
                      <div className="text-[10px] text-slate-500">
                        Acknowledged: {new Date(inc.acknowledgedAt).toLocaleString()}
                      </div>
                    )}
                    {inc.resolvedAt && (
                      <div className="text-[10px] text-slate-500">
                        Resolved: {new Date(inc.resolvedAt).toLocaleString()}
                      </div>
                    )}

                    {/* Actions — operator+ only */}
                    <ActionBar className="mt-2">
                      <PermissionGate require="operator">
                        {inc.status === 'triggered' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              ack.mutate({ id: inc.id })
                            }}
                            className="text-[10px] px-2.5 py-1 rounded bg-neon-yellow/10 text-neon-yellow hover:bg-neon-yellow/20 transition-colors"
                          >
                            Acknowledge
                          </button>
                        )}
                        {inc.status !== 'resolved' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              resolve.mutate({ id: inc.id })
                            }}
                            className="text-[10px] px-2.5 py-1 rounded bg-neon-green/10 text-neon-green hover:bg-neon-green/20 transition-colors"
                          >
                            Resolve
                          </button>
                        )}
                      </PermissionGate>
                      <a
                        href={`/ops/traces?service=${encodeURIComponent(inc.serviceName)}`}
                        className="text-[10px] text-neon-teal hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View traces →
                      </a>
                    </ActionBar>
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
