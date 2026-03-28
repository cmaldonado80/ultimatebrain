'use client'

/**
 * Entity Detail — drill-down view for a single brain entity.
 * Shows agents, database, health, children, and management controls.
 */

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'

import { DbErrorBanner } from '../../../../../components/db-error-banner'
import { trpc } from '../../../../../utils/trpc'

const TIER_BADGE: Record<string, string> = {
  brain: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  mini_brain: 'bg-neon-green/20 text-neon-green border-neon-green/30',
  development: 'bg-neon-yellow/20 text-neon-yellow border-neon-yellow/30',
}

const STATUS_DOT: Record<string, string> = {
  active: 'neon-dot-green',
  provisioning: 'neon-dot-yellow neon-dot-pulse',
  suspended: 'neon-dot-red',
  degraded: 'neon-dot-yellow',
}

const ROLE_BADGE: Record<string, string> = {
  primary: 'text-neon-blue border-neon-blue/20',
  monitor: 'text-neon-green border-neon-green/20',
  healer: 'text-neon-red border-neon-red/20',
  specialist: 'text-neon-purple border-neon-purple/20',
}

export default function EntityDetailPage() {
  const params = useParams()
  const router = useRouter()
  const entityId = params.id as string

  const [assignAgentId, setAssignAgentId] = useState('')
  const [assignRole, setAssignRole] = useState<string>('primary')
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const entityQuery = trpc.platform.entity.useQuery({ id: entityId })
  const hierarchyQuery = trpc.platform.entityHierarchy.useQuery({ id: entityId })
  const agentsQuery = trpc.platform.entityAgents.useQuery({ entityId })
  const healthQuery = trpc.platform.entityHealth.useQuery({ id: entityId })
  const dbStatusQuery = trpc.factory.databaseStatus.useQuery({ entityId })
  const utils = trpc.useUtils()

  const activateMut = trpc.platform.activateEntity.useMutation({
    onSuccess: () => {
      utils.platform.entity.invalidate({ id: entityId })
      utils.platform.entityHealth.invalidate({ id: entityId })
    },
  })
  const suspendMut = trpc.platform.suspendEntity.useMutation({
    onSuccess: () => utils.platform.entity.invalidate({ id: entityId }),
  })
  const deleteMut = trpc.platform.deleteEntity.useMutation({
    onSuccess: () => router.push('/engines/manage'),
  })
  const assignMut = trpc.platform.assignEntityAgent.useMutation({
    onSuccess: () => {
      utils.platform.entityAgents.invalidate({ entityId })
      setAssignAgentId('')
    },
  })
  const removeMut = trpc.platform.removeEntityAgent.useMutation({
    onSuccess: () => utils.platform.entityAgents.invalidate({ entityId }),
  })
  const provisionDbMut = trpc.factory.provisionDatabase.useMutation({
    onSuccess: () => {
      utils.factory.databaseStatus.invalidate({ entityId })
      utils.platform.entity.invalidate({ id: entityId })
    },
  })
  const deprovisionDbMut = trpc.factory.deprovisionDatabase.useMutation({
    onSuccess: () => {
      utils.factory.databaseStatus.invalidate({ entityId })
      utils.platform.entity.invalidate({ id: entityId })
    },
  })
  const reprovisionMut = trpc.factory.reprovisionAgents.useMutation({
    onSuccess: () => {
      utils.platform.entityAgents.invalidate({ entityId })
      utils.platform.entity.invalidate({ id: entityId })
    },
  })

  const error = entityQuery.error || hierarchyQuery.error

  if (error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (entityQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">
          <div className="text-lg font-orbitron">Loading entity...</div>
        </div>
      </div>
    )
  }

  const entity = entityQuery.data as {
    id: string
    name: string
    tier: string
    domain: string | null
    status: string
    parentId: string | null
    enginesEnabled: string[] | null
    databaseUrl: string | null
    lastHealthCheck: Date | null
    config: Record<string, unknown> | null
    createdAt: Date
  } | null

  if (!entity) {
    return (
      <div className="p-6 text-slate-50">
        <div className="text-center py-10 text-slate-500">Entity not found.</div>
      </div>
    )
  }

  const hierarchy = hierarchyQuery.data as {
    entity: typeof entity
    parent: typeof entity | null
    children: Array<typeof entity>
  } | null

  const entityAgents = (agentsQuery.data ?? []) as Array<{
    agentId: string
    role: string
    agentName: string
    agentStatus: string
  }>

  const health = healthQuery.data as {
    entityId: string
    status: string
    lastCheck: Date | null
    agentCount: number
    engineCount: number
  } | null

  const dbStatus = dbStatusQuery.data as {
    provisioned: boolean
    host?: string
    branchId?: string
    neonAvailable: boolean
  } | null

  return (
    <div className="p-6 text-slate-50">
      {/* Header */}
      <div className="mb-6">
        <button
          className="text-xs text-slate-500 hover:text-slate-300 mb-2 block"
          onClick={() => router.push('/engines/manage')}
        >
          ← Back to Brain Manager
        </button>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="m-0 text-2xl font-bold font-orbitron">{entity.name}</h2>
          <span
            className={`cyber-badge text-[10px] uppercase ${TIER_BADGE[entity.tier] ?? 'text-slate-400 border-slate-400/20'}`}
          >
            {entity.tier.replace('_', ' ')}
          </span>
          <span className={`neon-dot ${STATUS_DOT[entity.status] ?? 'neon-dot-blue'}`} />
          <span className="text-xs text-slate-400 uppercase">{entity.status}</span>
        </div>
        <div className="flex gap-2">
          {entity.status !== 'active' && (
            <button
              className="cyber-btn-primary cyber-btn-sm"
              onClick={() => activateMut.mutate({ id: entityId })}
              disabled={activateMut.isPending}
            >
              Activate
            </button>
          )}
          {entity.status === 'active' && (
            <button
              className="cyber-btn-secondary cyber-btn-sm"
              onClick={() => suspendMut.mutate({ id: entityId })}
              disabled={suspendMut.isPending}
            >
              Suspend
            </button>
          )}
          <button
            className="cyber-btn-secondary cyber-btn-sm"
            onClick={() => reprovisionMut.mutate({ entityId })}
            disabled={reprovisionMut.isPending}
          >
            {reprovisionMut.isPending ? 'Reprovisioning...' : 'Reprovision Agents'}
          </button>
          <button
            className={`cyber-btn-sm ${deleteConfirm ? 'cyber-btn-danger' : 'cyber-btn-secondary text-slate-600'}`}
            onClick={() => {
              if (deleteConfirm) deleteMut.mutate({ id: entityId })
              else setDeleteConfirm(true)
            }}
            disabled={deleteMut.isPending}
          >
            {deleteConfirm ? 'Confirm Delete?' : 'Delete'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Info */}
        <div className="cyber-card p-4">
          <h3 className="text-sm font-orbitron text-white mb-3">Entity Info</h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Domain</span>
              <span>{entity.domain ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tier</span>
              <span>{entity.tier.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Engines</span>
              <span>{entity.enginesEnabled?.join(', ') || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Created</span>
              <span>{new Date(entity.createdAt).toLocaleDateString()}</span>
            </div>
            {hierarchy?.parent && (
              <div className="flex justify-between">
                <span className="text-slate-500">Parent</span>
                <button
                  className="text-neon-blue hover:underline"
                  onClick={() => router.push(`/engines/manage/${hierarchy.parent!.id}`)}
                >
                  {hierarchy.parent.name}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Health */}
        <div className="cyber-card p-4">
          <h3 className="text-sm font-orbitron text-white mb-3">Health</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="text-center">
              <div
                className={`text-xl font-bold ${entity.status === 'active' ? 'text-neon-green' : 'text-neon-yellow'}`}
              >
                {entity.status}
              </div>
              <div className="text-[10px] text-slate-500">Status</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-neon-blue">{health?.agentCount ?? 0}</div>
              <div className="text-[10px] text-slate-500">Agents</div>
            </div>
          </div>
          <div className="text-[10px] text-slate-600">
            Last check:{' '}
            {entity.lastHealthCheck ? new Date(entity.lastHealthCheck).toLocaleString() : 'Never'}
          </div>
        </div>

        {/* Database */}
        <div className="cyber-card p-4">
          <h3 className="text-sm font-orbitron text-white mb-3">Database</h3>
          {dbStatus?.provisioned ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="neon-dot neon-dot-green" />
                <span className="text-xs text-neon-green">Provisioned</span>
              </div>
              {dbStatus.host && (
                <div className="text-[10px] text-slate-500 font-mono truncate">{dbStatus.host}</div>
              )}
              <button
                className="cyber-btn-danger cyber-btn-xs"
                onClick={() => deprovisionDbMut.mutate({ entityId })}
                disabled={deprovisionDbMut.isPending}
              >
                {deprovisionDbMut.isPending ? 'Deleting...' : 'Deprovision Database'}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="neon-dot neon-dot-yellow" />
                <span className="text-xs text-slate-400">Not provisioned</span>
              </div>
              {dbStatus?.neonAvailable && (
                <button
                  className="cyber-btn-primary cyber-btn-xs"
                  onClick={() => provisionDbMut.mutate({ entityId })}
                  disabled={provisionDbMut.isPending}
                >
                  {provisionDbMut.isPending ? 'Provisioning...' : 'Provision Database'}
                </button>
              )}
              {!dbStatus?.neonAvailable && (
                <div className="text-[10px] text-slate-600">Neon API not configured</div>
              )}
            </div>
          )}
        </div>

        {/* Children */}
        <div className="cyber-card p-4">
          <h3 className="text-sm font-orbitron text-white mb-3">
            Children ({hierarchy?.children?.length ?? 0})
          </h3>
          {!hierarchy?.children?.length ? (
            <div className="text-xs text-slate-600 text-center py-3">No child entities</div>
          ) : (
            <div className="space-y-1.5">
              {hierarchy.children.map((child) => (
                <button
                  key={child.id}
                  className="flex items-center justify-between w-full px-3 py-2 bg-bg-elevated rounded-md border border-border hover:border-neon-blue/30 transition-colors text-left"
                  onClick={() => router.push(`/engines/manage/${child.id}`)}
                >
                  <div>
                    <div className="text-xs font-semibold">{child.name}</div>
                    <div className="text-[10px] text-slate-600">{child.tier.replace('_', ' ')}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`neon-dot ${STATUS_DOT[child.status] ?? 'neon-dot-blue'}`} />
                    <span className="text-[10px] text-slate-500">{child.status}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agents */}
      <div className="cyber-card p-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-orbitron text-white">
            Assigned Agents ({entityAgents.length})
          </h3>
        </div>

        {/* Assign form */}
        <div className="flex gap-2 mb-3">
          <input
            className="cyber-input cyber-input-sm flex-1"
            placeholder="Agent ID (UUID) to assign..."
            value={assignAgentId}
            onChange={(e) => setAssignAgentId(e.target.value)}
          />
          <select
            className="cyber-select cyber-select-sm"
            value={assignRole}
            onChange={(e) => setAssignRole(e.target.value)}
          >
            <option value="primary">Primary</option>
            <option value="monitor">Monitor</option>
            <option value="healer">Healer</option>
            <option value="specialist">Specialist</option>
          </select>
          <button
            className="cyber-btn-primary cyber-btn-sm flex-shrink-0"
            onClick={() =>
              assignAgentId.trim() &&
              assignMut.mutate({
                entityId,
                agentId: assignAgentId.trim(),
                role: assignRole as 'primary' | 'monitor' | 'healer' | 'specialist',
              })
            }
            disabled={assignMut.isPending || !assignAgentId.trim()}
          >
            Assign
          </button>
        </div>

        {entityAgents.length === 0 ? (
          <div className="text-xs text-slate-600 text-center py-4">
            No agents assigned. Use Reprovision or assign manually above.
          </div>
        ) : (
          <div className="space-y-1">
            {entityAgents.map((a) => (
              <div
                key={a.agentId}
                className="flex items-center justify-between px-3 py-2 bg-bg-elevated rounded-md border border-border-dim"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{a.agentName}</span>
                  <span className={`cyber-badge text-[9px] uppercase ${ROLE_BADGE[a.role] ?? ''}`}>
                    {a.role}
                  </span>
                  <span className={`neon-dot ${STATUS_DOT[a.agentStatus] ?? 'neon-dot-blue'}`} />
                </div>
                <button
                  className="text-[10px] text-slate-600 hover:text-neon-red transition-colors"
                  onClick={() => removeMut.mutate({ entityId, agentId: a.agentId })}
                  disabled={removeMut.isPending}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
