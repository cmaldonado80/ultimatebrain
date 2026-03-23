'use client'

/**
 * Mode Selector
 *
 * Displayed when creating or editing a ticket.
 * Auto-suggests a mode based on complexity, allows override.
 * Visual indicators: ⚡ quick, ⚙️ autonomous, 🧠 deep work
 *
 * Also handles /quick, /auto, /deep slash command detection in chat.
 */

import type { ExecutionMode, TicketComplexity } from '../../server/services/task-runner/mode-router'

interface ModeSelectorProps {
  value: ExecutionMode
  onChange: (mode: ExecutionMode) => void
  complexity?: TicketComplexity
  /** If true, show compact inline version for chat */
  compact?: boolean
  disabled?: boolean
}

interface ModeOption {
  mode: ExecutionMode
  icon: string
  label: string
  description: string
  badge?: string
  badgeColor?: string
}

const MODES: ModeOption[] = [
  {
    mode: 'quick',
    icon: '⚡',
    label: 'Quick',
    description: 'Single LLM call. No tools, no receipt. Under 60s.',
    badge: '< 60s',
    badgeColor: '#22c55e',
  },
  {
    mode: 'autonomous',
    icon: '⚙️',
    label: 'Autonomous',
    description: 'Full pipeline: guardrails → tools → receipt → checkpoint.',
    badge: 'Default',
    badgeColor: '#3b82f6',
  },
  {
    mode: 'deep_work',
    icon: '🧠',
    label: 'Deep Work',
    description: 'Agent generates a plan. You approve. Then full autonomous execution with check-ins.',
    badge: 'Multi-step',
    badgeColor: '#a855f7',
  },
]

/** Suggest a mode based on ticket complexity */
export function suggestMode(complexity: TicketComplexity): ExecutionMode {
  if (complexity === 'easy') return 'quick'
  if (complexity === 'critical') return 'deep_work'
  return 'autonomous'
}

/** Parse slash command from chat input: /quick, /auto, /deep */
export function parseSlashCommand(input: string): ExecutionMode | null {
  const trimmed = input.trim().toLowerCase()
  if (trimmed === '/quick') return 'quick'
  if (trimmed === '/auto' || trimmed === '/autonomous') return 'autonomous'
  if (trimmed === '/deep' || trimmed === '/deep_work') return 'deep_work'
  return null
}

export function ModeSelector({ value, onChange, complexity, compact = false, disabled = false }: ModeSelectorProps) {
  const suggested = complexity ? suggestMode(complexity) : null

  if (compact) {
    return (
      <div style={styles.compactRow}>
        {MODES.map((opt) => (
          <button
            key={opt.mode}
            style={{
              ...styles.compactBtn,
              ...(value === opt.mode ? styles.compactBtnActive : {}),
            }}
            onClick={() => onChange(opt.mode)}
            disabled={disabled}
            title={opt.description}
          >
            {opt.icon} {opt.label}
            {suggested === opt.mode && value !== opt.mode && (
              <span style={styles.suggestedDot} title="Suggested" />
            )}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <span style={styles.label}>Execution Mode</span>
        {suggested && (
          <span style={styles.suggestedHint}>
            Suggested: <strong>{MODES.find((m) => m.mode === suggested)?.label}</strong>
          </span>
        )}
      </div>

      <div style={styles.optionsGrid}>
        {MODES.map((opt) => {
          const isSelected = value === opt.mode
          const isSuggested = suggested === opt.mode

          return (
            <button
              key={opt.mode}
              style={{
                ...styles.option,
                ...(isSelected ? styles.optionSelected : {}),
                ...(disabled ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
              }}
              onClick={() => !disabled && onChange(opt.mode)}
              disabled={disabled}
            >
              <div style={styles.optionHeader}>
                <span style={styles.optionIcon}>{opt.icon}</span>
                <span style={styles.optionLabel}>{opt.label}</span>
                <div style={styles.badges}>
                  {isSuggested && (
                    <span style={{ ...styles.badge, background: '#374151', color: '#9ca3af' }}>
                      Suggested
                    </span>
                  )}
                  {opt.badge && (
                    <span style={{ ...styles.badge, color: opt.badgeColor }}>
                      {opt.badge}
                    </span>
                  )}
                </div>
              </div>
              <p style={styles.optionDesc}>{opt.description}</p>
            </button>
          )
        })}
      </div>

      <p style={styles.hint}>
        Tip: In chat, use <code style={styles.code}>/quick</code>,{' '}
        <code style={styles.code}>/auto</code>, or{' '}
        <code style={styles.code}>/deep</code> to switch modes.
      </p>
    </div>
  )
}

const styles = {
  container: {
    fontFamily: 'sans-serif',
    color: '#f9fafb',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  label: { fontSize: 13, fontWeight: 600, color: '#d1d5db' },
  suggestedHint: { fontSize: 11, color: '#9ca3af' },
  optionsGrid: { display: 'flex', gap: 8 },
  option: {
    flex: 1,
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: 8,
    padding: '12px',
    textAlign: 'left' as const,
    cursor: 'pointer',
    color: '#f9fafb',
    transition: 'border-color 0.15s',
  },
  optionSelected: {
    borderColor: '#2563eb',
    background: '#1e3a5f',
  },
  optionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  optionIcon: { fontSize: 16 },
  optionLabel: { fontSize: 13, fontWeight: 700, flex: 1 },
  badges: { display: 'flex', gap: 4 },
  badge: {
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 10,
    border: '1px solid #374151',
    background: 'transparent',
  },
  optionDesc: { fontSize: 11, color: '#9ca3af', margin: 0, lineHeight: 1.4 },
  hint: { fontSize: 11, color: '#6b7280', marginTop: 8 },
  code: {
    background: '#374151',
    borderRadius: 3,
    padding: '1px 4px',
    fontFamily: 'monospace',
    fontSize: 11,
  },

  // Compact
  compactRow: { display: 'flex', gap: 4 },
  compactBtn: {
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: 6,
    color: '#9ca3af',
    fontSize: 12,
    padding: '4px 10px',
    cursor: 'pointer',
    position: 'relative' as const,
  },
  compactBtnActive: {
    borderColor: '#2563eb',
    color: '#93c5fd',
    background: '#1e3a5f',
  },
  suggestedDot: {
    position: 'absolute' as const,
    top: 3,
    right: 3,
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: '#22c55e',
  },
}
