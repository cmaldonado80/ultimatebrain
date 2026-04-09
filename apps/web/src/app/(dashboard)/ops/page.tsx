'use client'

/**
 * Ops Overview — top-level operations dashboard.
 */

import Link from 'next/link'

import { LoadingState } from '../../../components/ui/loading-state'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

const REFRESH = 30_000

export default function OpsOverviewPage() {
  const cortexQuery = trpc.healing.cortexStatus.useQuery(undefined, { refetchInterval: REFRESH })
  const diagQuery = trpc.healing.diagnose.useQuery(undefined, { refetchInterval: REFRESH })
  const providersQuery = trpc.gateway.listProviders.useQuery()

  if (cortexQuery.isLoading) return <LoadingState message="Loading Ops..." />

  const cortex = cortexQuery.data as {
    totalRecoveries: number
    totalHealingActions: number
    cycleCount: number
    systemHealth: string
  } | null

  const diag = diagQuery.data as {
    overallStatus: string
    checks: Array<{ name: string; status: string; message?: string }>
    recommendations: string[]
  } | null

  const providers = (providersQuery.data ?? []) as Array<{ provider: string; createdAt: Date }>

  const OPS_SECTIONS = [
    {
      label: 'Runtime Status',
      href: '/ops/status',
      icon: '●',
      desc: 'Provider & circuit breaker state',
    },
    { label: 'Incidents', href: '/ops/incidents', icon: '⚡', desc: 'Healing log failures' },
    { label: 'Traces', href: '/ops/traces', icon: '⋯', desc: 'Tool execution audit trail' },
    { label: 'Evals', href: '/ops/evals', icon: '✓', desc: 'Evaluation datasets & runs' },
    { label: 'Gateway', href: '/ops/gateway', icon: '⇄', desc: 'LLM routing & cost' },
    { label: 'Cron Jobs', href: '/ops/cron', icon: '⏱', desc: 'Scheduled background tasks' },
    { label: 'Healing', href: '/ops/healing', icon: '♥', desc: 'Self-healing system' },
    { label: 'Checkpoints', href: '/ops/checkpoints', icon: '⟲', desc: 'Execution snapshots' },
  ]

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Operations"
        subtitle="System health, monitoring, and infrastructure overview"
      />

      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="System Status"
          value={diag?.overallStatus === 'healthy' ? 'Healthy' : (diag?.overallStatus ?? 'Unknown')}
          color={diag?.overallStatus === 'healthy' ? 'green' : 'yellow'}
          sub={`${diag?.checks?.filter((c) => c.status !== 'pass').length ?? 0} issues`}
        />
        <StatCard
          label="Healing Cycles"
          value={cortex?.cycleCount ?? 0}
          color="blue"
          sub="healing loop iterations"
        />
        <StatCard
          label="Recoveries"
          value={cortex?.totalRecoveries ?? 0}
          color="green"
          sub={`of ${cortex?.totalHealingActions ?? 0} actions`}
        />
        <StatCard
          label="LLM Providers"
          value={providers.length}
          color={providers.length > 0 ? 'green' : 'red'}
          sub="API keys stored"
        />
      </PageGrid>

      <SectionCard title="Operations Modules">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {OPS_SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="cyber-card p-3.5 hover:border-neon-blue/40 transition-colors no-underline block"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{s.icon}</span>
                <span className="text-xs text-slate-200 font-medium">{s.label}</span>
              </div>
              <p className="text-[10px] text-slate-500">{s.desc}</p>
            </Link>
          ))}
        </div>
      </SectionCard>

      {diag?.checks && diag.checks.some((c) => c.status !== 'pass') && (
        <SectionCard title="Active Issues" className="mt-6">
          <div className="space-y-2">
            {diag.checks
              .filter((c) => c.status !== 'pass')
              .map((check, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-bg-deep rounded px-3 py-2 border border-border-dim"
                >
                  <StatusBadge
                    label={check.status}
                    color={check.status === 'fail' ? 'red' : 'yellow'}
                  />
                  <span className="text-xs text-slate-300">
                    {check.name}: {check.message ?? 'Issue detected'}
                  </span>
                </div>
              ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
