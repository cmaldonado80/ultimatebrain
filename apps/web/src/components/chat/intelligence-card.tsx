'use client'

/**
 * Intelligence Card — evidence-based workflow recommendations.
 * Shows pre-run intelligence: best workflow, autonomy mode, memory impact.
 * Every recommendation includes confidence score and explainable evidence.
 */

import { useEffect, useState } from 'react'

import { trpc } from '../../utils/trpc'

// ── Types (mirrored from recommendation-engine) ───────────────────────

interface RecommendationAction {
  type: string
  label: string
  payload: Record<string, unknown>
}

interface Recommendation {
  id: string
  type: string
  label: string
  explanation: string
  confidence: number
  evidence: {
    basedOnRunIds: string[]
    sampleSize: number
    successRate?: number
    avgDurationMs?: number
    metricDelta?: string
  }
  action?: RecommendationAction
}

// ── Confidence Badge ──────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color =
    value >= 0.7
      ? 'text-neon-green bg-neon-green/10'
      : value >= 0.4
        ? 'text-neon-yellow bg-neon-yellow/10'
        : 'text-slate-400 bg-slate-700/50'
  return <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${color}`}>{pct}%</span>
}

// ── Type Icons ────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, string> = {
  workflow: '◆',
  autonomy: '⚡',
  memory: '◈',
  retry_strategy: '↻',
  execution_pattern: '▸',
}

// ── Component ─────────────────────────────────────────────────────────

interface IntelligenceCardProps {
  sessionId: string
  userInput?: string
  agentIds?: string[]
  onAction: (action: RecommendationAction) => void
  onDismiss: () => void
}

export function IntelligenceCard({
  sessionId,
  userInput,
  agentIds,
  onAction,
  onDismiss,
}: IntelligenceCardProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [debouncedInput, setDebouncedInput] = useState(userInput)

  // Debounce input changes
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedInput(userInput), 500)
    return () => clearTimeout(timer)
  }, [userInput])

  const query = trpc.intelligence.getWorkflowIntelligence.useQuery(
    { sessionId, userInput: debouncedInput, agentIds },
    {
      enabled: !!sessionId && (debouncedInput?.length ?? 0) > 5,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  )

  const recommendations = (query.data ?? []).filter((r: Recommendation) => !dismissedIds.has(r.id))

  // Hide entirely if no results or loading
  if (query.isLoading) {
    return (
      <div className="max-w-3xl mx-auto mt-2 mb-2">
        <div className="cyber-card border-neon-purple/10 p-2.5 flex items-center gap-2">
          <span className="neon-dot neon-dot-purple animate-pulse" />
          <span className="text-[10px] text-slate-600">Analyzing similar runs...</span>
        </div>
      </div>
    )
  }

  if (recommendations.length === 0) return null

  return (
    <div className="max-w-3xl mx-auto mt-2 mb-2">
      <div className="cyber-card border-neon-purple/20 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-dim">
          <span className="text-[10px] font-orbitron text-neon-purple uppercase tracking-wider">
            Intelligence
          </span>
          <button
            onClick={onDismiss}
            className="text-slate-600 hover:text-slate-300 text-[10px] transition-colors"
          >
            Dismiss
          </button>
        </div>

        {/* Recommendations */}
        <div className="p-2 space-y-1.5">
          {recommendations.map((rec: Recommendation) => (
            <div
              key={rec.id}
              className="group flex items-start gap-2 p-2 rounded hover:bg-white/[0.02] transition-colors"
            >
              {/* Icon */}
              <span className="text-[11px] text-neon-purple mt-0.5 flex-shrink-0">
                {TYPE_ICON[rec.type] ?? '◆'}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] text-slate-300 font-medium truncate">
                    {rec.label}
                  </span>
                  <ConfidenceBadge value={rec.confidence} />
                  {/* Per-item dismiss */}
                  <button
                    onClick={() => setDismissedIds((prev) => new Set([...prev, rec.id]))}
                    className="text-[9px] text-slate-700 hover:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity ml-auto flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 truncate">{rec.explanation}</div>

                {/* Actions */}
                {rec.action && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      onClick={() => onAction(rec.action!)}
                      className="text-[9px] px-2 py-0.5 rounded bg-neon-purple/10 text-neon-purple hover:bg-neon-purple/20 transition-colors"
                    >
                      {rec.action.label}
                    </button>
                    <button
                      onClick={() =>
                        onAction({
                          type: 'inspect_evidence',
                          label: 'View Evidence',
                          payload: {
                            runIds: rec.evidence.basedOnRunIds,
                            type: rec.type,
                          },
                        })
                      }
                      className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors"
                    >
                      Why?
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
