'use client'

/**
 * Intelligence Card — evidence-based workflow recommendations
 * with feedback loop instrumentation.
 *
 * Logs shown/dismissed/clicked events for effectiveness tracking.
 * Shows credibility stats when available ("Helped 7 times").
 */

import { useEffect, useRef, useState } from 'react'

import { trpc } from '../../utils/trpc'

// ── Types (mirrored from recommendation-engine) ───────────────────────

interface RecommendationAction {
  type: string
  label: string
  payload: Record<string, unknown>
}

interface RecommendationStats {
  shown: number
  clicked: number
  improved: number
  recovered: number
  acceptanceRate: number
  improvementRate: number
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
  stats?: RecommendationStats | null
  qualityScore?: number | null
  modeImpact?: {
    delta: number
    summary: string
  } | null
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

// ── Credibility Line ──────────────────────────────────────────────────

function CredibilityLine({ stats }: { stats: RecommendationStats }) {
  if (stats.shown < 3) return null

  const parts: string[] = []
  if (stats.improved > 0)
    parts.push(`Helped ${stats.improved} time${stats.improved !== 1 ? 's' : ''}`)
  else if (stats.clicked > 0)
    parts.push(`Used ${stats.clicked} time${stats.clicked !== 1 ? 's' : ''}`)
  if (stats.recovered > 0) parts.push(`recovered ${stats.recovered}`)
  if (stats.improvementRate > 0 && stats.improved >= 2)
    parts.push(`${Math.round(stats.improvementRate * 100)}% effective`)

  if (parts.length === 0) return null

  return <span className="text-[9px] text-slate-600 ml-1">{parts.join(' · ')}</span>
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
  decisionMode?: string
  onAction: (action: RecommendationAction, eventId?: string) => void
  onDismiss: () => void
}

export function IntelligenceCard({
  sessionId,
  userInput,
  agentIds,
  decisionMode,
  onAction,
  onDismiss,
}: IntelligenceCardProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [debouncedInput, setDebouncedInput] = useState(userInput)
  // Track eventIds per recommendation (for linking runs later)
  const [eventIds, setEventIds] = useState<Map<string, string>>(new Map())
  const loggedRef = useRef<Set<string>>(new Set())

  // Debounce input changes
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedInput(userInput), 500)
    return () => clearTimeout(timer)
  }, [userInput])

  const castMode = decisionMode as
    | 'balanced'
    | 'quality'
    | 'speed'
    | 'stability'
    | 'simplicity'
    | undefined

  const query = trpc.intelligence.getWorkflowIntelligence.useQuery(
    { sessionId, userInput: debouncedInput, agentIds, decisionMode: castMode },
    {
      enabled: !!sessionId && (debouncedInput?.length ?? 0) > 5,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  )

  const pathsQuery = trpc.intelligence.getBestKnownPaths.useQuery(
    { sessionId, userInput: debouncedInput, agentIds, decisionMode: castMode },
    {
      enabled: !!sessionId && (debouncedInput?.length ?? 0) > 5,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  )
  const bestPath = (pathsQuery.data ?? []).find((p) => p.stats.avgQualityScore >= 0.6) ?? null

  // Logging mutations (fire-and-forget)
  const logShown = trpc.intelligence.logRecommendationShown.useMutation()
  const logDismissed = trpc.intelligence.logRecommendationDismissed.useMutation()
  const logAction = trpc.intelligence.logRecommendationAction.useMutation()

  const recommendations = (query.data ?? []).filter((r: Recommendation) => !dismissedIds.has(r.id))

  // Log shown events (once per recommendation per render cycle)
  useEffect(() => {
    for (const rec of recommendations) {
      if (loggedRef.current.has(rec.id)) continue
      loggedRef.current.add(rec.id)

      logShown
        .mutateAsync({
          sessionId,
          recommendationId: rec.id,
          recommendationType: rec.type,
          workflowId:
            rec.action?.payload?.workflowId != null
              ? String(rec.action.payload.workflowId)
              : undefined,
          autonomyLevel:
            rec.action?.payload?.level != null ? String(rec.action.payload.level) : undefined,
          confidence: rec.confidence,
        })
        .then((result) => {
          if (result?.eventId) {
            setEventIds((prev) => new Map([...prev, [rec.id, result.eventId!]]))
          }
        })
        .catch((err) => console.warn('intelligence-card: log recommendation failed', err))
    }
  }, [recommendations.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = (recId: string) => {
    setDismissedIds((prev) => new Set([...prev, recId]))
    const eventId = eventIds.get(recId)
    if (eventId) {
      logDismissed
        .mutateAsync({ eventId })
        .catch((err) => console.warn('intelligence-card: log dismissed failed', err))
    }
  }

  const handleAction = (rec: Recommendation) => {
    if (!rec.action) return
    const eventId = eventIds.get(rec.id)
    if (eventId) {
      logAction
        .mutateAsync({ eventId, actionType: rec.action.type })
        .catch((err) => console.warn('intelligence-card: log action failed', err))
    }
    onAction(rec.action, eventId)
  }

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

  if (recommendations.length === 0 && !bestPath) return null

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

        {/* Best Known Path */}
        {bestPath && (
          <div className="px-3 py-2 border-b border-border-dim">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-orbitron text-neon-green uppercase tracking-wider">
                Best Known Path
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded ${
                  bestPath.stats.avgQualityScore >= 0.7
                    ? 'text-neon-green bg-neon-green/10'
                    : 'text-neon-yellow bg-neon-yellow/10'
                }`}
              >
                {bestPath.stats.avgQualityScore >= 0.7 ? 'high' : 'medium'}
              </span>
              {decisionMode && decisionMode !== 'balanced' && (
                <span className="text-[8px] text-slate-600">for {decisionMode}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1 mb-1">
              {bestPath.agentSequence.map((agent, i) => (
                <span
                  key={i}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-neon-teal/10 text-neon-teal"
                >
                  {agent}
                </span>
              ))}
              {bestPath.toolSequence.length > 0 && (
                <span className="text-[9px] text-slate-600">→</span>
              )}
              {bestPath.toolSequence.slice(0, 3).map((tool, i) => (
                <span
                  key={i}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400"
                >
                  {tool}
                </span>
              ))}
              {bestPath.toolSequence.length > 3 && (
                <span className="text-[9px] text-slate-600">
                  +{bestPath.toolSequence.length - 3}
                </span>
              )}
            </div>
            <div className="text-[9px] text-slate-500">
              {bestPath.stats.totalRuns} run{bestPath.stats.totalRuns !== 1 ? 's' : ''} ·{' '}
              {Math.round(bestPath.stats.successRate * 100)}% success ·{' '}
              {Math.round(bestPath.stats.avgQualityScore * 100)}% quality
              {bestPath.stats.avgDurationMs != null &&
                ` · ${(bestPath.stats.avgDurationMs / 1000).toFixed(1)}s avg`}
            </div>
            {/* Tradeoff indicators */}
            {bestPath.tradeoff && (
              <div className="flex items-center gap-2 mt-1">
                {bestPath.tradeoff.quality >= 0.7 && (
                  <span className="text-[8px] text-neon-green">↑ quality</span>
                )}
                {bestPath.tradeoff.speed >= 0.7 && (
                  <span className="text-[8px] text-neon-blue">↑ speed</span>
                )}
                {bestPath.tradeoff.stability >= 0.7 && (
                  <span className="text-[8px] text-neon-teal">↑ stable</span>
                )}
                {bestPath.tradeoff.speed < 0.4 && (
                  <span className="text-[8px] text-neon-yellow">↓ speed</span>
                )}
                {bestPath.tradeoff.complexity < 0.4 && (
                  <span className="text-[8px] text-neon-yellow">↓ complex</span>
                )}
              </div>
            )}
          </div>
        )}

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
                  {rec.qualityScore != null && rec.qualityScore >= 0.6 && (
                    <span className="text-[9px] text-neon-green">★ high quality</span>
                  )}
                  {rec.stats && <CredibilityLine stats={rec.stats} />}
                  {/* Per-item dismiss */}
                  <button
                    onClick={() => handleDismiss(rec.id)}
                    className="text-[9px] text-slate-700 hover:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity ml-auto flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 truncate">{rec.explanation}</div>
                {rec.modeImpact && Math.abs(rec.modeImpact.delta) >= 0.02 && (
                  <div
                    className={`text-[9px] ${
                      rec.modeImpact.delta > 0 ? 'text-neon-green' : 'text-slate-600'
                    }`}
                  >
                    {rec.modeImpact.delta > 0 ? '↑' : '↓'} {rec.modeImpact.summary}
                  </div>
                )}

                {/* Actions */}
                {rec.action && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      onClick={() => handleAction(rec)}
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
                            recommendationId: rec.id,
                            recommendationType: rec.type,
                            recommendationLabel: rec.label,
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
