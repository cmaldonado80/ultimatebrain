'use client'

/**
 * Databases — brain entity database provisioning status and controls.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { EmptyState } from '../../../components/ui/empty-state'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../utils/trpc'

export default function DatabasesPage() {
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const entitiesQuery = trpc.platform.entitiesByTier.useQuery({})
  const utils = trpc.useUtils()

  const dbStatusQuery = trpc.factory.databaseStatus.useQuery(
    { entityId: selectedEntityId! },
    { enabled: !!selectedEntityId },
  )

  const provisionMut = trpc.factory.provisionDatabase.useMutation({
    onSuccess: () => {
      utils.platform.entitiesByTier.invalidate()
      if (selectedEntityId) utils.factory.databaseStatus.invalidate({ entityId: selectedEntityId })
      showAction('Database provisioned successfully')
    },
    onError: (err) => showAction(`Provision failed: ${err.message}`),
  })

  const deprovisionMut = trpc.factory.deprovisionDatabase.useMutation({
    onSuccess: () => {
      utils.platform.entitiesByTier.invalidate()
      if (selectedEntityId) utils.factory.databaseStatus.invalidate({ entityId: selectedEntityId })
      showAction('Database deprovisioned')
    },
    onError: (err) => showAction(`Deprovision failed: ${err.message}`),
  })

  function showAction(msg: string) {
    setActionMsg(msg)
    setTimeout(() => setActionMsg(null), 5000)
  }

  if (entitiesQuery.error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={entitiesQuery.error} />
      </div>
    )
  }

  const entities = (entitiesQuery.data ?? []) as Array<{
    id: string
    name: string
    tier: string
    status: string
    encryptedDatabaseUrl?: string | null
    domain?: string | null
  }>

  const dbStatus = dbStatusQuery.data as {
    provisioned: boolean
    host: string | null
    branchId: string | null
    neonAvailable: boolean
  } | null

  const tierColors: Record<string, string> = {
    brain: 'bg-violet-500/20 text-violet-300',
    mini_brain: 'bg-sky-500/20 text-sky-300',
    development: 'bg-emerald-500/20 text-emerald-300',
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Databases"
        subtitle={`Brain entity database provisioning \u2014 ${entities.length} entities`}
      />

      {actionMsg && (
        <div className="cyber-card border-neon-teal/40 bg-neon-teal/5 px-4 py-2 text-sm text-neon-teal">
          {actionMsg}
        </div>
      )}

      {entitiesQuery.isLoading ? (
        <LoadingState message="Loading entities..." />
      ) : entities.length === 0 ? (
        <EmptyState title="No brain entities found" />
      ) : (
        <div className="grid gap-4">
          {/* Entity list */}
          <div className="cyber-table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-dim text-left text-xs text-slate-500 uppercase tracking-wider">
                  <th className="pb-2 pr-4">Entity</th>
                  <th className="pb-2 pr-4">Tier</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Database</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entities.map((entity) => {
                  const hasDb = !!entity.encryptedDatabaseUrl
                  const isSelected = selectedEntityId === entity.id
                  return (
                    <tr
                      key={entity.id}
                      className={`border-b border-border-dim/30 hover:bg-bg-elevated/50 cursor-pointer ${
                        isSelected ? 'bg-bg-elevated/80' : ''
                      }`}
                      onClick={() => setSelectedEntityId(entity.id)}
                    >
                      <td className="py-2.5 pr-4">
                        <div className="font-medium text-slate-200">{entity.name}</div>
                        {entity.domain && (
                          <div className="text-xs text-slate-500">{entity.domain}</div>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`cyber-badge text-xs ${tierColors[entity.tier] ?? 'bg-slate-500/20 text-slate-400'}`}
                        >
                          {entity.tier}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="flex items-center gap-1.5">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              entity.status === 'active'
                                ? 'bg-neon-green'
                                : entity.status === 'suspended'
                                  ? 'bg-neon-yellow'
                                  : 'bg-slate-500'
                            }`}
                          />
                          <span className="text-slate-400 text-xs">{entity.status}</span>
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {hasDb ? (
                          <span className="text-xs text-neon-green">Provisioned</span>
                        ) : (
                          <span className="text-xs text-slate-500">Not provisioned</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <div className="flex gap-2">
                          {!hasDb && (
                            <button
                              className="cyber-btn-primary text-xs px-2 py-1"
                              disabled={provisionMut.isPending}
                              onClick={(e) => {
                                e.stopPropagation()
                                provisionMut.mutate({ entityId: entity.id })
                              }}
                            >
                              {provisionMut.isPending ? 'Provisioning...' : 'Provision'}
                            </button>
                          )}
                          {hasDb && (
                            <button
                              className="cyber-btn-danger text-xs px-2 py-1"
                              disabled={deprovisionMut.isPending}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (
                                  confirm(
                                    `Deprovision database for "${entity.name}"? This cannot be undone.`,
                                  )
                                ) {
                                  deprovisionMut.mutate({ entityId: entity.id })
                                }
                              }}
                            >
                              Deprovision
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Selected entity detail panel */}
          {selectedEntityId && (
            <div className="cyber-card p-4 space-y-3">
              <h3 className="text-sm font-orbitron text-slate-300">Database Details</h3>
              {dbStatusQuery.isLoading ? (
                <div className="text-sm text-slate-500">Loading status...</div>
              ) : dbStatus ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <div className="text-slate-500 uppercase">Provisioned</div>
                    <div className={dbStatus.provisioned ? 'text-neon-green' : 'text-slate-400'}>
                      {dbStatus.provisioned ? 'Yes' : 'No'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 uppercase">Host</div>
                    <div className="text-slate-300 font-mono">{dbStatus.host ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 uppercase">Branch ID</div>
                    <div className="text-slate-300 font-mono">{dbStatus.branchId ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 uppercase">Neon Available</div>
                    <div
                      className={dbStatus.neonAvailable ? 'text-neon-green' : 'text-neon-yellow'}
                    >
                      {dbStatus.neonAvailable ? 'Yes' : 'No (keys missing)'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">Select an entity to view details</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
