'use client'

/**
 * Checkpoint Time-Travel — execution snapshots with diff, restore,
 * replay, and branch management.
 */

import { useState } from 'react'

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const TRIGGER_COLORS: Record<string, 'blue' | 'green' | 'yellow' | 'purple' | 'red'> = {
  status_change: 'blue',
  llm_call: 'purple',
  tool_invocation: 'green',
  approval_decision: 'yellow',
  dag_step: 'blue',
  receipt_action: 'green',
  manual: 'yellow',
}

export default function CheckpointsPage() {
  const [entityId, setEntityId] = useState('')
  const [entityType, setEntityType] = useState('agent')
  const [diffA, setDiffA] = useState('')
  const [diffB, setDiffB] = useState('')
  const [replayId, setReplayId] = useState('')
  const [replayBranch, setReplayBranch] = useState('')

  const agentsQuery = trpc.agents.list.useQuery({ limit: 100, offset: 0 })
  const agents = (agentsQuery.data ?? []) as Array<{ id: string; name: string }>
  const utils = trpc.useUtils()

  const listQuery = trpc.checkpointing.list.useQuery(
    { entityType, entityId },
    { enabled: !!entityId },
  )
  const countQuery = trpc.checkpointing.count.useQuery(
    { entityType, entityId },
    { enabled: !!entityId },
  )
  const timelineQuery = trpc.checkpointing.getTimeline.useQuery(
    { entityType, entityId },
    { enabled: !!entityId },
  )
  const diffQuery = trpc.checkpointing.diff.useQuery(
    { checkpointAId: diffA, checkpointBId: diffB },
    { enabled: !!diffA && !!diffB && diffA !== diffB },
  )

  const replayMut = trpc.checkpointing.replay.useMutation({
    onSuccess: () => {
      utils.checkpointing.list.invalidate()
      setReplayId('')
      setReplayBranch('')
    },
  })

  if (agentsQuery.isLoading) return <LoadingState message="Loading Checkpoints..." />

  const checkpoints = (listQuery.data ?? []) as Array<{
    id: string
    entityType: string
    entityId: string
    stepIndex: number
    state: Record<string, unknown>
    metadata: { trigger?: string; label?: string; agentId?: string; traceId?: string }
    createdAt: Date
  }>

  const timeline = (timelineQuery.data ?? []) as Array<{
    checkpointId: string
    stepIndex: number
    label: string
    trigger: string
    createdAt: string
  }>

  const rawDiff = diffQuery.data as
    | {
        checkpointAId: string
        checkpointBId: string
        stepDelta: number
        timeDeltaMs: number
        changes: Array<{
          field: string
          before: unknown
          after: unknown
          type: 'added' | 'removed' | 'changed'
        }>
      }
    | undefined

  const diff = rawDiff
    ? {
        added: rawDiff.changes.filter((c) => c.type === 'added').map((c) => c.field),
        removed: rawDiff.changes.filter((c) => c.type === 'removed').map((c) => c.field),
        changed: rawDiff.changes
          .filter((c) => c.type === 'changed')
          .map((c) => ({ key: c.field, from: c.before, to: c.after })),
        stepDelta: rawDiff.stepDelta,
        timeDeltaMs: rawDiff.timeDeltaMs,
      }
    : null

  const total = (countQuery.data as { total: number } | undefined)?.total ?? 0
  const entityLabel =
    entityType === 'agent'
      ? (agents.find((a) => a.id === entityId)?.name ?? entityId.slice(0, 8))
      : entityId.slice(0, 8)

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Checkpoint Time-Travel"
        subtitle="Execution snapshots — diff, replay, and branch from any state"
      />

      {/* Entity Selector */}
      <div className="flex gap-3 mb-6 items-end">
        <div>
          <label className="block text-[10px] text-slate-500 uppercase mb-1">Entity Type</label>
          <select
            className="cyber-input cyber-input-sm"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value)
              setEntityId('')
              setDiffA('')
              setDiffB('')
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
              className="cyber-input cyber-input-sm w-full"
              value={entityId}
              onChange={(e) => {
                setEntityId(e.target.value)
                setDiffA('')
                setDiffB('')
              }}
            >
              <option value="">Select an agent...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="cyber-input cyber-input-sm w-full"
              placeholder="Enter ticket UUID..."
              value={entityId}
              onChange={(e) => {
                setEntityId(e.target.value)
                setDiffA('')
                setDiffB('')
              }}
            />
          )}
        </div>
      </div>

      {entityId && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Checkpoints" value={total} color="blue" sub={entityLabel} />
            <StatCard
              label="Latest Step"
              value={checkpoints.length > 0 ? checkpoints[0]!.stepIndex : '—'}
              color="green"
              sub="most recent"
            />
            <StatCard label="Timeline" value={timeline.length} color="purple" sub="events" />
            <StatCard
              label="First Saved"
              value={
                checkpoints.length > 0
                  ? new Date(checkpoints[checkpoints.length - 1]!.createdAt).toLocaleDateString()
                  : '—'
              }
              color="yellow"
              sub="earliest checkpoint"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Timeline */}
            <SectionCard title="Timeline">
              {listQuery.isLoading ? (
                <LoadingState message="Loading timeline..." />
              ) : checkpoints.length === 0 ? (
                <div className="text-xs text-slate-600 py-6 text-center">
                  No checkpoints for this entity.
                </div>
              ) : (
                <div className="space-y-1">
                  {checkpoints.map((cp, i) => {
                    const isSelectedA = diffA === cp.id
                    const isSelectedB = diffB === cp.id
                    const isSelected = isSelectedA || isSelectedB
                    return (
                      <div
                        key={cp.id}
                        className={`flex items-center gap-3 rounded px-3 py-2 border cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-neon-blue/10 border-neon-blue/30'
                            : 'bg-bg-deep border-border-dim hover:border-border'
                        }`}
                        onClick={() => {
                          if (!diffA || (diffA && diffB)) {
                            setDiffA(cp.id)
                            setDiffB('')
                          } else {
                            setDiffB(cp.id)
                          }
                        }}
                      >
                        {/* Timeline connector */}
                        <div className="flex flex-col items-center w-4">
                          <div
                            className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-neon-green' : 'bg-slate-600'}`}
                          />
                          {i < checkpoints.length - 1 && (
                            <div className="w-px h-4 bg-slate-700 mt-0.5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <StatusBadge
                              label={cp.metadata?.trigger ?? 'unknown'}
                              color={TRIGGER_COLORS[cp.metadata?.trigger ?? ''] ?? 'blue'}
                            />
                            <span className="text-[11px] text-slate-200 truncate">
                              {cp.metadata?.label ?? `Step ${cp.stepIndex}`}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Step {cp.stepIndex} &middot; {new Date(cp.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {isSelectedA && (
                            <span className="text-[9px] font-mono text-neon-blue bg-neon-blue/10 px-1 rounded">
                              A
                            </span>
                          )}
                          {isSelectedB && (
                            <span className="text-[9px] font-mono text-neon-green bg-neon-green/10 px-1 rounded">
                              B
                            </span>
                          )}
                          <button
                            className="cyber-btn-secondary cyber-btn-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              setReplayId(cp.id)
                            }}
                          >
                            Replay
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {checkpoints.length > 0 && (
                <div className="text-[10px] text-slate-600 mt-2">
                  Click two checkpoints to diff them (A then B). Click Replay to re-execute from
                  that state.
                </div>
              )}
            </SectionCard>

            {/* Diff Panel */}
            <SectionCard title="State Diff">
              {!diffA || !diffB ? (
                <div className="text-xs text-slate-600 py-6 text-center">
                  {diffA
                    ? `Checkpoint A selected (Step ${checkpoints.find((c) => c.id === diffA)?.stepIndex ?? '?'}). Click another to compare.`
                    : 'Select two checkpoints from the timeline to compare their state.'}
                </div>
              ) : diffQuery.isLoading ? (
                <LoadingState message="Computing diff..." />
              ) : !diff ? (
                <div className="text-xs text-slate-600 py-6 text-center">No differences found.</div>
              ) : (
                <div className="space-y-3">
                  {/* Added keys */}
                  {diff.added.length > 0 && (
                    <div>
                      <div className="text-[10px] text-neon-green font-mono mb-1">
                        + Added ({diff.added.length})
                      </div>
                      {diff.added.map((key) => (
                        <div
                          key={key}
                          className="text-[11px] text-neon-green/80 font-mono bg-neon-green/5 rounded px-2 py-0.5 mb-0.5"
                        >
                          + {key}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Removed keys */}
                  {diff.removed.length > 0 && (
                    <div>
                      <div className="text-[10px] text-neon-red font-mono mb-1">
                        - Removed ({diff.removed.length})
                      </div>
                      {diff.removed.map((key) => (
                        <div
                          key={key}
                          className="text-[11px] text-neon-red/80 font-mono bg-neon-red/5 rounded px-2 py-0.5 mb-0.5"
                        >
                          - {key}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Changed values */}
                  {diff.changed.length > 0 && (
                    <div>
                      <div className="text-[10px] text-neon-yellow font-mono mb-1">
                        ~ Changed ({diff.changed.length})
                      </div>
                      {diff.changed.map((c) => (
                        <div
                          key={c.key}
                          className="bg-bg-elevated rounded px-2 py-1.5 mb-1 border border-border-dim"
                        >
                          <div className="text-[11px] text-slate-300 font-mono mb-0.5">{c.key}</div>
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                            <div className="text-neon-red/70 truncate" title={String(c.from)}>
                              - {String(c.from)}
                            </div>
                            <div className="text-neon-green/70 truncate" title={String(c.to)}>
                              + {String(c.to)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {diff.added.length === 0 &&
                    diff.removed.length === 0 &&
                    diff.changed.length === 0 && (
                      <div className="text-xs text-slate-600 py-4 text-center">
                        Checkpoints are identical.
                      </div>
                    )}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Replay Panel */}
          {replayId && (
            <SectionCard title="Replay from Checkpoint" className="mb-6">
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500 block mb-1">
                    Replaying from Step{' '}
                    {checkpoints.find((c) => c.id === replayId)?.stepIndex ?? '?'}
                  </label>
                  <input
                    className="cyber-input cyber-input-sm w-full"
                    placeholder="Branch label (optional, e.g. 'what-if-approved')"
                    value={replayBranch}
                    onChange={(e) => setReplayBranch(e.target.value)}
                  />
                </div>
                <button
                  className="cyber-btn-primary cyber-btn-sm"
                  disabled={replayMut.isPending}
                  onClick={() =>
                    replayMut.mutate({
                      checkpointId: replayId,
                      branchLabel: replayBranch || undefined,
                    })
                  }
                >
                  {replayMut.isPending ? 'Replaying...' : 'Execute Replay'}
                </button>
                <button
                  className="cyber-btn-secondary cyber-btn-sm"
                  onClick={() => {
                    setReplayId('')
                    setReplayBranch('')
                  }}
                >
                  Cancel
                </button>
              </div>
              <div className="text-[10px] text-slate-600 mt-2">
                Replay re-executes from the selected checkpoint state. Optionally provide a branch
                label to create a named alternate timeline.
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  )
}
