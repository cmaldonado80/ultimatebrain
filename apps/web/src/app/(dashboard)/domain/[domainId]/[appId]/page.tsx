'use client'

/**
 * Development App Detail — dashboard for a Development entity under a Mini Brain.
 * Route: /domain/[domainId]/[appId]
 */

import Link from 'next/link'
import { useParams } from 'next/navigation'

import { DbErrorBanner } from '../../../../../components/db-error-banner'
import { EmptyState } from '../../../../../components/ui/empty-state'
import { LoadingState } from '../../../../../components/ui/loading-state'
import { PageGrid } from '../../../../../components/ui/page-grid'
import { PageHeader } from '../../../../../components/ui/page-header'
import { SectionCard } from '../../../../../components/ui/section-card'
import { StatCard } from '../../../../../components/ui/stat-card'
import type { StatusColor } from '../../../../../components/ui/status-badge'
import { StatusBadge } from '../../../../../components/ui/status-badge'
import { trpc } from '../../../../../utils/trpc'

const STATUS_COLOR: Record<string, StatusColor> = {
  active: 'green',
  provisioning: 'blue',
  suspended: 'red',
  degraded: 'yellow',
  retired: 'slate',
}

export default function DevelopmentAppPage() {
  const params = useParams()
  const domainId = params.domainId as string
  const appId = params.appId as string

  const entityQuery = trpc.entities.byId.useQuery({ id: appId })
  const hierarchyQuery = trpc.platform.entityHierarchy.useQuery({ id: appId }, { enabled: !!appId })

  if (entityQuery.error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={entityQuery.error} />
      </div>
    )
  }

  if (entityQuery.isLoading) {
    return <LoadingState message="Loading development app..." />
  }

  const entity = entityQuery.data
  if (!entity) {
    return (
      <div className="p-6">
        <EmptyState icon="📦" title="Development app not found" />
      </div>
    )
  }

  const hierarchy = hierarchyQuery.data
  const parent = hierarchy?.parent as { id: string; name: string; domain: string | null } | null

  return (
    <div className="p-6 text-slate-50 max-w-[900px]">
      {/* Back link */}
      <Link
        href={`/domain/${domainId}`}
        className="text-[11px] text-neon-purple no-underline mb-3 inline-block"
      >
        ← Back to {parent?.name ?? 'Mini Brain'}
      </Link>

      <PageHeader
        title={entity.name}
        subtitle={`Development app · ${parent?.domain ?? entity.domain ?? 'custom'} domain`}
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
        <StatCard label="Tier" value="Development" color="blue" />
        <StatCard label="Parent" value={parent?.name ?? 'Unknown'} />
        <StatCard label="Domain" value={entity.domain ?? 'custom'} />
      </PageGrid>

      {/* Entity Details */}
      <SectionCard title="Configuration" className="mb-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
          <div className="text-slate-500">Entity ID</div>
          <div className="text-slate-300 font-mono text-[10px]">{entity.id}</div>
          <div className="text-slate-500">Parent Mini Brain</div>
          <div>
            {parent ? (
              <Link
                href={`/domain/${domainId}`}
                className="text-neon-teal no-underline hover:text-neon-teal/80"
              >
                {parent.name}
              </Link>
            ) : (
              <span className="text-slate-600">None</span>
            )}
          </div>
          {entity.endpoint && (
            <>
              <div className="text-slate-500">Endpoint</div>
              <div className="text-slate-300 font-mono text-[10px]">{entity.endpoint}</div>
            </>
          )}
          {entity.environment && (
            <>
              <div className="text-slate-500">Environment</div>
              <div className="text-slate-300">{entity.environment}</div>
            </>
          )}
          {entity.version && (
            <>
              <div className="text-slate-500">Version</div>
              <div className="text-slate-300 font-mono">{entity.version}</div>
            </>
          )}
          <div className="text-slate-500">Created</div>
          <div className="text-slate-300">{new Date(entity.createdAt).toLocaleString()}</div>
        </div>
      </SectionCard>

      {/* Quick Actions */}
      <SectionCard title="Actions">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/engines/manage/${entity.id}`}
            className="cyber-btn-secondary cyber-btn-sm no-underline"
          >
            Entity Manager
          </Link>
          <Link
            href={`/domain/${domainId}`}
            className="cyber-btn-secondary cyber-btn-sm no-underline"
          >
            Parent Mini Brain
          </Link>
          <Link href="/ops/deployments" className="cyber-btn-secondary cyber-btn-sm no-underline">
            Deployments
          </Link>
        </div>
      </SectionCard>
    </div>
  )
}
