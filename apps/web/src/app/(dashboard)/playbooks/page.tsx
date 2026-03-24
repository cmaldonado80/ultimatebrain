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
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <h3 style={styles.modalTitle}>Run: {playbook.name}</h3>
        <p style={styles.modalSub}>
          {playbook.steps.length} steps · v{playbook.version}
        </p>

        {uniqueVars.length > 0 ? (
          <>
            <p style={styles.modalHint}>Fill in the required variables:</p>
            {uniqueVars.map((varName) => (
              <div key={varName} style={styles.formField}>
                <label style={styles.fieldLabel}>{varName.replace(/_/g, ' ')}</label>
                <input
                  style={styles.fieldInput}
                  value={values[varName]}
                  onChange={(e) => setValues({ ...values, [varName]: e.target.value })}
                  placeholder={`Enter ${varName}`}
                />
              </div>
            ))}
          </>
        ) : (
          <p style={styles.modalHint}>No variables required. Ready to run.</p>
        )}

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button style={styles.runBtn} onClick={() => onRun(values)}>
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
    <div style={styles.row}>
      <div style={styles.rowLeft}>
        <div style={styles.rowName}>{playbook.name}</div>
        <div style={styles.rowDesc}>{playbook.description}</div>
        <div style={styles.rowMeta}>
          <span style={styles.metaTag}>{playbook.steps.length} steps</span>
          <span style={styles.metaTag}>v{playbook.version}</span>
          {playbook.triggerConditions?.[0] && (
            <span style={styles.metaTrigger}>↯ {playbook.triggerConditions[0]}</span>
          )}
        </div>
      </div>
      <div style={styles.rowRight}>
        <div style={styles.lastRun}>
          Created: {new Date(playbook.createdAt).toLocaleDateString()}
        </div>
        <div style={styles.rowActions}>
          <button style={styles.viewBtn} onClick={onView}>
            View
          </button>
          <button style={styles.runRowBtn} onClick={onRun}>
            ▶ Run
          </button>
        </div>
      </div>
    </div>
  )
}

