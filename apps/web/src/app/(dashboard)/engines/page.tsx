'use client'

/**
 * Engines — system entity hierarchy and engine status.
 */

import Link from 'next/link'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { EmptyState } from '../../../components/ui/empty-state'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../utils/trpc'

interface BrainEntity {
  id: string
  name: string
  domain: string | null
  tier: string
  parentId: string | null
  enginesEnabled: string[] | null
  status: string
  config: unknown
  lastHealthCheck: Date | null
  createdAt: Date
}

const TIER_BADGE_CLASS: Record<string, string> = {
  brain: 'text-neon-purple',
  mini_brain: 'text-neon-green', // DB enum value — displayed as "Department"
  development: 'text-neon-yellow',
}

const TIER_DISPLAY: Record<string, string> = {
  brain: 'corporation',
  mini_brain: 'department',
  development: 'development',
}

const STATUS_DOT_CLASS: Record<string, string> = {
  active: 'neon-dot neon-dot-green',
  provisioning: 'neon-dot neon-dot-yellow',
  suspended: 'neon-dot neon-dot-red',
  degraded: 'neon-dot neon-dot-yellow',
}

const STATUS_TEXT_CLASS: Record<string, string> = {
  active: 'text-neon-green',
  provisioning: 'text-neon-yellow',
  suspended: 'text-neon-red',
  degraded: 'text-neon-yellow',
}

export default function EnginesPage() {
  const listQuery = trpc.entities.list.useQuery({ limit: 100, offset: 0 })
  const topoQuery = trpc.entities.topology.useQuery()

  const error = listQuery.error || topoQuery.error

  if (error) {
    return (
      <div className="p-6 text-slate-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  const isLoading = listQuery.isLoading || topoQuery.isLoading

  if (isLoading) {
    return (
      <div className="p-6 text-slate-50">
        <LoadingState message="Loading engines..." />
      </div>
    )
  }

  const entities: BrainEntity[] = (listQuery.data as BrainEntity[]) ?? []
  const topo = topoQuery.data as
    | { brain: BrainEntity[]; miniBrains: BrainEntity[]; developments: BrainEntity[] }
    | undefined

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Engines"
        subtitle="Monitor the system's core engines — LLM Gateway, Memory, Orchestration, Guardrails, and more."
        actions={
          <Link
            href="/engines/manage"
            className="cyber-btn-primary text-xs font-semibold no-underline"
          >
            Manage Entities
          </Link>
        }
      />
      {topo && (
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <div className="cyber-card text-center p-3.5">
            <div className="text-[22px] font-bold font-orbitron text-neon-purple">
              {topo.brain.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Corporation</div>
          </div>
          <div className="cyber-card text-center p-3.5">
            <div className="text-[22px] font-bold font-orbitron text-neon-green">
              {topo.miniBrains.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Departments</div>
          </div>
          <div className="cyber-card text-center p-3.5">
            <div className="text-[22px] font-bold font-orbitron text-neon-yellow">
              {topo.developments.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Products</div>
          </div>
        </div>
      )}

      {entities.length === 0 ? (
        <EmptyState title="No entities registered" />
      ) : (
        <div className="cyber-grid">
          {entities.map((e) => (
            <div key={e.id} className="cyber-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[15px] font-bold">{e.name}</span>
                <span
                  className={`cyber-badge uppercase ${TIER_BADGE_CLASS[e.tier] || 'text-slate-500'}`}
                >
                  {TIER_DISPLAY[e.tier] ?? e.tier}
                </span>
              </div>
              <div className="flex gap-4 text-[11px] text-slate-500 mb-1.5">
                <span
                  className={`flex items-center gap-1.5 ${STATUS_TEXT_CLASS[e.status] || 'text-slate-500'}`}
                >
                  <span className={STATUS_DOT_CLASS[e.status] || 'neon-dot'} />
                  {e.status}
                </span>
                {e.domain && <span className="font-mono">{e.domain}</span>}
              </div>
              {e.enginesEnabled && e.enginesEnabled.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {e.enginesEnabled.map((eng) => (
                    <span
                      key={eng}
                      className="cyber-badge text-neon-purple bg-bg-elevated font-mono"
                    >
                      {eng}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
