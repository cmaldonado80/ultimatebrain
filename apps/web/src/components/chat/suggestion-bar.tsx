'use client'

/**
 * Suggestion Bar — contextual next-action suggestions after final answer.
 * Rule-based, deterministic. No AI generation.
 */

interface SuggestionBarProps {
  hadError: boolean
  hadTools: boolean
  agentCount: number
  agentName: string
  finalAnswerText: string
  onAction: (action: string, payload?: Record<string, unknown>) => void
}

interface Suggestion {
  id: string
  label: string
  icon: string
  action: string
  variant?: 'primary' | 'secondary'
}

function buildSuggestions(props: SuggestionBarProps): Suggestion[] {
  const suggestions: Suggestion[] = []

  // Error recovery
  if (props.hadError) {
    suggestions.push({
      id: 'retry-error',
      label: 'Retry (error occurred)',
      icon: '↻',
      action: 'retry',
      variant: 'primary',
    })
  }

  // Single agent → suggest second opinion
  if (props.agentCount <= 1) {
    suggestions.push({
      id: 'second-opinion',
      label: 'Get second opinion',
      icon: '🔍',
      action: 'second_opinion',
    })
  }

  // Multi-agent → suggest comparing
  if (props.agentCount > 1) {
    suggestions.push({
      id: 'compare',
      label: 'Compare agent outputs',
      icon: '⇄',
      action: 'compare',
    })
  }

  // Tools were used → suggest retry with different approach
  if (props.hadTools) {
    suggestions.push({
      id: 'different-approach',
      label: 'Try different approach',
      icon: '⚡',
      action: 'retry_different',
    })
  }

  // Always available
  suggestions.push({
    id: 'copy-answer',
    label: 'Copy answer',
    icon: '📋',
    action: 'copy',
  })

  suggestions.push({
    id: 'follow-up',
    label: 'Follow up',
    icon: '→',
    action: 'follow_up',
    variant: 'primary',
  })

  return suggestions.slice(0, 4) // Max 4 suggestions
}

export function SuggestionBar(props: SuggestionBarProps) {
  const suggestions = buildSuggestions(props)

  if (suggestions.length === 0) return null

  return (
    <div className="max-w-3xl mx-auto mt-2 mb-4">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-elevated/50 border border-border-dim">
        <span className="text-[10px] text-slate-600 uppercase tracking-wider font-mono mr-1">
          Next
        </span>
        {suggestions.map((s) => (
          <button
            key={s.id}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
              s.variant === 'primary'
                ? 'bg-neon-teal/10 text-neon-teal border border-neon-teal/20 hover:bg-neon-teal/20'
                : 'bg-bg-card text-slate-400 border border-border-dim hover:bg-white/5 hover:text-slate-200'
            }`}
            onClick={() => props.onAction(s.action)}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
