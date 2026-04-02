'use client'

/**
 * Evidence Sheet — structured drill-down explaining why a recommendation
 * was made. Shows similar runs, confidence breakdown, effectiveness stats,
 * and workflow/autonomy/memory evidence from real persisted data.
 */

import { trpc } from '../../utils/trpc'

// ── Score Bar ─────────────────────────────────────────────────────────

function ScoreBar({ label, value, max = 1 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-neon-purple/60 rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-slate-400 w-10 text-right">{pct}%</span>
    </div>
  )
}

// ── Section Label ─────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <div className="text-[10px] font-orbitron text-slate-400 uppercase tracking-wider mb-2">
      {text}
    </div>
  )
}

// ── Data Quality Badge ────────────────────────────────────────────────

const QUALITY_LABELS: Record<string, { label: string; cls: string }> = {
  strong: { label: 'Strong evidence', cls: 'text-neon-green' },
  moderate: { label: 'Moderate evidence', cls: 'text-neon-yellow' },
  early: { label: 'Early signal', cls: 'text-slate-400' },
  heuristic_only: { label: 'Pattern-based only', cls: 'text-slate-500' },
}

// ── Component ─────────────────────────────────────────────────────────

interface EvidenceSheetProps {
  recommendationId: string
  recommendationType: string
  label: string
  sessionId: string
  userInput?: string
  agentIds?: string[]
  decisionMode?: string
  onClose: () => void
  onNavigateToRun?: (runId: string) => void
}

