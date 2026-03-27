'use client'

/**
 * Database Management — provision and manage per-mini-brain Neon databases.
 */

import { useState } from 'react'
import { trpc } from '../../../../utils/trpc'

export default function DatabasesPage() {
  const entitiesQuery = trpc.platform.entitiesByTier.useQuery({ tier: 'mini_brain' })
  const provisionMut = trpc.factory.provisionDatabase.useMutation()
  const deprovisionMut = trpc.factory.deprovisionDatabase.useMutation()

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const entities = entitiesQuery.data ?? []

  return (
    <div className="p-6 text-gray-50 max-w-[1000px]">
      <div className="mb-6">
        <h2 className="m-0 text-xl font-bold font-orbitron">Databases</h2>
        <p className="mt-1 mb-0 text-[13px] text-gray-500">
          Provision dedicated PostgreSQL databases for mini-brains via Neon
        </p>
      </div>

      <div className="cyber-grid">
        {entities.map((entity) => (
          <DatabaseCard
            key={entity.id}
            entity={entity}
            provisionMut={provisionMut}
            deprovisionMut={deprovisionMut}
            confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete}
            onRefresh={() => entitiesQuery.refetch()}
          />
        ))}
      </div>

      {entities.length === 0 && !entitiesQuery.isLoading && (
        <div className="text-center text-gray-500 py-10 text-[13px]">
          No mini-brains found. Create one from the Brain Manager first.
        </div>
      )}

      {entitiesQuery.isLoading && (
        <div className="text-center text-gray-500 py-10 text-[13px]">Loading mini-brains...</div>
      )}
    </div>
  )
}

function DatabaseCard({
  entity,
  provisionMut,
  deprovisionMut,
  confirmDelete,
  setConfirmDelete,
  onRefresh,
}: {
  entity: {
    id: string
    name: string
    domain: string | null
    status: string
    databaseUrl?: string | null
    config?: unknown
  }
  provisionMut: ReturnType<typeof trpc.factory.provisionDatabase.useMutation>
  deprovisionMut: ReturnType<typeof trpc.factory.deprovisionDatabase.useMutation>
  confirmDelete: string | null
  setConfirmDelete: (id: string | null) => void
  onRefresh: () => void
}) {
  const dbStatus = trpc.factory.databaseStatus.useQuery({ entityId: entity.id })
  const data = dbStatus.data
  const provisioned = data?.provisioned ?? false
  const neonAvailable = data?.neonAvailable ?? false

  const [provisionResult, setProvisionResult] = useState<string | null>(null)

  async function handleProvision() {
    setProvisionResult(null)
    try {
      const result = await provisionMut.mutateAsync({ entityId: entity.id })
      setProvisionResult(`Database provisioned at ${result.host}`)
      dbStatus.refetch()
      onRefresh()
    } catch (err) {
      setProvisionResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleDeprovision() {
    try {
      await deprovisionMut.mutateAsync({ entityId: entity.id })
      setConfirmDelete(null)
      setProvisionResult(null)
      dbStatus.refetch()
      onRefresh()
    } catch (err) {
      setProvisionResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="cyber-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={`neon-dot ${provisioned ? 'neon-dot-green' : 'neon-dot-yellow'}`} />
        <span className="font-bold text-sm flex-1">{entity.name}</span>
        {entity.domain && (
          <span className="cyber-badge text-neon-purple text-[10px]">{entity.domain}</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {provisioned && data?.host && (
          <div className="flex gap-2 items-baseline">
            <span className="text-[11px] text-gray-500 min-w-[50px]">Host</span>
            <code className="text-[11px] text-cyan-300 bg-bg-deep px-1.5 py-0.5 rounded break-all">
              {data.host}
            </code>
          </div>
        )}

        {provisioned && data?.branchId && (
          <div className="flex gap-2 items-baseline">
            <span className="text-[11px] text-gray-500 min-w-[50px]">Branch</span>
            <code className="text-[11px] text-cyan-300 bg-bg-deep px-1.5 py-0.5 rounded break-all">
              {data.branchId}
            </code>
          </div>
        )}

        {!provisioned && <div className="text-xs text-gray-500 mb-2">No database provisioned</div>}

        {!neonAvailable && (
          <div className="text-[11px] text-neon-yellow bg-neon-yellow/5 px-2.5 py-1.5 rounded border border-neon-yellow/20">
            Neon API not configured. Set NEON_API_KEY and NEON_PROJECT_ID in Vercel env vars.
          </div>
        )}

        {provisionResult && (
          <div
            className={`text-[11px] px-2.5 py-1.5 rounded border mt-1 ${
              provisionResult.startsWith('Error')
                ? 'border-neon-red/30 text-red-300'
                : 'border-neon-green/30 text-green-300'
            }`}
          >
            {provisionResult}
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-1">
        {!provisioned && neonAvailable && (
          <button
            className="cyber-btn-primary !text-xs"
            onClick={handleProvision}
            disabled={provisionMut.isPending}
          >
            {provisionMut.isPending ? 'Provisioning...' : 'Provision Database'}
          </button>
        )}

        {provisioned && neonAvailable && (
          <>
            {confirmDelete === entity.id ? (
              <div className="flex gap-1.5">
                <button className="cyber-btn-danger !text-xs" onClick={handleDeprovision}>
                  Confirm Delete
                </button>
                <button
                  className="cyber-btn-secondary !text-xs"
                  onClick={() => setConfirmDelete(null)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="cyber-btn-secondary !text-xs"
                onClick={() => setConfirmDelete(entity.id)}
              >
                Deprovision
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
