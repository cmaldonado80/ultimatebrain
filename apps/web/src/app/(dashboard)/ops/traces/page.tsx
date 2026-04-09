'use client'

/**
 * Traces — tool execution audit trail from the sandbox.
 */

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 30_000

export default function TracesPage() {
  const auditQuery = trpc.sandbox.auditSummary.useQuery(undefined, { refetchInterval: REFRESH })
  const entriesQuery = trpc.sandbox.auditEntries.useQuery(
    { limit: 50 },
    { refetchInterval: REFRESH },
  )

  if (auditQuery.isLoading) return <LoadingState message="Loading Traces..." />

  const summary = auditQuery.data as
    | {
        totalEntries: number
        successRate: number
        policyBlocks: number
        timeouts: number
        crashes: number
        avgDurationMs: number
        topBlockedTools: Array<{ tool: string; count: number }>
      }
    | undefined

  const entries = (entriesQuery.data ?? []) as Array<{
    sandboxId: string
    toolName: string
    agentId: string
    agentName: string
    success: boolean
    policyVerdict: string
    timestamp: number
    durationMs: number
  }>

  return (
    <div className="p-6 text-slate-50">
      <PageHeader title="Traces" subtitle="Tool execution audit trail and sandbox verdicts" />

      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Total Calls"
          value={summary?.totalEntries ?? 0}
          color="blue"
          sub="audit entries"
        />
        <StatCard
          label="Success Rate"
          value={`${Math.round((summary?.successRate ?? 0) * 100)}%`}
          color={(summary?.successRate ?? 0) > 0.9 ? 'green' : 'yellow'}
          sub="tool executions"
        />
        <StatCard
          label="Policy Blocks"
          value={summary?.policyBlocks ?? 0}
          color="red"
          sub="blocked by policy"
        />
        <StatCard
          label="Avg Duration"
          value={`${Math.round(summary?.avgDurationMs ?? 0)}ms`}
          color="purple"
          sub="per tool call"
        />
      </PageGrid>

      {summary?.topBlockedTools && summary.topBlockedTools.length > 0 && (
        <SectionCard title="Most Blocked Tools" className="mb-6">
          <div className="space-y-1.5">
            {summary.topBlockedTools.map((t) => (
              <div
                key={t.tool}
                className="flex items-center justify-between bg-bg-deep rounded px-3 py-2 border border-border-dim"
              >
                <span className="text-xs text-slate-200 font-mono">{t.tool}</span>
                <span className="text-xs text-neon-red font-mono">{t.count} blocks</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Recent Audit Entries">
        {entries.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            No audit entries recorded yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {entries.map((entry, i) => (
              <div
                key={`${entry.sandboxId}-${entry.timestamp}-${i}`}
                className="flex items-center gap-3 bg-bg-deep rounded px-3 py-2 border border-border-dim"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${entry.success ? 'bg-neon-green' : 'bg-neon-red'}`}
                />
                <span className="text-[11px] text-slate-300 font-mono">{entry.toolName}</span>
                <span className="text-[10px] text-slate-500 truncate">{entry.agentName}</span>
                <span className="text-[10px] text-slate-600 flex-1 truncate">
                  {entry.policyVerdict}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">{entry.durationMs}ms</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
