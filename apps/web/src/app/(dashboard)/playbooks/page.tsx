'use client'

/**
 * Playbook Manager — Teach & Repeat UI
 *
 * - List of saved playbooks: name, trigger, steps, last run
 * - "Record" button: starts recording mode (orange border)
 * - "Stop": ends recording, shows distilled playbook for review
 * - "Run": execute playbook with parameter form
 */

import { useState, useRef, useEffect } from 'react'
import { trpc } from '../../../utils/trpc'
import type { SavedPlaybook, PlaybookStep } from '../../../server/services/playbooks/recorder'
import { DbErrorBanner } from '../../../components/db-error-banner'

// ── Types ─────────────────────────────────────────────────────────────────

interface RunFormProps {
  playbook: SavedPlaybook
  onRun: (params: Record<string, unknown>) => void
  onClose: () => void
}

// ── Sub-components ────────────────────────────────────────────────────────

function RunForm({ playbook, onRun, onClose }: RunFormProps) {
  // Extract variables from step parameters
  const variables: string[] = []
  for (const step of playbook.steps) {
    for (const value of Object.values(step.parameters)) {
      const matches = String(value).match(/\{\{(\w+)\}\}/g)
      if (matches) variables.push(...matches.map((m) => m.slice(2, -2)))
    }
  }
  const uniqueVars = [...new Set(variables)]

  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(uniqueVars.map((v) => [v, ''])),
  )

  return (
    <div className="cyber-overlay">
      <div className="cyber-modal w-[440px] max-w-[95vw]">
        <h3 className="text-base font-bold text-gray-50 mb-1">Run: {playbook.name}</h3>
        <p className="text-xs text-gray-400 mb-3">
          {playbook.steps.length} steps · v{playbook.version}
        </p>

        {uniqueVars.length > 0 ? (
          <>
            <p className="text-xs text-gray-500 mb-3">Fill in the required variables:</p>
            {uniqueVars.map((varName) => (
              <div key={varName} className="mb-2.5">
                <label className="block text-xs text-gray-400 mb-1">
                  {varName.replace(/_/g, ' ')}
                </label>
                <input
                  className="cyber-input w-full"
                  value={values[varName]}
                  onChange={(e) => setValues({ ...values, [varName]: e.target.value })}
                  placeholder={`Enter ${varName}`}
                />
              </div>
            ))}
          </>
        ) : (
          <p className="text-xs text-gray-500 mb-3">No variables required. Ready to run.</p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button className="cyber-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="cyber-btn-primary" onClick={() => onRun(values)}>
            ▶ Run Playbook
          </button>
        </div>
      </div>
    </div>
  )
}

function PlaybookRow({
  playbook,
  onRun,
  onView,
}: {
  playbook: SavedPlaybook
  onRun: () => void
  onView: () => void
}) {
  return (
    <div className="cyber-card flex justify-between gap-5 p-4 px-5">
      <div className="flex-1">
        <div className="text-[15px] font-bold mb-1">{playbook.name}</div>
        <div className="text-xs text-gray-400 mb-2">{playbook.description}</div>
        <div className="flex gap-1.5 flex-wrap">
          <span className="cyber-badge">{playbook.steps.length} steps</span>
          <span className="cyber-badge">v{playbook.version}</span>
          {playbook.triggerConditions?.[0] && (
            <span className="text-[11px] text-gray-500">↯ {playbook.triggerConditions[0]}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 min-w-[160px]">
        <div className="text-[11px] text-gray-500">
          Created: {new Date(playbook.createdAt).toLocaleDateString()}
        </div>
        <div className="flex gap-1.5 mt-1">
          <button className="cyber-btn-secondary text-xs px-2.5 py-1" onClick={onView}>
            View
          </button>
          <button className="cyber-btn-primary text-xs px-3 py-1" onClick={onRun}>
            ▶ Run
          </button>
        </div>
      </div>
    </div>
  )
}

function StepDetail({ step }: { step: PlaybookStep }) {
  return (
    <div className="flex gap-3 items-start py-2.5 border-b border-border-dim">
      <span className="text-xs text-gray-500 min-w-[20px] pt-0.5">{step.index + 1}</span>
      <div className="flex-1">
        <div className="text-[13px] font-semibold mb-0.5">{step.name}</div>
        <div className="text-xs text-gray-400 mb-1">{step.description}</div>
        {Object.keys(step.parameters).length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {Object.entries(step.parameters).map(([k, v]) => (
              <span
                key={k}
                className="text-[11px] bg-bg-elevated rounded px-1.5 py-px text-gray-300"
              >
                {k}: <code>{String(v).slice(0, 30)}</code>
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="text-[11px] text-gray-500 bg-bg-deep px-1.5 py-0.5 rounded">
        {step.type}
      </span>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function PlaybooksPage() {
  const [recording, setRecording] = useState(false)
  const [selectedPlaybook, setSelectedPlaybook] = useState<SavedPlaybook | null>(null)
  const [runTarget, setRunTarget] = useState<SavedPlaybook | null>(null)
  const [lastRunResult, setLastRunResult] = useState<string | null>(null)

  const { data: playbooks, isLoading, error } = trpc.playbooks.list.useQuery()

  const runMutation = trpc.playbooks.run.useMutation()
  const startRecordingMutation = trpc.playbooks.startRecording.useMutation()
  const endRecordingMutation = trpc.playbooks.endRecording.useMutation()
  const utils = trpc.useUtils()

  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null)
  const resultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear timeout on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current)
      }
    }
  }, [])

  if (error) {
    return (
      <div className="bg-bg-deep min-h-screen text-gray-50 p-6">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-bg-deep min-h-screen text-gray-50 p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-gray-500">
          <div className="text-2xl mb-2">Loading...</div>
          <div className="text-[13px]">Fetching playbooks</div>
        </div>
      </div>
    )
  }

  const playbookList: SavedPlaybook[] = (playbooks as SavedPlaybook[]) ?? []

  function handleStartRecording() {
    startRecordingMutation.mutate(
      {},
      {
        onSuccess: (data) => {
          setRecordingSessionId(data.sessionId)
          setRecording(true)
        },
      },
    )
  }

  function handleStopRecording() {
    if (recordingSessionId) {
      endRecordingMutation.mutate(
        { sessionId: recordingSessionId },
        {
          onSuccess: () => {
            setRecording(false)
            setRecordingSessionId(null)
            utils.playbooks.list.invalidate()
          },
        },
      )
    } else {
      setRecording(false)
    }
  }

  function handleRun(params: Record<string, unknown>) {
    if (!runTarget) return
    runMutation.mutate(
      { id: runTarget.id, parameterValues: params },
      {
        onSuccess: () => {
          utils.playbooks.list.invalidate()
          setLastRunResult(`Playbook "${runTarget.name}" executed successfully.`)
          if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current)
          resultTimeoutRef.current = setTimeout(() => setLastRunResult(null), 5000)
        },
        onError: (err) => {
          setLastRunResult(`Error: ${err.message}`)
          if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current)
          resultTimeoutRef.current = setTimeout(() => setLastRunResult(null), 5000)
        },
      },
    )
    setRunTarget(null)
  }

  return (
    <div
      className={`bg-bg-deep min-h-screen text-gray-50 p-6 ${recording ? 'outline outline-3 -outline-offset-[3px] outline-orange-500' : ''}`}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="m-0 text-[22px] font-bold font-orbitron">Playbooks</h1>
          <p className="mt-1 text-[13px] text-gray-500">
            Teach the brain by recording your actions. Replay anytime.
          </p>
        </div>
        <div className="flex gap-2">
          {recording ? (
            <button
              className="bg-gray-700 border-2 border-orange-500 rounded-md text-orange-500 px-4 py-2 text-[13px] font-bold cursor-pointer"
              onClick={handleStopRecording}
            >
              ⏹ Stop Recording
            </button>
          ) : (
            <button className="cyber-btn-danger" onClick={handleStartRecording}>
              ⏺ Record
            </button>
          )}
        </div>
      </div>
      {recording && (
        <div className="bg-orange-950 border border-orange-500 rounded-md px-4 py-2 mb-4 text-[13px] text-orange-200">
          ⏺ Recording in progress — your actions are being captured
        </div>
      )}

      {lastRunResult && (
        <div className="bg-green-950 border border-green-500 rounded-md px-4 py-2 mb-4 text-[13px] text-green-300">
          {lastRunResult}
        </div>
      )}

      {/* Playbook list */}
      {!selectedPlaybook ? (
        <div className="flex flex-col gap-3">
          {playbookList.length === 0 ? (
            <div className="text-gray-500 text-[13px] text-center p-10">
              No playbooks yet. Click &quot;Record&quot; to create your first one.
            </div>
          ) : (
            playbookList.map((pb) => (
              <PlaybookRow
                key={pb.id}
                playbook={pb}
                onRun={() => setRunTarget(pb)}
                onView={() => setSelectedPlaybook(pb)}
              />
            ))
          )}
        </div>
      ) : (
        /* Detail view */
        <div className="cyber-card p-6">
          <button
            className="bg-transparent border-none text-gray-500 text-[13px] cursor-pointer mb-3 p-0"
            onClick={() => setSelectedPlaybook(null)}
          >
            ← Back
          </button>
          <h2 className="m-0 mb-1.5 text-lg font-bold font-orbitron">{selectedPlaybook.name}</h2>
          <p className="text-[13px] text-gray-400 mb-3">{selectedPlaybook.description}</p>
          <div className="flex gap-1.5 mb-5">
            <span className="cyber-badge">v{selectedPlaybook.version}</span>
            <span className="cyber-badge">{selectedPlaybook.steps.length} steps</span>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">
              Steps
            </div>
            {selectedPlaybook.steps.map((step) => (
              <StepDetail key={step.index} step={step} />
            ))}
          </div>
          <div className="mt-5">
            <button
              className="cyber-btn-primary"
              onClick={() => {
                setSelectedPlaybook(null)
                setRunTarget(selectedPlaybook)
              }}
            >
              ▶ Run This Playbook
            </button>
          </div>
        </div>
      )}

      {/* Run modal */}
      {runTarget && (
        <RunForm playbook={runTarget} onRun={handleRun} onClose={() => setRunTarget(null)} />
      )}
    </div>
  )
}
