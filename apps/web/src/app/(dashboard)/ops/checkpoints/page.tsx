'use client'

/**
 * Checkpoints — execution snapshots for rollback and replay.
 */

import { useState } from 'react'

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

export default function CheckpointsPage() {
  const [entityId, setEntityId] = useState('')
  const [entityType, setEntityType] = useState('agent')

  const agentsQuery = trpc.agents.list.useQuery({ limit: 100, offset: 0 })
  const agents = (agentsQuery.data ?? []) as Array<{ id: string; name: string }>

  const listQuery = trpc.checkpointing.list.useQuery(
    { entityType, entityId },
    { enabled: !!entityId },
  )

  if (agentsQuery.isLoading) return <LoadingState message="Loading Checkpoints..." />

  const checkpoints = (listQuery.data ?? []) as Array<{
    id: string
    entityType: string
    entityId: string
    stepIndex: number
    metadata: { trigger?: string; label?: string }
    createdAt: Date
  }>

  return (
    <div className="p-6 text-slate-50">
      <PageHeader title="Checkpoints" subtitle="Execution snapshots for rollback and time-travel" />

      <div className="flex gap-3 mb-6 items-end">
        <div>
          <label className="block text-[10px] text-slate-500 uppercase mb-1">Entity Type</label>
          <select
            className="cyber-input text-xs"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value)
              setEntityId('')
            }}
          >
            <option value="agent">Agent</option>
            <option value="ticket">Ticket</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-[10px] text-slate-500 uppercase mb-1">
            {entityType === 'agent' ? 'Select Agent' : 'Ticket ID'}
          </label>
          {entityType === 'agent' ? (
            <select
              className="cyber-input text-xs w-full"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
            >
              <option value="">— Select an agent —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="cyber-input text-xs w-full"
              placeholder="Enter ticket UUID..."
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
            />
          )}
        </div>
      </div>

      <SectionCard title="Checkpoints">
        {!entityId ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            Select an entity above to view its checkpoints.
          </div>
        ) : listQuery.isLoading ? (
          <LoadingState message="Loading checkpoints..." />
        ) : checkpoints.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            No checkpoints saved for this entity.
          </div>
        ) : (
          <div className="space-y-2">
            {checkpoints.map((cp) => (
              <div
                key={cp.id}
                className="flex items-center gap-3 bg-bg-deep rounded px-4 py-2.5 border border-border-dim"
              >
                <StatusBadge label={`Step ${cp.stepIndex}`} color="blue" />
                <div className="flex-1">
                  <div className="text-xs text-slate-200 font-medium">
                    {cp.metadata?.label ?? `Checkpoint ${cp.id.slice(0, 8)}`}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {cp.entityType}:{cp.entityId.slice(0, 8)}
                  </div>
                </div>
                <span className="text-[10px] text-slate-600">
                  {new Date(cp.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
