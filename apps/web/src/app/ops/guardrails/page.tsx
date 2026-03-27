'use client'

/**
 * Guardrails — view guardrail statistics and violation logs.
 */

import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

interface GuardrailLog {
  id: string
  layer: string
  agentId: string | null
  ticketId: string | null
  ruleName: string | null
  passed: boolean
  violationDetail: string | null
  createdAt: Date
}

export default function GuardrailsPage() {
  const logsQuery = trpc.guardrails.logs.useQuery()
  const statsQuery = trpc.guardrails.stats.useQuery()

  const error = logsQuery.error || statsQuery.error

  if (error) {
    return (
      <div className="p-6 text-gray-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  const isLoading = logsQuery.isLoading || statsQuery.isLoading

  if (isLoading) {
    return (
      <div className="p-6 text-gray-50 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-gray-500">
          <div className="text-2xl mb-2">Loading...</div>
          <div className="text-xs">Fetching guardrail data</div>
        </div>
      </div>
    )
  }

  const logs: GuardrailLog[] = (logsQuery.data as GuardrailLog[]) ?? []
  const stats = statsQuery.data as
    | {
        total: number
        passed: number
        failed: number
        byLayer: Record<string, { total: number; passed: number }>
      }
    | undefined

  return (
    <div className="p-6 text-gray-50">
      <div className="mb-5">
        <h2 className="m-0 text-[22px] font-bold font-orbitron">Guardrails</h2>
        <p className="mt-1 mb-0 text-xs text-gray-500">
          Safety rules, PII detection logs, and content policy enforcement across all agents.
        </p>
      </div>
      {stats && (
        <div className="cyber-grid grid-cols-3 gap-2.5 mb-5">
          <div className="cyber-card p-3.5 text-center">
            <div className="text-[22px] font-bold">{stats.total}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Total Checks</div>
          </div>
          <div className="cyber-card p-3.5 text-center">
            <div className="text-[22px] font-bold text-neon-green">{stats.passed}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Passed</div>
          </div>
          <div className="cyber-card p-3.5 text-center">
            <div className="text-[22px] font-bold text-neon-red">{stats.failed}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Violations</div>
          </div>
        </div>
      )}

      {logs.length === 0 ? (
        <div className="text-center text-gray-500 py-10 text-sm">No guardrail logs yet.</div>
      ) : (
        <div className="cyber-card overflow-hidden">
          <div className="flex px-4 py-2.5 bg-bg-deep border-b border-border">
            <span className="flex-1 text-[11px] font-bold text-gray-500 uppercase tracking-wide">
              Layer
            </span>
            <span className="flex-[2] text-[11px] font-bold text-gray-500 uppercase tracking-wide">
              Rule
            </span>
            <span className="flex-1 text-[11px] font-bold text-gray-500 uppercase tracking-wide">
              Result
            </span>
            <span className="flex-[2] text-[11px] font-bold text-gray-500 uppercase tracking-wide">
              Detail
            </span>
            <span className="flex-1 text-[11px] font-bold text-gray-500 uppercase tracking-wide">
              Agent
            </span>
          </div>
          {logs.map((l) => (
            <div key={l.id} className="flex px-4 py-2.5 border-b border-bg-surface items-center">
              <span className="flex-1 text-[13px]">
                <span className="cyber-badge text-[10px]">{l.layer}</span>
              </span>
              <span className="flex-[2] text-[11px] font-mono">{l.ruleName || '\u2014'}</span>
              <span className="flex-1 text-[13px]">
                <span className={`font-semibold ${l.passed ? 'text-neon-green' : 'text-neon-red'}`}>
                  {l.passed ? 'PASS' : 'FAIL'}
                </span>
              </span>
              <span className="flex-[2] text-[11px] text-gray-400">
                {l.violationDetail || '\u2014'}
              </span>
              <span className="flex-1 font-mono text-[10px] text-gray-500">
                {l.agentId?.slice(0, 8) || '\u2014'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
