'use client'

/**
 * Guardrail Dashboard — Safety & compliance overview with diagnostic categories.
 */

import { LoadingState } from '../../../components/ui/loading-state'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

export default function GuardrailsPage() {
  const diagQuery = trpc.evolution.guardrailDiagnostic.useQuery()

  if (diagQuery.isLoading) return <LoadingState message="Loading Guardrail Diagnostics..." />

  const diag = diagQuery.data as {
    totalViolations: number
    riskLevel: string
    byCategory: Record<
      string,
      { count: number; violations: Array<{ rule: string; detail: string; severity: string }> }
    >
    bySeverity: Record<string, number>
  } | null

  if (!diag) return <div className="p-6 text-slate-600">No guardrail data available.</div>

  const riskColor =
    diag.riskLevel === 'critical' || diag.riskLevel === 'high'
      ? 'red'
      : diag.riskLevel === 'medium'
        ? 'yellow'
        : 'green'

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Guardrail Dashboard"
        subtitle="Safety & compliance — diagnostic failure mode analysis"
      />

      {/* Summary Stats */}
      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Risk Level"
          value={diag.riskLevel}
          color={riskColor}
          sub="Overall assessment"
        />
        <StatCard
          label="Total Violations"
          value={diag.totalViolations}
          color={diag.totalViolations > 0 ? 'red' : 'green'}
          sub="All time"
        />
        <StatCard
          label="Critical"
          value={diag.bySeverity.critical ?? 0}
          color="red"
          sub="Immediate action"
        />
        <StatCard
          label="High"
          value={diag.bySeverity.high ?? 0}
          color="yellow"
          sub="Needs attention"
        />
      </PageGrid>

      {/* Three-Category Breakdown */}
      <PageGrid cols="3" className="mb-6">
        {(['structural', 'content', 'security'] as const).map((category) => {
          const cat = diag.byCategory[category]
          const desc =
            category === 'structural'
              ? 'Malformed outputs, dangling tool calls'
              : category === 'content'
                ? 'Hallucination, unverified claims, PII'
                : 'Injection attacks, command injection'

          return (
            <SectionCard
              key={category}
              title={`${category.charAt(0).toUpperCase() + category.slice(1)} (${cat?.count ?? 0})`}
            >
              <div className="text-[10px] text-slate-500 mb-2">{desc}</div>
              {(cat?.violations ?? []).length === 0 ? (
                <div className="text-[10px] text-neon-green">No violations</div>
              ) : (
                <div className="space-y-1">
                  {cat!.violations.slice(0, 10).map((v, i) => (
                    <div key={i} className="bg-bg-deep rounded px-2 py-1 text-[10px]">
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          label={v.severity}
                          color={
                            v.severity === 'critical'
                              ? 'red'
                              : v.severity === 'high'
                                ? 'red'
                                : 'yellow'
                          }
                        />
                        <span className="text-slate-400">{v.rule}</span>
                      </div>
                      <div className="text-[9px] text-slate-600 mt-0.5 truncate">{v.detail}</div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )
        })}
      </PageGrid>

      {/* Severity Breakdown */}
      <SectionCard title="Severity Distribution">
        <div className="flex gap-4 text-[11px]">
          {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
            <div key={sev} className="flex items-center gap-2">
              <StatusBadge
                label={sev}
                color={
                  sev === 'critical'
                    ? 'red'
                    : sev === 'high'
                      ? 'red'
                      : sev === 'medium'
                        ? 'yellow'
                        : 'slate'
                }
              />
              <span className="text-slate-300">{diag.bySeverity[sev] ?? 0}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
