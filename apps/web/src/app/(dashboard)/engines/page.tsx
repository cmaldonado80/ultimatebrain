'use client'

/**
 * Engines — brain entity hierarchy and engine status.
 */

import Link from 'next/link'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { OrgBadge } from '../../../components/ui/org-badge'
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
  mini_brain: 'text-neon-green',
  development: 'text-neon-yellow',
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
      <div className="p-6 text-slate-50 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">
          <div className="text-2xl mb-2 font-orbitron">Loading...</div>
          <div className="text-[13px]">Fetching engine data</div>
        </div>
      </div>
    )
  }

  const entities: BrainEntity[] = (listQuery.data as BrainEntity[]) ?? []
  const topo = topoQuery.data as
    | { brain: BrainEntity[]; miniBrains: BrainEntity[]; developments: BrainEntity[] }
    | undefined

  return (
    <div className="p-6 text-slate-50">
      <div className="mb-5">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="m-0 text-[22px] font-bold font-orbitron">Engines</h2>
            <OrgBadge />
          </div>
          <Link
            href="/engines/manage"
            className="cyber-btn-primary text-xs font-semibold no-underline"
          >
            Manage Brain
          </Link>
        </div>
        <p className="mt-1 mb-0 text-[13px] text-slate-500">
          Monitor the brain&apos;s core engines — LLM Gateway, Memory, Orchestration, Guardrails,
          and more.
        </p>
      </div>
      {topo && (
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <div className="cyber-card text-center p-3.5">
            <div className="text-[22px] font-bold font-orbitron text-neon-purple">
              {topo.brain.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Brain Entities</div>
          </div>
          <div className="cyber-card text-center p-3.5">
            <div className="text-[22px] font-bold font-orbitron text-neon-green">
              {topo.miniBrains.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Mini Brains</div>
          </div>
          <div className="cyber-card text-center p-3.5">
            <div className="text-[22px] font-bold font-orbitron text-neon-yellow">
              {topo.developments.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Development</div>
          </div>
        </div>
      )}

      {entities.length === 0 ? (
        <div className="text-center text-slate-500 py-10 text-sm">
          No brain entities registered.
        </div>
      ) : (
        <div className="cyber-grid">
          {entities.map((e) => (
            <div key={e.id} className="cyber-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[15px] font-bold">{e.name}</span>
                <span
                  className={`cyber-badge uppercase ${TIER_BADGE_CLASS[e.tier] || 'text-slate-500'}`}
                >
                  {e.tier}
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
