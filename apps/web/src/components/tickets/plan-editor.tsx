'use client'

/**
 * Plan Editor — Deep Work Planning Phase
 *
 * Displays an agent-generated plan as an editable step list.
 * User can: reorder, remove, add, modify steps.
 * "Approve & Execute" starts autonomous execution of the approved plan.
 * Plan stored in ticket.metadata.plan JSONB.
 */

import { useState } from 'react'
import type { PlanStep, ExecutionPlan } from '../../server/services/task-runner/mode-router'

interface PlanEditorProps {
  plan: ExecutionPlan
  ticketTitle: string
  onApprove: (plan: ExecutionPlan) => void
  onCancel: () => void
  isExecuting?: boolean
}

const STATUS_COLORS: Record<PlanStep['status'], string> = {
  pending: '#6b7280',
  in_progress: '#3b82f6',
  done: '#22c55e',
  skipped: '#9ca3af',
}

const STATUS_LABELS: Record<PlanStep['status'], string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  done: 'Done',
  skipped: 'Skipped',
}

function formatMs(ms?: number): string {
  if (!ms) return '—'
  if (ms < 60_000) return `~${Math.round(ms / 1000)}s`
  return `~${Math.round(ms / 60_000)}m`
}

interface StepRowProps {
  step: PlanStep
  index: number
  total: number
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  onEdit: (updated: Partial<PlanStep>) => void
  isExecuting: boolean
}

