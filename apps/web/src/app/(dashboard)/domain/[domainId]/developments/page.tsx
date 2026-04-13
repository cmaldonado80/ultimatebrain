'use client'

/**
 * Developments — list and create Development apps under a Mini Brain.
 * Route: /domain/[domainId]/developments
 */

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'

import { DbErrorBanner } from '../../../../../components/db-error-banner'
import { ActionBar } from '../../../../../components/ui/action-bar'
import { EmptyState } from '../../../../../components/ui/empty-state'
import { LoadingState } from '../../../../../components/ui/loading-state'
import { PageHeader } from '../../../../../components/ui/page-header'
import { SectionCard } from '../../../../../components/ui/section-card'
import type { StatusColor } from '../../../../../components/ui/status-badge'
import { StatusBadge } from '../../../../../components/ui/status-badge'
import { trpc } from '../../../../../lib/trpc'

const STATUS_COLOR: Record<string, StatusColor> = {
  active: 'green',
  provisioning: 'blue',
  suspended: 'red',
  degraded: 'yellow',
  retired: 'slate',
}

export default function DevelopmentsPage() {
  const params = useParams()
  const domainId = params.domainId as string
  const [showForm, setShowForm] = useState(false)
  const [devName, setDevName] = useState('')

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

  const utils = trpc.useUtils()
  const createDev = trpc.factory.smartCreateDevelopment.useMutation({
    onSuccess: () => {
      utils.platform.entityHierarchy.invalidate()
      utils.entities.topology.invalidate()
      setShowForm(false)
      setDevName('')
    },
  })

  if (topologyQuery.error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={topologyQuery.error} />
      </div>
    )
  }

  if (topologyQuery.isLoading) {
    return <LoadingState message="Loading..." />
  }

  if (!entity) {
    return (
      <div className="p-6">
        <EmptyState icon="◆" title="Domain not found" />
      </div>
    )
  }

  const children = (hierarchyQuery.data?.children ?? []) as Array<{
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
        title="Development Apps"
        subtitle={`Under ${entity.name} Mini Brain`}
        actions={
          <button className="cyber-btn-primary cyber-btn-sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Create Development'}
          </button>
        }
      />

      {/* Create Form */}
      {showForm && (
        <SectionCard className="mb-6">
          <div className="flex gap-2">
            <input
              className="cyber-input flex-1"
              placeholder="Development app name (e.g. Personal, Business, Premium)"
              value={devName}
              onChange={(e) => setDevName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && devName.trim() && entity) {
                  createDev.mutate({ name: devName.trim(), miniBrainId: entity.id })
                }
              }}
            />
            <button
              className="cyber-btn-primary"
              onClick={() =>
                devName.trim() &&
                entity &&
                createDev.mutate({ name: devName.trim(), miniBrainId: entity.id })
              }
              disabled={!devName.trim() || createDev.isPending}
            >
              {createDev.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
          {createDev.error && (
            <div className="text-neon-red text-[11px] mt-2">{createDev.error.message}</div>
          )}
        </SectionCard>
      )}

      {/* Development List */}
      {developments.length === 0 ? (
        <EmptyState
          icon="📦"
          title="No development apps yet"
          message={`Create a development app to build on the ${entity.name} Mini Brain.`}
          action={{ label: '+ Create Development', onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="space-y-2">
          {developments.map((dev) => (
            <SectionCard key={dev.id} padding="sm">
              <div className="flex items-center gap-3">
                <StatusBadge label={dev.status} color={STATUS_COLOR[dev.status] ?? 'slate'} dot />
                <div className="flex-1">
                  <Link
                    href={`/domain/${domainId}/${dev.id}`}
                    className="text-sm text-slate-200 font-medium no-underline hover:text-neon-teal transition-colors"
                  >
                    {dev.name}
                  </Link>
                  <div className="text-[10px] text-slate-500">
                    Development · {dev.id.slice(0, 8)}
                  </div>
                </div>
                <ActionBar>
                  <Link
                    href={`/domain/${domainId}/${dev.id}`}
                    className="cyber-btn-secondary cyber-btn-sm no-underline"
                  >
                    View
                  </Link>
                  <Link
                    href={`/engines/manage/${dev.id}`}
                    className="cyber-btn-secondary cyber-btn-sm no-underline"
                  >
                    Manage
                  </Link>
                </ActionBar>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  )
}
