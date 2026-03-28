'use client'

/**
 * Health Panel — system health overlay for the Swarm Observatory.
 */

interface RuntimeOverlay {
  statusCounts: { idle: number; executing: number; error: number; offline: number }
  pendingApprovals: number
  cronSummary: { active: number; failed: number; total: number }
  healthScore: string
  timestamp: Date
}

export function HealthPanel({
  data,
  onClose,
}: {
  data: RuntimeOverlay | null
  onClose: () => void
}) {
  if (!data) return null

  const scoreColor =
    data.healthScore === 'healthy'
      ? 'text-neon-green'
      : data.healthScore === 'degraded'
        ? 'text-neon-yellow'
        : 'text-neon-red'

  const dotColor =
    data.healthScore === 'healthy'
      ? 'neon-dot-green'
      : data.healthScore === 'degraded'
        ? 'neon-dot-yellow'
        : 'neon-dot-red'

  return (
    <div className="absolute top-14 right-4 z-20 w-72 cyber-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`neon-dot ${dotColor}`} />
          <span className={`text-xs font-orbitron ${scoreColor}`}>
            {data.healthScore.toUpperCase()}
          </span>
        </div>
        <button onClick={onClose} className="text-slate-600 hover:text-slate-400 text-xs">
          &#x2715;
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-bg-elevated rounded p-2 text-center">
          <div className="text-lg font-bold text-neon-green">{data.statusCounts.executing}</div>
          <div className="text-slate-500">Executing</div>
        </div>
        <div className="bg-bg-elevated rounded p-2 text-center">
          <div className="text-lg font-bold text-slate-400">{data.statusCounts.idle}</div>
          <div className="text-slate-500">Idle</div>
        </div>
        <div className="bg-bg-elevated rounded p-2 text-center">
          <div
            className={`text-lg font-bold ${data.statusCounts.error > 0 ? 'text-neon-red' : 'text-slate-600'}`}
          >
            {data.statusCounts.error}
          </div>
          <div className="text-slate-500">Errors</div>
        </div>
        <div className="bg-bg-elevated rounded p-2 text-center">
          <div className="text-lg font-bold text-slate-600">{data.statusCounts.offline}</div>
          <div className="text-slate-500">Offline</div>
        </div>
      </div>

      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between text-slate-400">
          <span>Pending Approvals</span>
          <span className={data.pendingApprovals > 0 ? 'text-neon-yellow' : 'text-slate-600'}>
            {data.pendingApprovals}
          </span>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>Cron Jobs</span>
          <span>
            {data.cronSummary.active} active
            {data.cronSummary.failed > 0 && (
              <span className="text-neon-red ml-1">{data.cronSummary.failed} failed</span>
            )}
          </span>
        </div>
      </div>

      <div className="text-[9px] text-slate-600">
        Updated {new Date(data.timestamp).toLocaleTimeString()}
      </div>
    </div>
  )
}
