'use client'

/**
 * Flows — list saved flow definitions and run crews.
 */

import { useState } from 'react'
import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

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

const STATUS_DOT: Record<string, string> = {
  draft: 'neon-dot neon-dot-blue',
  active: 'neon-dot neon-dot-green',
  archived: 'neon-dot neon-dot-red',
  paused: 'neon-dot neon-dot-yellow',
}

const STATUS_TEXT: Record<string, string> = {
  draft: 'text-neon-blue',
  active: 'text-neon-green',
  archived: 'text-neon-red',
  paused: 'text-neon-yellow',
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
      <div className="p-6 text-slate-50 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">
          <div className="text-2xl mb-2 font-orbitron">Loading...</div>
          <div className="text-xs">Fetching flows</div>
        </div>
      </div>
    )
  }

  const flows: Flow[] = (data as Flow[]) ?? []

  return (
    <div className="p-6 text-slate-50">
      <div className="mb-5">
        <div className="flex justify-between items-center">
          <h2 className="m-0 text-[22px] font-bold font-orbitron text-neon-purple">Flows</h2>
          <button
            className={showRun ? 'cyber-btn-secondary' : 'cyber-btn-primary'}
            onClick={() => setShowRun(!showRun)}
          >
            {showRun ? 'Cancel' : 'Run Crew'}
          </button>
        </div>
        <p className="mt-1 mb-0 text-xs text-slate-500">
          Define and monitor multi-step agent workflows, crew runs, and recall chains.
        </p>
      </div>

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
        <div className="text-center text-slate-500 py-10 text-sm">
          No flows defined yet. Create a flow to orchestrate agent workflows.
        </div>
      ) : (
        <div className="cyber-grid">
          {flows.map((f) => (
            <div key={f.id} className="cyber-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[15px] font-bold font-orbitron">{f.name}</span>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className={STATUS_DOT[f.status] || 'neon-dot neon-dot-blue'} />
                    <span
                      className={`text-[10px] font-semibold uppercase ${STATUS_TEXT[f.status] || 'text-slate-500'}`}
                    >
                      {f.status}
                    </span>
                  </span>
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
