'use client'

/**
 * Checkpoints — browse and restore execution state snapshots.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../lib/trpc'

interface Checkpoint {
  id: string
  entityType: string
  entityId: string
  stepIndex: number
  state: unknown
  metadata: unknown
  createdAt: Date
}

export default function CheckpointsPage() {
  const [entityType, setEntityType] = useState('ticket')
  const [entityId, setEntityId] = useState('')
  const [searching, setSearching] = useState(false)

  const listQuery = trpc.checkpointing.list.useQuery(
    { entityType, entityId },
    { enabled: searching && entityId.length > 0 },
  )

  const handleSearch = () => {
    if (entityId.trim()) setSearching(true)
  }

  return (
    <div className="p-6 text-slate-100">
      <PageHeader title="Checkpoints" />

      <div className="flex gap-2 mb-5">
        <select
          className="cyber-select"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value)
            setSearching(false)
          }}
        >
          <option value="ticket">Ticket</option>
          <option value="agent">Agent</option>
          <option value="flow">Flow</option>
        </select>
        <input
          className="cyber-input flex-1"
          placeholder="Entity ID (UUID)"
          value={entityId}
          onChange={(e) => {
            setEntityId(e.target.value)
            setSearching(false)
          }}
        />
        <button className="cyber-btn-primary" onClick={handleSearch}>
          Search
        </button>
      </div>

      {!searching ? (
        <div className="text-center text-slate-500 py-10 text-sm">
          Enter an entity type and ID to browse checkpoints.
        </div>
      ) : listQuery.isLoading ? (
        <LoadingState message="Loading checkpoints..." />
      ) : listQuery.error ? (
        <DbErrorBanner error={listQuery.error} />
      ) : (
        (() => {
          const checkpoints: Checkpoint[] = listQuery.data ?? []
          return checkpoints.length === 0 ? (
            <div className="text-center text-slate-500 py-10 text-sm">
              No checkpoints found for this entity.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {checkpoints.map((cp) => (
                <div key={cp.id} className="cyber-card p-3.5">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="cyber-badge bg-neon-blue/10 text-neon-blue border-neon-blue/20">
                      Step {cp.stepIndex}
                    </span>
                    <span className="text-[11px] text-slate-500">{cp.entityType}</span>
                    <span className="text-[10px] text-slate-600 ml-auto">
                      {new Date(cp.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 whitespace-pre-wrap leading-snug">
                    {JSON.stringify(cp.state, null, 2).slice(0, 200)}
                    {JSON.stringify(cp.state).length > 200 ? '...' : ''}
                  </div>
                </div>
              ))}
            </div>
          )
        })()
      )}
    </div>
  )
}
