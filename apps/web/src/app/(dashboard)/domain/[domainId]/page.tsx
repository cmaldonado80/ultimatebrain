'use client'

/**
 * Mini Brain Dashboard — overview of a domain Mini Brain entity.
 * Shows status, agents, development apps, and quick actions.
 *
 * Route: /domain/[domainId] where domainId is the entity UUID or domain slug
 */

import Link from 'next/link'
import { useParams } from 'next/navigation'

import { DbErrorBanner } from '../../../../components/db-error-banner'
import { EmptyState } from '../../../../components/ui/empty-state'
import { LoadingState } from '../../../../components/ui/loading-state'
import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import type { StatusColor } from '../../../../components/ui/status-badge'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const STATUS_COLOR: Record<string, StatusColor> = {
  active: 'green',
  provisioning: 'blue',
  suspended: 'red',
  degraded: 'yellow',
  retired: 'slate',
}

export default function MiniBrainDashboard() {
  const params = useParams()
  const domainId = params.domainId as string

  // Try to find by domain slug first, then by UUID
  const topologyQuery = trpc.entities.topology.useQuery()
  const allEntities = [
    ...(topologyQuery.data?.miniBrains ?? []),
    ...(topologyQuery.data?.brain ?? []),
  ]
  const entity = allEntities.find(
    (e) => e.id === domainId || e.domain === domainId || e.name.toLowerCase() === domainId,
  )

  const hierarchyQuery = trpc.platform.entityHierarchy.useQuery(
    { id: entity?.id ?? '' },
    { enabled: !!entity?.id },
  )
  if (topologyQuery.error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={topologyQuery.error} />
      </div>
    )
  }

  if (topologyQuery.isLoading) {
    return <LoadingState message="Loading domain..." />
  }

  if (!entity) {
    return (
      <div className="p-6">
        <EmptyState
          icon="◆"
          title="Domain not found"
          message={`No Mini Brain found for "${domainId}". Create one from the Brain Manager.`}
          action={{ label: 'Brain Manager', href: '/engines/manage' }}
        />
      </div>
    )
  }

  const hierarchy = hierarchyQuery.data
  const children = (hierarchy?.children ?? []) as Array<{
    id: string
    name: string
    tier: string
    status: string
    domain: string | null
  }>
  const developments = children.filter((c) => c.tier === 'development')

  return (
    <div className="p-6 text-slate-50 max-w-[900px]">
      <PageHeader
        title={entity.name}
        subtitle={`${entity.domain ?? 'custom'} domain · Mini Brain`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge label={entity.status} color={STATUS_COLOR[entity.status] ?? 'slate'} dot />
            <Link
              href={`/engines/manage/${entity.id}`}
              className="cyber-btn-secondary cyber-btn-sm no-underline"
            >
              Manage
            </Link>
          </div>
        }
      />

      {/* Stats */}
      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Status"
          value={entity.status}
          color={
            entity.status === 'active' ? 'green' : entity.status === 'suspended' ? 'red' : 'blue'
          }
        />
        <StatCard label="Tier" value="Mini Brain" color="purple" />
        <StatCard label="Developments" value={developments.length} color="blue" />
        <StatCard label="Domain" value={entity.domain ?? 'custom'} />
      </PageGrid>

      {/* Development Apps */}
      <SectionCard title={`Development Apps (${developments.length})`} className="mb-6">
        {developments.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-slate-500 text-sm mb-3">
              No development apps yet. Create one to build on this Mini Brain.
            </div>
            <Link
              href={`/domain/${domainId}/developments`}
              className="cyber-btn-primary cyber-btn-sm no-underline"
            >
              + Create Development App
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {developments.map((dev) => (
              <Link
                key={dev.id}
                href={`/domain/${domainId}/${dev.id}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-bg-elevated hover:bg-bg-elevated/80 transition-colors no-underline"
              >
                <StatusBadge label={dev.status} color={STATUS_COLOR[dev.status] ?? 'slate'} dot />
                <div className="flex-1">
                  <div className="text-sm text-slate-200 font-medium">{dev.name}</div>
                  <div className="text-[10px] text-slate-500">
                    Development · {dev.domain ?? entity.domain}
                  </div>
                </div>
                <span className="text-[10px] text-slate-600">→</span>
              </Link>
            ))}
            <div className="pt-2">
              <Link
                href={`/domain/${domainId}/developments`}
                className="text-[11px] text-neon-teal hover:text-neon-teal/80 no-underline"
              >
                + Create another development app
              </Link>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Quick Links */}
      <SectionCard title="Quick Links" className="mb-6">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/domain/${domainId}/agents`}
            className="cyber-btn-secondary cyber-btn-sm no-underline"
          >
            Agents
          </Link>
          <Link
            href={`/domain/${domainId}/developments`}
            className="cyber-btn-secondary cyber-btn-sm no-underline"
          >
            Developments
          </Link>
          <Link
            href={`/engines/manage/${entity.id}`}
            className="cyber-btn-secondary cyber-btn-sm no-underline"
          >
            Entity Manager
          </Link>
          {entity.domain === 'astrology' && (
            <Link href="/astrology" className="cyber-btn-primary cyber-btn-sm no-underline">
              Astrology App
            </Link>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