function StepDetail({ step }: { step: PlaybookStep }) {
  return (
    <div style={styles.stepRow}>
      <span style={styles.stepIdx}>{step.index + 1}</span>
      <div style={styles.stepInfo}>
        <div style={styles.stepName}>{step.name}</div>
        <div style={styles.stepDesc}>{step.description}</div>
        {Object.keys(step.parameters).length > 0 && (
          <div style={styles.stepParams}>
            {Object.entries(step.parameters).map(([k, v]) => (
              <span key={k} style={styles.paramChip}>
                {k}: <code>{String(v).slice(0, 30)}</code>
              </span>
            ))}
          </div>
        )}
      </div>
      <span style={styles.stepType}>{step.type}</span>
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

  if (isLoading) {
    return (
      <div
        style={{
          ...styles.page,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
        }}
      >
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>Loading...</div>
          <div style={{ fontSize: 13 }}>Fetching playbooks</div>
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
    <div style={{ ...styles.page, ...(recording ? styles.recordingMode : {}) }}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Playbooks</h1>
          <p style={styles.subtitle}>Teach the brain by recording your actions. Replay anytime.</p>
        </div>
        <div style={styles.headerActions}>
          {recording ? (
            <button style={styles.stopBtn} onClick={handleStopRecording}>
              ⏹ Stop Recording
            </button>
          ) : (
            <button style={styles.recordBtn} onClick={handleStartRecording}>
              ⏺ Record
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            background: '#1e1b4b',
            border: '1px solid #4338ca',
            borderRadius: 8,
            padding: '10px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ color: '#818cf8', fontSize: 14 }}>
            Database tables not yet provisioned.
          </span>
          <span style={{ color: '#6b7280', fontSize: 12 }}>
            Run the migration to populate data.
          </span>
        </div>
      )}

      {recording && (
        <div style={styles.recordingBanner}>
          ⏺ Recording in progress — your actions are being captured
        </div>
      )}

      {lastRunResult && <div style={styles.successBanner}>{lastRunResult}</div>}

      {/* Playbook list */}
      {!selectedPlaybook ? (
        <div style={styles.list}>
          {playbookList.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 40 }}>
              No playbooks yet. Click "Record" to create your first one.
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
        <div style={styles.detail}>
          <button style={styles.backBtn} onClick={() => setSelectedPlaybook(null)}>
            ← Back
          </button>
          <h2 style={styles.detailTitle}>{selectedPlaybook.name}</h2>
          <p style={styles.detailDesc}>{selectedPlaybook.description}</p>
          <div style={styles.detailMeta}>
            <span style={styles.metaTag}>v{selectedPlaybook.version}</span>
            <span style={styles.metaTag}>{selectedPlaybook.steps.length} steps</span>
          </div>
          <div style={styles.stepsSection}>
            <div style={styles.sectionHeader}>Steps</div>
            {selectedPlaybook.steps.map((step) => (
              <StepDetail key={step.index} step={step} />
            ))}
          </div>
          <div style={styles.detailActions}>
            <button
              style={styles.runRowBtn}
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

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  page: {
    background: '#0f172a',
    minHeight: '100vh',
    color: '#f9fafb',
    fontFamily: 'sans-serif',
    padding: 24,
  },
  recordingMode: { outline: '3px solid #f97316', outlineOffset: -3 },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  headerActions: { display: 'flex', gap: 8 },
  recordBtn: {
    background: '#ef4444',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  stopBtn: {
    background: '#374151',
    border: '2px solid #f97316',
    borderRadius: 6,
    color: '#f97316',
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  recordingBanner: {
    background: '#7c2d12',
    border: '1px solid #f97316',
    borderRadius: 6,
    padding: '8px 16px',
    marginBottom: 16,
    fontSize: 13,
    color: '#fed7aa',
  },
  successBanner: {
    background: '#14532d',
    border: '1px solid #22c55e',
    borderRadius: 6,
    padding: '8px 16px',
    marginBottom: 16,
    fontSize: 13,
    color: '#86efac',
  },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 12 },
  row: {
    background: '#1f2937',
    borderRadius: 8,
    padding: '16px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 20,
  },
  rowLeft: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: 700, marginBottom: 4 },
  rowDesc: { fontSize: 12, color: '#9ca3af', marginBottom: 8 },
  rowMeta: { display: 'flex', gap: 6, flexWrap: 'wrap' as const },
  metaTag: {
    background: '#374151',
    borderRadius: 10,
    padding: '2px 8px',
    fontSize: 11,
    color: '#9ca3af',
  },
  metaTrigger: { fontSize: 11, color: '#6b7280' },
  rowRight: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    gap: 4,
    minWidth: 160,
  },
  lastRun: { fontSize: 11, color: '#6b7280' },
  rowActions: { display: 'flex', gap: 6, marginTop: 4 },
  viewBtn: {
    background: 'transparent',
    border: '1px solid #4b5563',
    borderRadius: 4,
    color: '#9ca3af',
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  runRowBtn: {
    background: '#2563eb',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    padding: '4px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  detail: { background: '#1f2937', borderRadius: 8, padding: 24 },
  backBtn: {
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
    fontSize: 13,
    cursor: 'pointer',
    marginBottom: 12,
    padding: 0,
  },
  detailTitle: { margin: '0 0 6px', fontSize: 18, fontWeight: 700 },
  detailDesc: { fontSize: 13, color: '#9ca3af', marginBottom: 12 },
  detailMeta: { display: 'flex', gap: 6, marginBottom: 20 },
  stepsSection: {},
  sectionHeader: {
    fontSize: 12,
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 10,
  },
  stepRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
    padding: '10px 0',
    borderBottom: '1px solid #374151',
  },
  stepIdx: { fontSize: 12, color: '#6b7280', minWidth: 20, paddingTop: 2 },
  stepInfo: { flex: 1 },
  stepName: { fontSize: 13, fontWeight: 600, marginBottom: 2 },
  stepDesc: { fontSize: 12, color: '#9ca3af', marginBottom: 4 },
  stepParams: { display: 'flex', gap: 4, flexWrap: 'wrap' as const },
  paramChip: {
    fontSize: 11,
    background: '#374151',
    borderRadius: 4,
    padding: '1px 6px',
    color: '#d1d5db',
  },
  stepType: {
    fontSize: 11,
    color: '#6b7280',
    background: '#111827',
    padding: '2px 6px',
    borderRadius: 4,
  },
  detailActions: { marginTop: 20 },
  // Modal
  modalOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: 8,
    padding: 24,
    width: 440,
    maxWidth: '95vw',
  },
  modalTitle: { margin: '0 0 4px', fontSize: 16, fontWeight: 700 },
  modalSub: { margin: '0 0 12px', fontSize: 12, color: '#9ca3af' },
  modalHint: { fontSize: 12, color: '#6b7280', marginBottom: 12 },
  formField: { marginBottom: 10 },
  fieldLabel: { display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 },
  fieldInput: {
    width: '100%',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: 4,
    color: '#f9fafb',
    padding: '7px 10px',
    fontSize: 13,
    boxSizing: 'border-box' as const,
  },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  cancelBtn: {
    padding: '7px 16px',
    background: 'transparent',
    border: '1px solid #4b5563',
    borderRadius: 6,
    color: '#9ca3af',
    fontSize: 13,
    cursor: 'pointer',
  },
  runBtn: {
    padding: '7px 16px',
    background: '#2563eb',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
}
