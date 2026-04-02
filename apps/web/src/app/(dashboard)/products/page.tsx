'use client'

/**
 * Products Dashboard — All development apps built by the corporation.
 *
 * Shows every Development-tier entity across all departments with:
 * - Status, parent department, domain
 * - Links to domain dashboard for each product
 * - Links to parent department
 */

import Link from 'next/link'

import { LoadingState } from '../../../components/ui/loading-state'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

export default function ProductsPage() {
  const topologyQuery = trpc.entities.topology.useQuery()

  if (topologyQuery.isLoading) return <LoadingState message="Loading Products..." />

  const miniBrains = (topologyQuery.data?.miniBrains ?? []) as Array<{
    id: string
    name: string
    domain: string | null
    status: string
  }>
  const developments = (topologyQuery.data?.developments ?? []) as Array<{
    id: string
    name: string
    domain: string | null
    status: string
    parentId: string | null
  }>

  const mbMap = new Map(miniBrains.map((mb) => [mb.id, mb]))

  const active = developments.filter((d) => d.status === 'active').length
  const provisioning = developments.filter((d) => d.status === 'provisioning').length

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Products"
        subtitle="All development apps built and maintained by the corporation"
      />

      {/* Stats */}
      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Total Products"
          value={developments.length}
          color="blue"
          sub="Development apps"
        />
        <StatCard label="Active" value={active} color="green" sub="Running" />
        <StatCard label="Provisioning" value={provisioning} color="yellow" sub="Setting up" />
        <StatCard
          label="Departments"
          value={miniBrains.length}
          color="purple"
          sub="Building products"
        />
      </PageGrid>

      {/* Products by Department */}
      {miniBrains.map((mb) => {
        const deptProducts = developments.filter((d) => d.parentId === mb.id)
        if (deptProducts.length === 0) return null

        return (
          <SectionCard
            key={mb.id}
            title={`${mb.name} (${deptProducts.length} products)`}
            className="mb-4"
          >
            <div className="space-y-2">
              {deptProducts.map((prod) => (
                <Link
                  key={prod.id}
                  href={`/domain/${prod.id}`}
                  className="flex items-center gap-3 bg-bg-deep rounded px-4 py-3 hover:bg-bg-elevated transition-colors no-underline"
                >
                  <div className="w-8 h-8 rounded bg-neon-teal/20 flex items-center justify-center text-neon-teal text-sm font-bold">
                    {prod.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-slate-200 font-medium">{prod.name}</div>
                    <div className="text-[10px] text-slate-500">
                      {prod.domain ?? 'general'} &middot; {prod.id.slice(0, 8)}
                    </div>
                  </div>
                  <StatusBadge
                    label={prod.status}
                    color={
                      prod.status === 'active'
                        ? 'green'
                        : prod.status === 'provisioning'
                          ? 'yellow'
                          : prod.status === 'degraded'
                            ? 'red'
                            : 'slate'
                    }
                  />
                  <span className="text-[10px] text-slate-600">→</span>
                </Link>
              ))}
            </div>
          </SectionCard>
        )
      })}

      {/* Orphan products (no parent department) */}
      {(() => {
        const orphans = developments.filter((d) => !d.parentId || !mbMap.has(d.parentId))
        if (orphans.length === 0) return null
        return (
          <SectionCard title={`Unassigned Products (${orphans.length})`} className="mb-4">
            <div className="space-y-2">
              {orphans.map((prod) => (
                <Link
                  key={prod.id}
                  href={`/domain/${prod.id}`}
                  className="flex items-center gap-3 bg-bg-deep rounded px-4 py-3 hover:bg-bg-elevated transition-colors no-underline"
                >
                  <div className="flex-1">
                    <div className="text-sm text-slate-200">{prod.name}</div>
                    <div className="text-[10px] text-slate-500">{prod.id.slice(0, 8)}</div>
                  </div>
                  <StatusBadge
                    label={prod.status}
                    color={prod.status === 'active' ? 'green' : 'yellow'}
                  />
                </Link>
              ))}
            </div>
          </SectionCard>
        )
      })()}

      {developments.length === 0 && (
        <SectionCard title="No Products Yet">
          <div className="text-xs text-slate-600 py-6 text-center">
            The corporation hasn&apos;t built any products yet. Use the CEO to create projects and
            assign work to departments.
          </div>
        </SectionCard>
      )}
    </div>
  )
}
