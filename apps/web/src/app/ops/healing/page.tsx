'use client'

/**
 * Healing Dashboard — system health diagnostics, auto-heal controls, and healing action log.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../utils/trpc'

export default function HealingPage() {
  const [autoHealResult, setAutoHealResult] = useState<string | null>(null)

  const diagnoseQuery = trpc.healing.diagnose.useQuery()
  const logQuery = trpc.healing.healingLog.useQuery()
  const utils = trpc.useUtils()

  const autoHealMut = trpc.healing.autoHeal.useMutation({
    onSuccess: (data) => {
      utils.healing.diagnose.invalidate()
      utils.healing.healingLog.invalidate()
      const actions = data as { actionsTaken?: string[] }
      setAutoHealResult(
        actions?.actionsTaken?.length
          ? `Healed: ${actions.actionsTaken.join(', ')}`
          : 'No issues found — system healthy',
      )
      setTimeout(() => setAutoHealResult(null), 6000)
    },
    onError: (err) => {
      setAutoHealResult(`Auto-heal failed: ${err.message}`)
      setTimeout(() => setAutoHealResult(null), 6000)
    },
  })

  const restartMut = trpc.healing.restartAgent.useMutation({
    onSuccess: () => {
      utils.healing.diagnose.invalidate()
    },
    onError: (err) => {
      setAutoHealResult(`Restart failed: ${err.message}`)
      setTimeout(() => setAutoHealResult(null), 6000)
    },
  })

  const clearLeasesMut = trpc.healing.clearExpiredLeases.useMutation({
    onSuccess: () => utils.healing.diagnose.invalidate(),
    onError: (err) => {
      setAutoHealResult(`Clear leases failed: ${err.message}`)
      setTimeout(() => setAutoHealResult(null), 6000)
    },
  })

  const error = diagnoseQuery.error || logQuery.error

  if (error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (diagnoseQuery.isLoading) {
    return <LoadingState message="Running diagnostics..." />
  }

  const diagnosis = diagnoseQuery.data as {
    status?: string
    issues?: Array<{ type: string; message: string; severity?: string; agentId?: string }>
    agents?: { total: number; error: number; idle: number }
    tickets?: { stuck: number; failed: number }
  } | null

  const healingLog = (logQuery.data ?? []) as Array<{
    action: string
    target?: string
    detail?: string
    timestamp?: Date
  }>

  const statusColor =
    diagnosis?.status === 'healthy'
      ? 'neon-green'
      : diagnosis?.status === 'degraded'
        ? 'neon-yellow'
        : 'neon-red'

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Healing"
        actions={
          <div className="flex gap-2">
            <button
              className="cyber-btn-primary"
              onClick={() => autoHealMut.mutate()}
              disabled={autoHealMut.isPending}
            >
              {autoHealMut.isPending ? 'Healing...' : 'Auto-Heal'}
            </button>
            <button
              className="cyber-btn-secondary"
              onClick={() => clearLeasesMut.mutate()}
              disabled={clearLeasesMut.isPending}
            >
              Clear Expired Leases
            </button>
          </div>
        }
      />

      {autoHealResult && (
        <div className="bg-neon-green/10 border border-neon-green/20 rounded-lg p-3 mb-4 text-neon-green text-xs">
          {autoHealResult}
        </div>
      )}

      {/* Health Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <div className="cyber-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className={`neon-dot neon-dot-${statusColor} neon-dot-pulse`} />
            <span className={`text-lg font-bold font-orbitron text-${statusColor} uppercase`}>
              {diagnosis?.status ?? 'Unknown'}
            </span>
          </div>
          <div className="text-[10px] text-slate-500">System Status</div>
        </div>
        <div className="cyber-card p-4">
          <div className="text-lg font-bold text-neon-blue">{diagnosis?.agents?.total ?? 0}</div>
          <div className="text-[10px] text-slate-500">
            Total Agents ({diagnosis?.agents?.error ?? 0} errors)
          </div>
        </div>
        <div className="cyber-card p-4">
          <div className="text-lg font-bold text-neon-yellow">{diagnosis?.tickets?.stuck ?? 0}</div>
          <div className="text-[10px] text-slate-500">Stuck Tickets</div>
        </div>
        <div className="cyber-card p-4">
          <div className="text-lg font-bold text-neon-red">{diagnosis?.issues?.length ?? 0}</div>
          <div className="text-[10px] text-slate-500">Active Issues</div>
        </div>
      </div>

      {/* Issues List */}
      {diagnosis?.issues && diagnosis.issues.length > 0 && (
        <div className="cyber-card p-4 mb-6">
          <h3 className="text-sm font-orbitron text-white mb-3">Active Issues</h3>
          <div className="space-y-2">
            {diagnosis.issues.map((issue, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-border-dim last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`cyber-badge text-[9px] uppercase ${
                      issue.severity === 'critical'
                        ? 'text-neon-red border-neon-red/20'
                        : issue.severity === 'high'
                          ? 'text-neon-yellow border-neon-yellow/20'
                          : 'text-slate-400 border-slate-400/20'
                    }`}
                  >
                    {issue.severity ?? issue.type}
                  </span>
                  <span className="text-xs text-slate-300">{issue.message}</span>
                </div>
                {issue.agentId && (
                  <button
                    className="cyber-btn-danger cyber-btn-xs"
                    onClick={() =>
                      restartMut.mutate({
                        agentId: issue.agentId!,
                        reason: 'Manual restart from healing dashboard',
                      })
                    }
                    disabled={restartMut.isPending}
                  >
                    Restart
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Healing Log */}
      <div className="cyber-card p-4">
        <h3 className="text-sm font-orbitron text-white mb-3">Healing Log</h3>
        {healingLog.length === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">No healing actions recorded</div>
        ) : (
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {healingLog.map((entry, i) => (
              <div
                key={i}
                className="flex items-center gap-3 py-1.5 border-b border-border-dim last:border-0 text-xs"
              >
                {entry.timestamp && (
                  <span className="text-[10px] text-slate-600 font-mono w-[130px] flex-shrink-0">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                )}
                <span className="text-neon-blue font-medium">{entry.action}</span>
                {entry.target && <span className="text-slate-500 font-mono">{entry.target}</span>}
                {entry.detail && <span className="text-slate-400 truncate">{entry.detail}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