function StepRow({ step, index, total, onMoveUp, onMoveDown, onRemove, onEdit, isExecuting }: StepRowProps) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(step.title)
  const [description, setDescription] = useState(step.description)
  const [estimatedMs, setEstimatedMs] = useState(String(step.estimatedMs ?? ''))

  function handleSave() {
    onEdit({
      title,
      description,
      estimatedMs: estimatedMs ? Number(estimatedMs) : undefined,
    })
    setEditing(false)
  }

  const isActive = step.status === 'in_progress'
  const isDone = step.status === 'done'
  const isSkipped = step.status === 'skipped'

  return (
    <div style={{
      ...styles.stepRow,
      opacity: isSkipped ? 0.5 : 1,
      borderLeft: `3px solid ${STATUS_COLORS[step.status]}`,
    }}>
      <div style={styles.stepHeader}>
        <div style={styles.stepLeft}>
          <span style={styles.stepIndex}>{index + 1}</span>
          {isActive && <span style={styles.spinnerDot} />}
          {isDone && <span style={styles.doneCheck}>✓</span>}
        </div>

        {editing ? (
          <div style={styles.editForm}>
            <input
              style={styles.editInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Step title"
            />
            <textarea
              style={styles.editTextarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              rows={2}
            />
            <input
              style={styles.editInput}
              value={estimatedMs}
              onChange={(e) => setEstimatedMs(e.target.value)}
              placeholder="Estimated ms (e.g. 30000)"
              type="number"
            />
            <div style={styles.editActions}>
              <button style={styles.btnSave} onClick={handleSave}>Save</button>
              <button style={styles.btnCancel} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={styles.stepContent}>
            <span style={styles.stepTitle}>{step.title}</span>
            <span style={styles.stepDesc}>{step.description}</span>
            {step.toolsRequired && step.toolsRequired.length > 0 && (
              <div style={styles.toolTags}>
                {step.toolsRequired.map((t) => (
                  <span key={t} style={styles.toolTag}>{t}</span>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={styles.stepMeta}>
          <span style={{ ...styles.statusBadge, color: STATUS_COLORS[step.status] }}>
            {STATUS_LABELS[step.status]}
          </span>
          <span style={styles.estimateLabel}>{formatMs(step.estimatedMs)}</span>
        </div>

        {!isExecuting && !isDone && (
          <div style={styles.stepActions}>
            <button style={styles.iconBtn} onClick={onMoveUp} disabled={index === 0} title="Move up">↑</button>
            <button style={styles.iconBtn} onClick={onMoveDown} disabled={index === total - 1} title="Move down">↓</button>
            <button style={styles.iconBtn} onClick={() => setEditing(!editing)} title="Edit">✎</button>
            <button style={{ ...styles.iconBtn, color: '#ef4444' }} onClick={onRemove} title="Remove">✕</button>
          </div>
        )}
      </div>
    </div>
  )
}

export function PlanEditor({ plan, ticketTitle, onApprove, onCancel, isExecuting = false }: PlanEditorProps) {
  const [steps, setSteps] = useState<PlanStep[]>(plan.steps)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')

  function moveUp(index: number) {
    if (index === 0) return
    const next = [...steps]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    setSteps(reindex(next))
  }

  function moveDown(index: number) {
    if (index === steps.length - 1) return
    const next = [...steps]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    setSteps(reindex(next))
  }

  function removeStep(index: number) {
    setSteps(reindex(steps.filter((_, i) => i !== index)))
  }

  function editStep(index: number, updated: Partial<PlanStep>) {
    setSteps(steps.map((s, i) => (i === index ? { ...s, ...updated } : s)))
  }

  function addStep() {
    if (!newTitle.trim()) return
    const newStep: PlanStep = {
      index: steps.length,
      title: newTitle.trim(),
      description: newDesc.trim(),
      status: 'pending',
    }
    setSteps([...steps, newStep])
    setNewTitle('')
    setNewDesc('')
    setShowAddForm(false)
  }

  function reindex(arr: PlanStep[]): PlanStep[] {
    return arr.map((s, i) => ({ ...s, index: i }))
  }

  function handleApprove() {
    const totalEstimatedMs = steps.reduce((acc, s) => acc + (s.estimatedMs ?? 0), 0)
    onApprove({
      ...plan,
      steps,
      totalEstimatedMs,
      approvedAt: new Date(),
    })
  }

  const totalMs = steps.reduce((acc, s) => acc + (s.estimatedMs ?? 0), 0)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>🧠 Deep Work Plan</h2>
          <p style={styles.subtitle}>{ticketTitle}</p>
        </div>
        <div style={styles.headerMeta}>
          <span style={styles.metaChip}>{steps.length} steps</span>
          <span style={styles.metaChip}>{formatMs(totalMs)} total</span>
        </div>
      </div>

      <p style={styles.hint}>
        Review and edit the plan below. You can reorder, modify, add, or remove steps.
        Once approved, execution begins autonomously with check-ins every 5 steps.
      </p>

      <div style={styles.stepList}>
        {steps.map((step, i) => (
          <StepRow
            key={`${step.index}-${step.title}`}
            step={step}
            index={i}
            total={steps.length}
            onMoveUp={() => moveUp(i)}
            onMoveDown={() => moveDown(i)}
            onRemove={() => removeStep(i)}
            onEdit={(upd) => editStep(i, upd)}
            isExecuting={isExecuting}
          />
        ))}
      </div>

      {!isExecuting && (
        showAddForm ? (
          <div style={styles.addForm}>
            <input
              style={styles.editInput}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Step title"
              autoFocus
            />
            <textarea
              style={styles.editTextarea}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
            />
            <div style={styles.editActions}>
              <button style={styles.btnSave} onClick={addStep}>Add Step</button>
              <button style={styles.btnCancel} onClick={() => setShowAddForm(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button style={styles.addBtn} onClick={() => setShowAddForm(true)}>
            + Add Step
          </button>
        )
      )}

      <div style={styles.footer}>
        <button style={styles.cancelBtn} onClick={onCancel} disabled={isExecuting}>
          Cancel
        </button>
        <button
          style={{ ...styles.approveBtn, opacity: isExecuting ? 0.6 : 1 }}
          onClick={handleApprove}
          disabled={isExecuting || steps.length === 0}
        >
          {isExecuting ? 'Executing…' : 'Approve & Execute'}
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: {
    background: '#111827',
    borderRadius: 10,
    padding: '24px',
    color: '#f9fafb',
    fontFamily: 'sans-serif',
    maxWidth: 720,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  title: { margin: 0, fontSize: 18, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#9ca3af' },
  headerMeta: { display: 'flex', gap: 8, marginTop: 4 },
  metaChip: {
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: 12,
    padding: '2px 10px',
    fontSize: 12,
    color: '#d1d5db',
  },
  hint: { fontSize: 12, color: '#6b7280', marginBottom: 20 },
  stepList: { display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 12 },
  stepRow: {
    background: '#1f2937',
    borderRadius: 6,
    padding: '12px 14px',
    borderLeft: '3px solid #6b7280',
  },
  stepHeader: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  stepLeft: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 24 },
  stepIndex: { fontSize: 12, color: '#6b7280', fontWeight: 600 },
  spinnerDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#3b82f6',
  },
  doneCheck: { fontSize: 13, color: '#22c55e' },
  stepContent: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 2 },
  stepTitle: { fontSize: 13, fontWeight: 600, color: '#f9fafb' },
  stepDesc: { fontSize: 12, color: '#9ca3af' },
  toolTags: { display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginTop: 4 },
  toolTag: {
    background: '#374151',
    borderRadius: 4,
    padding: '1px 6px',
    fontSize: 10,
    color: '#93c5fd',
    fontFamily: 'monospace',
  },
  stepMeta: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    gap: 2,
    minWidth: 80,
  },
  statusBadge: { fontSize: 11, fontWeight: 600 },
  estimateLabel: { fontSize: 11, color: '#6b7280' },
  stepActions: { display: 'flex', gap: 2, marginLeft: 4 },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    fontSize: 13,
    padding: '2px 4px',
    borderRadius: 3,
  },
  editForm: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 6 },
  editInput: {
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: 4,
    color: '#f9fafb',
    padding: '6px 8px',
    fontSize: 12,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  editTextarea: {
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: 4,
    color: '#f9fafb',
    padding: '6px 8px',
    fontSize: 12,
    resize: 'vertical' as const,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  editActions: { display: 'flex', gap: 6 },
  btnSave: {
    padding: '4px 12px',
    background: '#2563eb',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
  },
  btnCancel: {
    padding: '4px 12px',
    background: 'transparent',
    border: '1px solid #4b5563',
    borderRadius: 4,
    color: '#9ca3af',
    fontSize: 12,
    cursor: 'pointer',
  },
  addForm: {
    background: '#1f2937',
    borderRadius: 6,
    padding: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    marginBottom: 12,
  },
  addBtn: {
    background: 'transparent',
    border: '1px dashed #4b5563',
    borderRadius: 6,
    color: '#6b7280',
    fontSize: 12,
    padding: '8px',
    cursor: 'pointer',
    width: '100%',
    marginBottom: 16,
  },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  cancelBtn: {
    padding: '8px 20px',
    background: 'transparent',
    border: '1px solid #4b5563',
    borderRadius: 6,
    color: '#9ca3af',
    fontSize: 13,
    cursor: 'pointer',
  },
  approveBtn: {
    padding: '8px 20px',
    background: '#2563eb',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
}
