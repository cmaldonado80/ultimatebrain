'use client'

/**
 * Dead Letter Queue — inspect failed jobs and system health diagnostics.
 */

import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

export default function DLQPage() {
  const diagnoseQuery = trpc.healing.diagnose.useQuery()
  const healthQuery = trpc.healing.healthCheck.useQuery()
  const clearLeasesMut = trpc.healing.clearExpiredLeases.useMutation()
  const utils = trpc.useUtils()

  const error = diagnoseQuery.error || healthQuery.error

  if (error) {
    return (
      <div className="p-6 text-slate-100">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  const isLoading = diagnoseQuery.isLoading || healthQuery.isLoading

  const handleClearLeases = async () => {
    await clearLeasesMut.mutateAsync()
    utils.healing.diagnose.invalidate()
  }

  if (isLoading) {
    return (
      <div className="p-6 text-slate-100 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">
          <div className="text-2xl mb-2">Loading...</div>
          <div className="text-xs">Fetching diagnostics</div>
        </div>
      </div>
    )
  }

  const diagnosis = diagnoseQuery.data as
    | { failedTickets?: unknown[]; expiredLeases?: unknown[]; issues?: string[] }
    | undefined
  const health = healthQuery.data as
    | { status: string; checks?: Record<string, { status: string; message?: string }> }
    | undefined

  return (
    <div className="p-6 text-slate-100">
      <div className="mb-5">
        <h2 className="m-0 text-[22px] font-bold font-orbitron">Dead Letter Queue</h2>
        <p className="mt-1 mb-0 text-xs text-slate-500">
          Inspect and retry failed jobs — ticket executions, cron runs, and webhook deliveries.
        </p>
      </div>
      {health && (
        <div className="cyber-card p-4 mb-4">
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-xs font-bold">System Health</span>
            <span
              className={`text-sm font-bold uppercase ${health.status === 'healthy' ? 'text-neon-green' : 'text-neon-red'}`}
            >
              {health.status}
            </span>
          </div>
          {health.checks &&
            Object.entries(health.checks).map(([name, check]) => (
              <div key={name} className="flex items-center gap-2 py-1 text-xs">
                <span
                  className={`neon-dot ${check.status === 'ok' ? 'neon-dot-green' : 'neon-dot-red'}`}
                />
                <span className="flex-1 font-mono">{name}</span>
                {check.message && (
                  <span className="text-[11px] text-slate-500">{check.message}</span>
                )}
              </div>
            ))}
        </div>
      )}

      {diagnosis?.issues && diagnosis.issues.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-bold text-neon-yellow mb-2">
            Issues ({diagnosis.issues.length})
          </div>
          {diagnosis.issues.map((issue, i) => (
            <div key={i} className="cyber-card px-3 py-2 rounded-md text-xs text-neon-yellow mb-1">
              {String(issue)}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-5">
        <button
          className="cyber-btn-danger"
          onClick={handleClearLeases}
          disabled={clearLeasesMut.isPending}
        >
          {clearLeasesMut.isPending ? 'Clearing...' : 'Clear Expired Leases'}
        </button>
      </div>

      {diagnosis &&
        !diagnosis.issues?.length &&
        !diagnosis.failedTickets?.length &&
        !diagnosis.expiredLeases?.length && (
          <div className="text-center text-slate-500 py-10 text-sm">
            No issues found. System is healthy.
          </div>
        )}
    </div>
  )
}
