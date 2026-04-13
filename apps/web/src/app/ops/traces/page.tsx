'use client'

/**
 * Traces — view recent distributed trace spans.
 */

import { DbErrorBanner } from '../../../components/db-error-banner'
import { EmptyState } from '../../../components/ui/empty-state'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../lib/trpc'

interface Span {
  spanId: string
  traceId: string
  parentSpanId: string | null
  operation: string
  service: string | null
  agentId: string | null
  ticketId: string | null
  durationMs: number | null
  status: string | null
  attributes: unknown
  createdAt: Date
}

export default function TracesPage() {
  const { data, isLoading, error } = trpc.traces.recent.useQuery({ limit: 100 })

  if (error) {
    return (
      <div className="p-6 text-slate-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (isLoading) {
    return <LoadingState message="Loading traces..." />
  }

  const spans: Span[] = (data as Span[]) ?? []

  return (
    <div className="p-6 text-slate-50">
      <PageHeader title="Traces" />

      {spans.length === 0 ? (
        <EmptyState title="No traces found" message="Traces appear as agents execute tasks." />
      ) : (
        <div className="cyber-table-scroll">
          <div className="bg-bg-elevated rounded-lg border border-border overflow-hidden min-w-[700px]">
            {/* Header */}
            <div className="flex px-4 py-2.5 bg-bg-deep border-b border-border">
              <span className="flex-[2] text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                Operation
              </span>
              <span className="flex-1 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                Service
              </span>
              <span className="flex-1 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                Status
              </span>
              <span className="flex-1 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                Duration
              </span>
              <span className="flex-1 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                Trace ID
              </span>
            </div>

            {/* Rows */}
            {spans.map((s) => (
              <div
                key={s.spanId}
                className="flex px-4 py-2.5 border-b border-border-dim items-center"
              >
                <span className="flex-[2] text-[13px] font-semibold font-mono">{s.operation}</span>
                <span className="flex-1 text-[13px]">{s.service || '—'}</span>
                <span className="flex-1 text-[13px]">
                  <span
                    className={
                      s.status === 'ok'
                        ? 'text-neon-green'
                        : s.status === 'error'
                          ? 'text-neon-red'
                          : 'text-neon-yellow'
                    }
                  >
                    {s.status || '—'}
                  </span>
                </span>
                <span className="flex-1 text-[13px]">
                  {s.durationMs != null ? `${s.durationMs}ms` : '—'}
                </span>
                <span className="flex-1 font-mono text-[10px] text-slate-500">
                  {s.traceId.slice(0, 12)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
