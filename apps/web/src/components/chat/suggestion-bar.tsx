'use client'

/**
 * Suggestion Bar — contextual next-action suggestions after final answer.
 * V9: Includes autonomy level toggle (Manual/Assist/Auto).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────

type AutonomyLevel = 'manual' | 'assist' | 'auto'

interface SuggestionBarProps {
  hadError: boolean
  hadTools: boolean
  agentCount: number
  agentName: string
  finalAnswerText: string
  onAction: (action: string, payload?: Record<string, unknown>) => void
  decisionMode?: string
  onDecisionModeChange?: (mode: string) => void
}

interface Suggestion {
  id: string
  label: string
  icon: string
  action: string
  variant?: 'primary' | 'secondary'
  lowRisk?: boolean // Can auto-execute in Assist mode
}

// ── Suggestion Builder ─────────────────────────────────────────────────

function buildSuggestions(props: SuggestionBarProps): Suggestion[] {
  const suggestions: Suggestion[] = []

  if (props.hadError) {
    suggestions.push({
      id: 'retry-error',
      label: 'Retry (error occurred)',
      icon: '↻',
      action: 'retry',
      variant: 'primary',
    })
  }

  if (props.agentCount <= 1) {
    suggestions.push({
      id: 'second-opinion',
      label: 'Get second opinion',
      icon: '🔍',
      action: 'second_opinion',
    })
  }

  if (props.agentCount > 1) {
    suggestions.push({
      id: 'compare',
      label: 'Compare agent outputs',
      icon: '⇄',
      action: 'compare',
    })
  }

  if (props.hadTools) {
    suggestions.push({
      id: 'different-approach',
      label: 'Try different approach',
      icon: '⚡',
      action: 'retry_different',
    })
  }

  suggestions.push({
    id: 'copy-answer',
    label: 'Copy answer',
    icon: '📋',
    action: 'copy',
    lowRisk: true,
  })

  suggestions.push({
    id: 'follow-up',
    label: 'Follow up',
    icon: '→',
    action: 'follow_up',
    variant: 'primary',
    lowRisk: true,
  })

  return suggestions.slice(0, 4)
}

// ── Autonomy Level Labels ──────────────────────────────────────────────

const LEVEL_LABELS: Record<AutonomyLevel, { label: string; color: string }> = {
  manual: { label: 'Manual', color: 'text-slate-400' },
  assist: { label: 'Assist', color: 'text-neon-yellow' },
  auto: { label: 'Auto', color: 'text-neon-green' },
}

const LEVELS: AutonomyLevel[] = ['manual', 'assist', 'auto']

// ── Component ──────────────────────────────────────────────────────────

export function SuggestionBar(props: SuggestionBarProps) {
  const suggestions = buildSuggestions(props)
  const [level, setLevel] = useState<AutonomyLevel>('manual')
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null)
  const [autoAction, setAutoAction] = useState<string | null>(null)

  // Load persisted level
  useEffect(() => {
    const saved = localStorage.getItem('autonomy-level') as AutonomyLevel | null
    if (saved && LEVELS.includes(saved)) setLevel(saved)
  }, [])

  const changeLevel = useCallback((newLevel: AutonomyLevel) => {
    setLevel(newLevel)
    localStorage.setItem('autonomy-level', newLevel)
  }, [])

  // Auto mode: start countdown for first primary suggestion
  useEffect(() => {
    if (level !== 'auto' || suggestions.length === 0) return
    const firstAction = suggestions[0]
    if (!firstAction) return

    setAutoAction(firstAction.action)
    setAutoCountdown(3)

    const interval = setInterval(() => {
      setAutoCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval)
          props.onAction(firstAction.action)
          setAutoCountdown(null)
          setAutoAction(null)
          return null
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      clearInterval(interval)
      setAutoCountdown(null)
      setAutoAction(null)
    }
  }, [level, suggestions.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Assist mode: auto-execute low-risk actions once (not on every render)
  const assistExecutedRef = useRef(false)
  useEffect(() => {
    if (level !== 'assist') {
      assistExecutedRef.current = false
      return
    }
    if (assistExecutedRef.current) return
    const lowRisk = suggestions.filter((s) => s.lowRisk)
    if (lowRisk.length > 0 && lowRisk[0].action === 'copy') {
      assistExecutedRef.current = true
      props.onAction('copy')
    }
  }, [level]) // eslint-disable-line react-hooks/exhaustive-deps

  if (suggestions.length === 0) return null

  const levelStyle = LEVEL_LABELS[level]

  return (
    <div className="max-w-3xl mx-auto mt-2 mb-4">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-elevated/50 border border-border-dim">
        {/* Autonomy level toggle */}
        <select
          className="text-[10px] bg-transparent border border-border-dim rounded px-1.5 py-0.5 cursor-pointer font-mono uppercase tracking-wider"
          style={{
            color:
              levelStyle.color === 'text-slate-400'
                ? '#94a3b8'
                : levelStyle.color === 'text-neon-yellow'
                  ? '#ffd200'
                  : '#00ff88',
          }}
          value={level}
          onChange={(e) => changeLevel(e.target.value as AutonomyLevel)}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABELS[l].label}
            </option>
          ))}
        </select>

        {/* Decision mode selector */}
        {props.onDecisionModeChange && (
          <select
            className="text-[10px] bg-transparent border border-border-dim rounded px-1.5 py-0.5 cursor-pointer font-mono uppercase tracking-wider"
            style={{
              color:
                props.decisionMode === 'quality'
                  ? '#00d4ff'
                  : props.decisionMode === 'speed'
                    ? '#00ff88'
                    : props.decisionMode === 'stability'
                      ? '#00d4ff'
                      : props.decisionMode === 'simplicity'
                        ? '#ffd200'
                        : '#94a3b8',
            }}
            value={props.decisionMode ?? 'balanced'}
            onChange={(e) => props.onDecisionModeChange!(e.target.value)}
          >
            <option value="balanced">Balanced</option>
            <option value="quality">Quality</option>
            <option value="speed">Speed</option>
            <option value="stability">Stability</option>
            <option value="simplicity">Simplicity</option>
          </select>
        )}

        {/* Auto countdown indicator */}
        {autoCountdown !== null && (
          <span className="text-[10px] text-neon-green animate-pulse font-mono">
            Auto in {autoCountdown}s
            <button
              className="ml-1 text-slate-500 hover:text-neon-red"
              onClick={() => {
                setAutoCountdown(null)
                setAutoAction(null)
              }}
            >
              ✕
            </button>
          </span>
        )}

        {/* Suggestion chips */}
        {suggestions.map((s) => (
          <button
            key={s.id}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
              autoAction === s.action
                ? 'bg-neon-green/10 text-neon-green border border-neon-green/30 ring-1 ring-neon-green/20'
                : s.variant === 'primary'
                  ? 'bg-neon-teal/10 text-neon-teal border border-neon-teal/20 hover:bg-neon-teal/20'
                  : 'bg-bg-card text-slate-400 border border-border-dim hover:bg-white/5 hover:text-slate-200'
            }`}
            onClick={() => {
              setAutoCountdown(null)
              setAutoAction(null)
              props.onAction(s.action)
            }}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
