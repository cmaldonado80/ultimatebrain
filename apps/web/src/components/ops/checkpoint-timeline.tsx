'use client'

/**
 * Checkpoint Timeline Component
 *
 * Horizontal scrollable timeline with color-coded dots per checkpoint trigger:
 * - green:  status_change, approval_decision
 * - blue:   llm_call
 * - orange: tool_invocation, dag_step
 * - red:    receipt_action
 * - gray:   manual / other
 *
 * Click a dot to see the full state diff from the previous checkpoint.
 * "Replay from here" opens a modal with a parameter editor.
 */

import { useState, memo } from 'react'
import type { CheckpointTimelineEntry } from '../../server/services/checkpointing/time-travel'

interface CheckpointTimelineProps {
  entityType: string
  entityId: string
  checkpoints: CheckpointTimelineEntry[]
  onReplay?: (checkpointId: string, overrides: Record<string, unknown>) => void
  onDiff?: (checkpointAId: string, checkpointBId: string) => void
}

const DOT_COLORS: Record<CheckpointTimelineEntry['dotColor'], string> = {
  green: '#22c55e',
  blue: '#3b82f6',
  orange: '#f97316',
  red: '#ef4444',
  gray: '#6b7280',
}

const TRIGGER_LABELS: Record<string, string> = {
  status_change: 'Status Change',
  llm_call: 'LLM Call',
  tool_invocation: 'Tool',
  approval_decision: 'Approval',
  dag_step: 'DAG Step',
  receipt_action: 'Receipt',
  manual: 'Manual',
}

interface ReplayModalProps {
  checkpoint: CheckpointTimelineEntry
  onConfirm: (overrides: Record<string, unknown>) => void
  onClose: () => void
}

const ReplayModal = memo(function ReplayModal({ checkpoint, onConfirm, onClose }: ReplayModalProps) {
  const [overridesText, setOverridesText] = useState('{}')
  const [parseError, setParseError] = useState<string | null>(null)

  function handleConfirm() {
    try {
      const overrides = JSON.parse(overridesText)
      setParseError(null)
      onConfirm(overrides)
    } catch (_parseErr) {
      setParseError('Invalid JSON — please fix before replaying')
    }
  }

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <h3 style={styles.modalTitle}>Replay from Step {checkpoint.stepIndex}</h3>
        <p style={styles.modalSubtitle}>
          Trigger: <strong>{TRIGGER_LABELS[checkpoint.trigger] ?? checkpoint.trigger}</strong>
          {checkpoint.label && <> · {checkpoint.label}</>}
        </p>
        <p style={styles.modalHint}>
          Optionally override state fields before replaying. This creates a new execution branch
          and never modifies history.
        </p>
        <label style={styles.label}>Parameter Overrides (JSON)</label>
        <textarea
          style={styles.textarea}
          value={overridesText}
          onChange={(e) => setOverridesText(e.target.value)}
          rows={6}
          placeholder='{}'
        />
        {parseError && <p style={styles.error}>{parseError}</p>}
        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button style={styles.confirmBtn} onClick={handleConfirm}>
            Replay from Here
          </button>
        </div>
      </div>
    </div>
  )
})

interface CheckpointTooltipProps {
  checkpoint: CheckpointTimelineEntry
  index: number
  total: number
  onViewDiff: () => void
  onReplay: () => void
}

const CheckpointTooltip = memo(function CheckpointTooltip({ checkpoint, index, total: _total, onViewDiff, onReplay }: CheckpointTooltipProps) {
  return (
    <div style={styles.tooltip}>
      <div style={styles.tooltipHeader}>
        <span style={styles.tooltipTrigger}>
          {TRIGGER_LABELS[checkpoint.trigger] ?? checkpoint.trigger}
        </span>
        <span style={styles.tooltipStep}>Step {checkpoint.stepIndex}</span>
      </div>
      {checkpoint.label && <p style={styles.tooltipLabel}>{checkpoint.label}</p>}
      <p style={styles.tooltipTime}>{checkpoint.createdAt.toLocaleString()}</p>
      {checkpoint.agentId && (
        <p style={styles.tooltipMeta}>Agent: {checkpoint.agentId.slice(0, 8)}…</p>
      )}
      {checkpoint.traceId && (
        <p style={styles.tooltipMeta}>Trace: {checkpoint.traceId.slice(0, 8)}…</p>
      )}
      <div style={styles.tooltipActions}>
        {index > 0 && (
          <button style={styles.tooltipBtn} onClick={onViewDiff}>
            View Diff
          </button>
        )}
        <button style={styles.tooltipBtnPrimary} onClick={onReplay}>
          Replay from here
        </button>
      </div>
    </div>
  )
})

