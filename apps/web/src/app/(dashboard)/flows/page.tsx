'use client'

/**
 * Flows — list saved flow definitions and run crews.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { EmptyState } from '../../../components/ui/empty-state'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import type { StatusColor } from '../../../components/ui/status-badge'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../lib/trpc'

interface Flow {
  id: string
  name: string
  description: string | null
  steps: unknown
  status: string
  createdBy: string | null
  version: number | null
  createdAt: Date
  updatedAt: Date
}

const FLOW_STATUS_COLOR: Record<string, StatusColor> = {
  draft: 'slate',
  active: 'green',
  archived: 'slate',
  paused: 'yellow',
}

export default function FlowsPage() {
  const [showRun, setShowRun] = useState(false)
  const [crewName, setCrewName] = useState('')
  const [task, setTask] = useState('')
  const [runResult, setRunResult] = useState<string | null>(null)
  const { data, isLoading, error } = trpc.flows.list.useQuery()

  const utils = trpc.useUtils()
  const runCrewMut = trpc.flows.runCrew.useMutation({
    onSuccess: (data) => {
      setRunResult(
        typeof data === 'object' && data !== null && 'result' in data
          ? String((data as { result: unknown }).result)
          : 'Crew run completed.',
      )
      setShowRun(false)
      setCrewName('')
      setTask('')
    },
  })
  const deleteMut = trpc.flows.delete.useMutation({
    onSuccess: () => utils.flows.list.invalidate(),
  })
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  if (error) {
    return (
      <div className="p-6 text-slate-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 text-slate-50">
        <LoadingState message="Loading flows..." />
      </div>
    )
  }

  const flows: Flow[] = (data as Flow[]) ?? []

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Flows"
        subtitle="Define and monitor multi-step agent workflows, crew runs, and recall chains."
        count={flows.length}
        actions={
          <button
            className={showRun ? 'cyber-btn-secondary' : 'cyber-btn-primary'}
            onClick={() => setShowRun(!showRun)}
          >
            {showRun ? 'Cancel' : 'Run Crew'}
          </button>
        }
      />

      {showRun && (
        <div className="cyber-card mb-4">
          <div className="flex flex-col gap-2">
            <input
              className="cyber-input"
              placeholder="Crew name..."
              value={crewName}
              onChange={(e) => setCrewName(e.target.value)}
            />
            <textarea
              className="cyber-input min-h-[60px] resize-y"
              placeholder="Task to accomplish..."
              value={task}
              onChange={(e) => setTask(e.target.value)}
            />
            <div className="flex gap-2 items-center">
              <button
                className="cyber-btn-primary"
                onClick={() =>
                  crewName.trim() &&
                  task.trim() &&
                  runCrewMut.mutate({
                    name: crewName.trim(),
                    task: task.trim(),
                    agents: [
                      {
                        id: 'default',
                        role: 'executor',
                        goal: task.trim(),
                        backstory: 'You are a skilled AI agent.',
                      },
                    ],
                  })
                }
                disabled={runCrewMut.isPending || !crewName.trim() || !task.trim()}
              >
                {runCrewMut.isPending ? 'Running...' : 'Run'}
              </button>
              {runCrewMut.error && (
                <span className="text-neon-red text-[11px]">{runCrewMut.error.message}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {runResult && (
        <div className="bg-green-950 border border-green-900 rounded-lg p-3.5 mb-4">
          <div className="text-[11px] font-bold text-neon-green mb-1 font-orbitron">
            CREW RESULT
          </div>
          <div className="text-[13px] text-green-200 whitespace-pre-wrap font-mono">
            {runResult}
          </div>
          <button
            className="mt-2 bg-transparent text-slate-500 border-none text-[11px] cursor-pointer hover:text-slate-300 transition-colors"
            onClick={() => setRunResult(null)}
          >
            Dismiss
          </button>
        </div>
      )}
      {flows.length === 0 ? (
        <EmptyState
          title="No flows defined"
          message="Create a flow to orchestrate agent workflows."
        />
      ) : (
        <div className="cyber-grid">
          {flows.map((f) => (
            <div key={f.id} className="cyber-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[15px] font-bold font-orbitron">{f.name}</span>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    label={f.status}
                    color={FLOW_STATUS_COLOR[f.status] ?? 'slate'}
                    dot
                  />
                  <button
                    className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                      deleteConfirm === f.id
                        ? 'bg-neon-red/20 text-neon-red'
                        : 'text-slate-600 hover:text-neon-red'
                    }`}
                    onClick={() => {
                      if (deleteConfirm === f.id) {
                        deleteMut.mutate({ id: f.id })
                        setDeleteConfirm(null)
                      } else {
                        setDeleteConfirm(f.id)
                      }
                    }}
                    disabled={deleteMut.isPending}
                  >
                    {deleteConfirm === f.id ? 'Confirm?' : 'x'}
                  </button>
                </div>
              </div>
              {f.description && (
                <div className="text-xs text-slate-400 mb-2 leading-relaxed">{f.description}</div>
              )}
              <div className="flex gap-4 text-[11px] text-slate-500 font-mono">
                <span>v{f.version ?? 1}</span>
                {f.createdBy && <span>by {f.createdBy}</span>}
                <span>
                  {Array.isArray(f.steps) ? `${(f.steps as unknown[]).length} steps` : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
