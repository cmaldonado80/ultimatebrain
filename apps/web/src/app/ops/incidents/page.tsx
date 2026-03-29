'use client'

/**
 * Incidents — tracked problem lifecycle for operator response.
 *
 * Shows active and resolved incidents with acknowledge/resolve actions.
 */

import { useState } from 'react'

import { trpc } from '../../../utils/trpc'

const SEVERITY_STYLE: Record<string, { dot: string; border: string }> = {
  critical: { dot: 'bg-neon-red', border: 'border-neon-red/30' },
  high: { dot: 'bg-neon-red', border: 'border-neon-red/20' },
  medium: { dot: 'bg-neon-yellow', border: 'border-neon-yellow/20' },
  low: { dot: 'bg-slate-400', border: 'border-slate-600' },
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  triggered: { label: 'Triggered', cls: 'text-neon-red bg-neon-red/10' },
  acknowledged: { label: 'Acknowledged', cls: 'text-neon-yellow bg-neon-yellow/10' },
  resolved: { label: 'Resolved', cls: 'text-neon-green bg-neon-green/10' },
}

type StatusFilter = 'all' | 'triggered' | 'acknowledged' | 'resolved'

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
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-orbitron text-white">Incidents</h1>
        {activeCount > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-neon-red/10 text-neon-red font-mono">
            {activeCount} active
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 mb-4">
        {(['all', 'triggered', 'acknowledged', 'resolved'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-[10px] px-2.5 py-1 rounded transition-colors capitalize ${
              filter === s
                ? 'bg-neon-teal/10 text-neon-teal ring-1 ring-neon-teal/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Incident List */}
      {query.isLoading ? (
        <div className="text-sm text-slate-500 py-12 text-center">Loading incidents...</div>
      ) : incidents.length === 0 ? (
        <div className="text-sm text-slate-600 py-12 text-center">
          {filter === 'all' ? 'No incidents recorded' : `No ${filter} incidents`}
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map((inc) => {
            const sev = SEVERITY_STYLE[inc.severity] ?? SEVERITY_STYLE.low
            const badge = STATUS_BADGE[inc.status] ?? STATUS_BADGE.triggered
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
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${badge.cls}`}>
                          {badge.label}
                        </span>
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

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-2">
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
                      <a
                        href={`/ops/traces?service=${encodeURIComponent(inc.serviceName)}`}
                        className="text-[10px] text-neon-teal hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View traces →
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
