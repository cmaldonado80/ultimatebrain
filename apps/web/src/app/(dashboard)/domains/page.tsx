'use client'

/**
 * Domains — Browse all domain projects (projects with a domain field set).
 *
 * Each domain card shows icon, name, goal, status, and a "Create Ticket" shortcut.
 */

import { useRouter } from 'next/navigation'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { EmptyState } from '../../../components/ui/empty-state'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import type { StatusColor } from '../../../components/ui/status-badge'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

interface DomainProject {
  id: string
  name: string
  goal: string | null
  domain: string | null
  icon: string | null
  status: string
  healthScore: number | null
  createdAt: Date
  updatedAt: Date
}

const STATUS_BADGE_COLOR: Record<string, StatusColor> = {
  planning: 'blue',
  active: 'green',
  completed: 'green',
  cancelled: 'slate',
}

export default function DomainsPage() {
  const router = useRouter()
  const { data, isLoading, error } = trpc.projects.listDomains.useQuery({ limit: 100, offset: 0 })

  if (error) {
    return (
      <div className="p-6 text-slate-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 text-slate-50">
        <LoadingState message="Loading domains..." />
      </div>
    )
  }

  const domains: DomainProject[] = (data as DomainProject[]) ?? []

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Domains"
        subtitle="Browse corporation domains. Each domain scopes work, tickets, and artifacts for a business area."
        count={domains.length}
        actions={
          <button className="cyber-btn-primary text-xs" onClick={() => router.push('/onboarding')}>
            + New Domain
          </button>
        }
      />

      {domains.length === 0 ? (
        <EmptyState
          title="No domains yet"
          message="Create your first domain during onboarding or by clicking '+ New Domain' above."
        />
      ) : (
        <PageGrid cols="3">
          {domains.map((d) => (
            <div key={d.id} className="cyber-card flex flex-col gap-3">
              {/* Header: Icon + Name + Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{d.icon ?? '📁'}</span>
                  <span className="text-[15px] font-bold">{d.name}</span>
                </div>
                <StatusBadge label={d.status} color={STATUS_BADGE_COLOR[d.status] ?? 'slate'} />
              </div>

              {/* Goal */}
              {d.goal && <div className="text-xs text-slate-400 leading-relaxed">{d.goal}</div>}

              {/* Domain tag */}
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <span className="bg-bg-deep px-2 py-0.5 rounded">{d.domain}</span>
                {d.healthScore != null && <span>Health: {d.healthScore.toFixed(0)}</span>}
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-auto pt-2 border-t border-border-dim">
                <button
                  className="cyber-btn-secondary text-[10px] flex-1"
                  onClick={() => router.push(`/projects`)}
                >
                  View Project
                </button>
                <button
                  className="cyber-btn-primary text-[10px] flex-1"
                  onClick={() => router.push(`/tickets?projectId=${d.id}`)}
                >
                  Create Ticket
                </button>
              </div>
            </div>
          ))}
        </PageGrid>
      )}
    </div>
  )
}
