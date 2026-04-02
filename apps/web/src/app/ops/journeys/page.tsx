'use client'

/**
 * Journeys — view and manage active journey (state machine) executions.
 */

import { DbErrorBanner } from '../../../components/db-error-banner'
import { EmptyState } from '../../../components/ui/empty-state'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../utils/trpc'

interface JourneyExecution {
  id: string
  journeyId: string
  currentState: string
  history: Array<{
    fromState: string
    toState: string
    trigger: string
    timestamp: Date
    reasoning?: string
  }>
  context: Record<string, unknown>
  status: 'active' | 'completed' | 'failed' | 'paused'
  startedAt: Date
  completedAt?: Date
}

const STATUS_STYLE: Record<string, string> = {
  active: 'neon-dot-green neon-dot-pulse',
  completed: 'neon-dot-blue',
  failed: 'neon-dot-red',
  paused: 'neon-dot-yellow',
}

const STATUS_TEXT: Record<string, string> = {
  active: 'text-neon-green',
  completed: 'text-neon-blue',
  failed: 'text-neon-red',
  paused: 'text-neon-yellow',
}

export default function JourneysPage() {
  const { data, isLoading, error } = trpc.journeys.list.useQuery()
  const utils = trpc.useUtils()

  const pauseMut = trpc.journeys.pause.useMutation({
    onSuccess: () => utils.journeys.list.invalidate(),
  })
  const resumeMut = trpc.journeys.resume.useMutation({
    onSuccess: () => utils.journeys.list.invalidate(),
  })
  const failMut = trpc.journeys.fail.useMutation({
    onSuccess: () => utils.journeys.list.invalidate(),
  })

  if (error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (isLoading) {
    return <LoadingState message="Loading journeys..." />
  }

  const executions = (data ?? []) as JourneyExecution[]

  return (
    <div className="p-6 text-slate-50">
      <PageHeader title="Journeys" />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="cyber-card p-3 text-center">
          <div className="text-xl font-bold text-neon-blue font-orbitron">{executions.length}</div>
          <div className="text-[10px] text-slate-500">Total</div>
        </div>
        <div className="cyber-card p-3 text-center">
          <div className="text-xl font-bold text-neon-green font-orbitron">
            {executions.filter((e) => e.status === 'active').length}
          </div>
          <div className="text-[10px] text-slate-500">Active</div>
        </div>
        <div className="cyber-card p-3 text-center">
          <div className="text-xl font-bold text-neon-yellow font-orbitron">
            {executions.filter((e) => e.status === 'paused').length}
          </div>
          <div className="text-[10px] text-slate-500">Paused</div>
        </div>
        <div className="cyber-card p-3 text-center">
          <div className="text-xl font-bold text-neon-red font-orbitron">
            {executions.filter((e) => e.status === 'failed').length}
          </div>
          <div className="text-[10px] text-slate-500">Failed</div>
        </div>
      </div>

      {/* Executions */}
      {executions.length === 0 ? (
        <EmptyState title="No active executions" />
      ) : (
        <div className="space-y-3">
          {executions.map((exec) => (
            <div key={exec.id} className="cyber-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`neon-dot ${STATUS_STYLE[exec.status] ?? 'neon-dot-blue'}`} />
                  <span className="text-sm font-bold">{exec.journeyId}</span>
                  <span
                    className={`text-[10px] font-semibold uppercase ${STATUS_TEXT[exec.status] ?? ''}`}
                  >
                    {exec.status}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {exec.status === 'active' && (
                    <button
                      className="cyber-btn-secondary cyber-btn-xs"
                      onClick={() => pauseMut.mutate({ executionId: exec.id })}
                      disabled={pauseMut.isPending}
                    >
                      Pause
                    </button>
                  )}
                  {exec.status === 'paused' && (
                    <button
                      className="cyber-btn-primary cyber-btn-xs"
                      onClick={() => resumeMut.mutate({ executionId: exec.id })}
                      disabled={resumeMut.isPending}
                    >
                      Resume
                    </button>
                  )}
                  {(exec.status === 'active' || exec.status === 'paused') && (
                    <button
                      className="cyber-btn-danger cyber-btn-xs"
                      onClick={() => failMut.mutate({ executionId: exec.id })}
                      disabled={failMut.isPending}
                    >
                      Fail
                    </button>
                  )}
                </div>
              </div>

              <div className="flex gap-4 text-[11px] text-slate-500 mb-2">
                <span>
                  Current: <span className="text-neon-blue font-mono">{exec.currentState}</span>
                </span>
                <span>Steps: {exec.history.length}</span>
                <span>Started: {new Date(exec.startedAt).toLocaleString()}</span>
              </div>

              {/* State History Timeline */}
              {exec.history.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border-dim">
                  <div className="text-[10px] text-slate-600 uppercase tracking-wide mb-1.5">
                    State History
                  </div>
                  <div className="space-y-1">
                    {exec.history.map((h, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-500 font-mono">{h.fromState}</span>
                        <span className="text-slate-600">→</span>
                        <span className="text-neon-blue font-mono">{h.toState}</span>
                        <span className="text-slate-600 ml-auto text-[10px]">{h.trigger}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