export function EvidenceSheet({
  recommendationId,
  recommendationType,
  label,
  sessionId,
  userInput,
  agentIds,
  decisionMode,
  onClose,
  onNavigateToRun,
}: EvidenceSheetProps) {
  const castMode = decisionMode as
    | 'balanced'
    | 'quality'
    | 'speed'
    | 'stability'
    | 'simplicity'
    | undefined

  const query = trpc.intelligence.getRecommendationEvidence.useQuery(
    {
      recommendationId,
      recommendationType,
      label,
      sessionId,
      userInput,
      agentIds,
      decisionMode: castMode,
    },
    { staleTime: 60_000, refetchOnWindowFocus: false },
  )

  const data = query.data
  const quality = data ? QUALITY_LABELS[data.confidence.dataQuality] : null

  return (
    <div className="w-80 border-l border-border bg-bg-surface flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-dim">
        <h3 className="text-xs font-orbitron text-neon-purple uppercase tracking-wider">
          Evidence
        </h3>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-sm">
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {query.isLoading && (
          <div className="flex items-center gap-2 py-8 justify-center">
            <span className="neon-dot neon-dot-purple animate-pulse" />
            <span className="text-[10px] text-slate-600">Loading evidence...</span>
          </div>
        )}

        {query.error && (
          <div className="cyber-card border-neon-red/20 p-3 text-center">
            <div className="text-[10px] text-neon-red mb-2">Could not load evidence</div>
            <button
              onClick={() => query.refetch()}
              className="text-[9px] text-slate-500 hover:text-slate-300"
            >
              Retry
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Summary */}
            <div className="space-y-1.5">
              <div className="text-[11px] text-slate-300 font-medium">{data.label}</div>
              <div className="text-[10px] text-slate-500 leading-relaxed">
                {data.explanationSummary}
              </div>
              {quality && <div className={`text-[9px] ${quality.cls}`}>{quality.label}</div>}
            </div>

            {/* Confidence Breakdown */}
            <div className="cyber-card p-2.5 space-y-2">
              <SectionLabel text="Confidence" />
              <ScoreBar label="Base heuristic" value={data.confidence.baseHeuristic} />
              {data.confidence.effectiveness !== null ? (
                <ScoreBar label="Effectiveness" value={data.confidence.effectiveness} />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 w-24 flex-shrink-0">
                    Effectiveness
                  </span>
                  <span className="text-[10px] text-slate-600 italic">No outcome data yet</span>
                </div>
              )}
              <div className="border-t border-border-dim pt-1.5">
                <ScoreBar label="Final score" value={data.confidence.blended} />
              </div>
            </div>

            {/* Quality Stats */}
            {data.qualityStats && (
              <div className="cyber-card p-2.5 space-y-1.5">
                <SectionLabel text="Quality" />
                <ScoreBar label="Avg quality" value={data.qualityStats.avgScore} />
                <div className="flex items-center gap-3 text-[9px]">
                  {data.qualityStats.highCount > 0 && (
                    <span className="text-neon-green">{data.qualityStats.highCount} high</span>
                  )}
                  {data.qualityStats.mediumCount > 0 && (
                    <span className="text-neon-yellow">{data.qualityStats.mediumCount} medium</span>
                  )}
                  {data.qualityStats.lowCount > 0 && (
                    <span className="text-neon-red">{data.qualityStats.lowCount} low</span>
                  )}
                </div>
              </div>
            )}

            {/* Tradeoff Profile */}
            {data.tradeoff && (
              <div className="cyber-card p-2.5 space-y-2">
                <SectionLabel text="Tradeoffs" />
                <ScoreBar label="Quality" value={data.tradeoff.quality} />
                <ScoreBar label="Speed" value={data.tradeoff.speed} />
                <ScoreBar label="Stability" value={data.tradeoff.stability} />
                <ScoreBar label="Simplicity" value={data.tradeoff.complexity} />
              </div>
            )}

            {/* Decision Mode Impact */}
            {data.modeImpact && (
              <div className="cyber-card p-2.5 space-y-1.5">
                <SectionLabel text="Decision Mode Impact" />
                <div className="text-[10px] text-slate-400">{data.modeImpact.summary}</div>
                <div className="flex items-center gap-3 text-[10px]">
                  <div>
                    <span className="text-slate-500">Balanced: </span>
                    <span className="font-mono text-slate-300">
                      {Math.round(data.modeImpact.baselineScore * 100)}%
                    </span>
                  </div>
                  <span className="text-slate-600">→</span>
                  <div>
                    <span className="text-slate-500">{data.modeImpact.currentMode}: </span>
                    <span className="font-mono text-slate-300">
                      {Math.round(data.modeImpact.currentScore * 100)}%
                    </span>
                  </div>
                  <span
                    className={`font-mono text-[9px] ${
                      data.modeImpact.delta > 0
                        ? 'text-neon-green'
                        : data.modeImpact.delta < 0
                          ? 'text-neon-red'
                          : 'text-slate-500'
                    }`}
                  >
                    {data.modeImpact.delta > 0 ? '+' : ''}
                    {Math.round(data.modeImpact.delta * 100)}
                  </span>
                </div>
                {data.modeImpact.emphasized.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[9px] text-slate-600">Emphasized:</span>
                    {data.modeImpact.emphasized.map((d) => (
                      <span
                        key={d}
                        className="text-[8px] px-1 py-0.5 rounded bg-neon-green/10 text-neon-green"
                      >
                        ↑ {d}
                      </span>
                    ))}
                  </div>
                )}
                {data.modeImpact.deEmphasized.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[9px] text-slate-600">De-emphasized:</span>
                    {data.modeImpact.deEmphasized.map((d) => (
                      <span
                        key={d}
                        className="text-[8px] px-1 py-0.5 rounded bg-slate-700/50 text-slate-500"
                      >
                        ↓ {d}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Similar Runs */}
            {data.similarRuns.length > 0 && (
              <div>
                <SectionLabel text={`Similar Runs (${data.similarRuns.length})`} />
                <div className="space-y-1.5">
                  {data.similarRuns.map((run) => (
                    <div
                      key={run.runId}
                      className="cyber-card p-2 space-y-1 group hover:border-neon-purple/20 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-slate-400">
                          {run.runId.slice(0, 8)}...
                        </span>
                        <span className="text-[9px] font-mono text-neon-purple">
                          {Math.round(run.score * 100)}%
                        </span>
                      </div>
                      {/* Reason chips */}
                      <div className="flex flex-wrap gap-1">
                        {run.reasons.map((reason) => (
                          <span
                            key={reason}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400"
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                      {/* Stats */}
                      <div className="flex items-center gap-2 text-[9px] text-slate-500">
                        <span
                          className={
                            run.status === 'completed' ? 'text-neon-green' : 'text-neon-red'
                          }
                        >
                          {run.status}
                        </span>
                        {run.durationMs != null && (
                          <span>{(run.durationMs / 1000).toFixed(1)}s</span>
                        )}
                        {run.stepCount != null && <span>{run.stepCount} steps</span>}
                        {run.qualityLabel && (
                          <span
                            className={
                              run.qualityLabel === 'high'
                                ? 'text-neon-green'
                                : run.qualityLabel === 'medium'
                                  ? 'text-neon-yellow'
                                  : 'text-neon-red'
                            }
                          >
                            {run.qualityLabel}
                          </span>
                        )}
                        {run.workflowName && (
                          <span className="text-neon-blue truncate">{run.workflowName}</span>
                        )}
                      </div>
                      {/* Navigate */}
                      {onNavigateToRun && (
                        <button
                          onClick={() => onNavigateToRun(run.runId)}
                          className="text-[9px] text-slate-600 hover:text-neon-purple opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Open in Inspector
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Effectiveness Stats */}
            {data.effectivenessStats && (
              <div className="cyber-card p-2.5 space-y-1.5">
                <SectionLabel text="Effectiveness" />
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-sm font-mono text-slate-300">
                      {data.effectivenessStats.shown}
                    </div>
                    <div className="text-[9px] text-slate-600">Shown</div>
                  </div>
                  <div>
                    <div className="text-sm font-mono text-slate-300">
                      {data.effectivenessStats.clicked}
                    </div>
                    <div className="text-[9px] text-slate-600">Clicked</div>
                  </div>
                  <div>
                    <div className="text-sm font-mono text-neon-green">
                      {data.effectivenessStats.improved}
                    </div>
                    <div className="text-[9px] text-slate-600">Helped</div>
                  </div>
                </div>
                {data.effectivenessStats.recovered > 0 && (
                  <div className="text-[10px] text-slate-500 text-center">
                    Recovered {data.effectivenessStats.recovered} failure
                    {data.effectivenessStats.recovered !== 1 ? 's' : ''}
                  </div>
                )}
                <ScoreBar label="Improvement" value={data.effectivenessStats.improvementRate} />
              </div>
            )}

            {/* Workflow Stats */}
            {data.workflowStats && (
              <div className="cyber-card p-2.5 space-y-1.5">
                <SectionLabel text="Workflow" />
                <div className="text-[11px] text-neon-blue font-medium">
                  {data.workflowStats.workflowName}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                  <div className="text-slate-500">Total runs</div>
                  <div className="text-slate-300 text-right">{data.workflowStats.totalRuns}</div>
                  <div className="text-slate-500">Success rate</div>
                  <div className="text-slate-300 text-right">
                    {Math.round(data.workflowStats.successRate * 100)}%
                  </div>
                  {data.workflowStats.avgDurationMs != null && (
                    <>
                      <div className="text-slate-500">Avg duration</div>
                      <div className="text-slate-300 text-right">
                        {(data.workflowStats.avgDurationMs / 1000).toFixed(1)}s
                      </div>
                    </>
                  )}
                  {data.workflowStats.avgStepCount != null && (
                    <>
                      <div className="text-slate-500">Avg steps</div>
                      <div className="text-slate-300 text-right">
                        {data.workflowStats.avgStepCount}
                      </div>
                    </>
                  )}
                  {data.workflowStats.retryRecoveryRate != null && (
                    <>
                      <div className="text-slate-500">Retry recovery</div>
                      <div className="text-slate-300 text-right">
                        {Math.round(data.workflowStats.retryRecoveryRate * 100)}%
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Autonomy Stats */}
            {data.autonomyStats && (
              <div className="cyber-card p-2.5 space-y-1.5">
                <SectionLabel text="Autonomy" />
                {Object.entries(data.autonomyStats.breakdown).map(([level, stats]) => (
                  <div key={level} className="flex items-center gap-2">
                    <span
                      className={`text-[10px] w-14 ${
                        level === data.autonomyStats!.bestMode
                          ? 'text-neon-green font-medium'
                          : 'text-slate-500'
                      }`}
                    >
                      {level}
                    </span>
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          level === data.autonomyStats!.bestMode
                            ? 'bg-neon-green/60'
                            : 'bg-slate-600/60'
                        }`}
                        style={{ width: `${Math.round(stats.successRate * 100)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-400 w-12 text-right">
                      {Math.round(stats.successRate * 100)}% ({stats.count})
                    </span>
                  </div>
                ))}
                {data.autonomyStats.delta != null && data.autonomyStats.bestMode && (
                  <div className="text-[10px] text-neon-green">
                    {data.autonomyStats.bestMode} +{data.autonomyStats.delta}% vs manual
                  </div>
                )}
              </div>
            )}

            {/* Memory Stats */}
            {data.memoryStats && (
              <div className="cyber-card p-2.5 space-y-1.5">
                <SectionLabel text="Memory Impact" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                  <div className="text-slate-500">With memory</div>
                  <div className="text-slate-300 text-right">
                    {Math.round(data.memoryStats.withMemoryRate * 100)}% success
                  </div>
                  <div className="text-slate-500">Without memory</div>
                  <div className="text-slate-300 text-right">
                    {Math.round(data.memoryStats.withoutMemoryRate * 100)}% success
                  </div>
                </div>
                <div
                  className={`text-[10px] font-medium ${
                    data.memoryStats.impactDelta > 0 ? 'text-neon-green' : 'text-neon-red'
                  }`}
                >
                  {data.memoryStats.impactDelta > 0 ? '+' : ''}
                  {data.memoryStats.impactDelta}% impact
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