export function CheckpointTimeline({
  entityType,
  entityId,
  checkpoints,
  onReplay,
  onDiff,
}: CheckpointTimelineProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [replayTarget, setReplayTarget] = useState<CheckpointTimelineEntry | null>(null)

  if (checkpoints.length === 0) {
    return (
      <div style={styles.empty}>
        No checkpoints recorded yet for {entityType} {entityId.slice(0, 8)}…
      </div>
    )
  }

  const hovered = checkpoints.find((c) => c.id === hoveredId) ?? null
  const hoveredIndex = hovered ? checkpoints.indexOf(hovered) : -1
  const prevCheckpoint = hoveredIndex > 0 ? checkpoints[hoveredIndex - 1] : null

  function handleReplayConfirm(overrides: Record<string, unknown>) {
    if (replayTarget && onReplay) {
      onReplay(replayTarget.id, overrides)
    }
    setReplayTarget(null)
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Checkpoint Timeline</span>
        <span style={styles.headerCount}>{checkpoints.length} checkpoints</span>
      </div>

      <div style={styles.scrollWrapper}>
        {/* Connecting line */}
        <div style={styles.line} />

        {/* Dots */}
        <div style={styles.dotsRow}>
          {checkpoints.map((cp, i) => (
            <div
              key={cp.id}
              style={styles.dotWrapper}
              onMouseEnter={() => setHoveredId(cp.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div
                style={{
                  ...styles.dot,
                  backgroundColor: DOT_COLORS[cp.dotColor],
                  transform: hoveredId === cp.id ? 'scale(1.5)' : 'scale(1)',
                }}
              />
              <span style={styles.stepLabel}>{cp.stepIndex}</span>

              {hoveredId === cp.id && (
                <CheckpointTooltip
                  checkpoint={cp}
                  index={i}
                  total={checkpoints.length}
                  onViewDiff={() => prevCheckpoint && onDiff?.(prevCheckpoint.id, cp.id)}
                  onReplay={() => setReplayTarget(cp)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        {Object.entries(DOT_COLORS).map(([color, hex]) => (
          <div key={color} style={styles.legendItem}>
            <div style={{ ...styles.legendDot, backgroundColor: hex }} />
            <span style={styles.legendLabel}>
              {color === 'green' && 'Status / Approval'}
              {color === 'blue' && 'LLM Call'}
              {color === 'orange' && 'Tool / DAG'}
              {color === 'red' && 'Receipt'}
              {color === 'gray' && 'Manual'}
            </span>
          </div>
        ))}
      </div>

      {replayTarget && (
        <ReplayModal
          checkpoint={replayTarget}
          onConfirm={handleReplayConfirm}
          onClose={() => setReplayTarget(null)}
        />
      )}
    </div>
  )
}

const styles = {
  container: {
    fontFamily: 'sans-serif',
    background: '#111827',
    borderRadius: 8,
    padding: '16px 20px',
    color: '#f9fafb',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: { fontWeight: 600, fontSize: 14 },
  headerCount: { fontSize: 12, color: '#9ca3af' },
  scrollWrapper: {
    overflowX: 'auto' as const,
    position: 'relative' as const,
    paddingBottom: 24,
  },
  line: {
    position: 'absolute' as const,
    top: 12,
    left: 0,
    right: 0,
    height: 2,
    background: '#374151',
  },
  dotsRow: {
    display: 'flex',
    gap: 32,
    position: 'relative' as const,
    paddingTop: 4,
    minWidth: 'max-content',
  },
  dotWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    position: 'relative' as const,
    cursor: 'pointer',
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: '2px solid #1f2937',
    transition: 'transform 0.15s ease',
    zIndex: 1,
  },
  stepLabel: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
  },
  legend: {
    display: 'flex',
    gap: 16,
    marginTop: 12,
    flexWrap: 'wrap' as const,
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: '50%' },
  legendLabel: { fontSize: 11, color: '#9ca3af' },
  empty: { color: '#6b7280', fontSize: 13, padding: '12px 0' },

  // Tooltip
  tooltip: {
    position: 'absolute' as const,
    bottom: 32,
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '10px 12px',
    minWidth: 200,
    zIndex: 10,
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  },
  tooltipHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 },
  tooltipTrigger: { fontSize: 12, fontWeight: 600, color: '#f9fafb' },
  tooltipStep: { fontSize: 11, color: '#6b7280' },
  tooltipLabel: { fontSize: 11, color: '#d1d5db', margin: '2px 0' },
  tooltipTime: { fontSize: 11, color: '#9ca3af', margin: '2px 0' },
  tooltipMeta: { fontSize: 10, color: '#6b7280', margin: '1px 0', fontFamily: 'monospace' },
  tooltipActions: { display: 'flex', gap: 6, marginTop: 8 },
  tooltipBtn: {
    fontSize: 11,
    padding: '3px 8px',
    background: 'transparent',
    border: '1px solid #4b5563',
    borderRadius: 4,
    color: '#d1d5db',
    cursor: 'pointer',
  },
  tooltipBtnPrimary: {
    fontSize: 11,
    padding: '3px 8px',
    background: '#2563eb',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    cursor: 'pointer',
  },

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
  modalTitle: { margin: '0 0 4px', fontSize: 16, fontWeight: 600 },
  modalSubtitle: { margin: '0 0 8px', fontSize: 13, color: '#9ca3af' },
  modalHint: { fontSize: 12, color: '#6b7280', margin: '0 0 12px' },
  label: { display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 },
  textarea: {
    width: '100%',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: 4,
    color: '#f9fafb',
    fontFamily: 'monospace',
    fontSize: 12,
    padding: '8px',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  error: { color: '#ef4444', fontSize: 12, margin: '4px 0' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  cancelBtn: {
    padding: '6px 16px',
    background: 'transparent',
    border: '1px solid #4b5563',
    borderRadius: 4,
    color: '#d1d5db',
    cursor: 'pointer',
    fontSize: 13,
  },
  confirmBtn: {
    padding: '6px 16px',
    background: '#2563eb',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
}
