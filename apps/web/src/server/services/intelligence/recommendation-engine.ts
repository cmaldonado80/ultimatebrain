/**
 * Recommendation Engine — evidence-based workflow intelligence.
 *
 * Uses historical run/workflow/memory/autonomy data to produce
 * explainable, confidence-scored recommendations. Rule-based,
 * no black-box ML. Every recommendation includes evidence.
 */

import type { Database } from '@solarc/db'
import {
  chatMessages,
  chatRuns,
  chatRunSteps,
  recommendationEvents,
  recommendationOutcomes,
  runQuality,
  workflowInsights,
} from '@solarc/db'
import { and, desc, eq, ne, not, sql } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export type DecisionMode = 'balanced' | 'quality' | 'speed' | 'stability' | 'simplicity'

export interface DecisionWeights {
  heuristic: number
  effectiveness: number
  quality: number
}

export interface PathRankWeights {
  quality: number
  speed: number
  stability: number
  complexity: number
}

const DECISION_WEIGHTS: Record<DecisionMode, DecisionWeights> = {
  balanced: { heuristic: 0.5, effectiveness: 0.3, quality: 0.2 },
  quality: { heuristic: 0.25, effectiveness: 0.25, quality: 0.5 },
  speed: { heuristic: 0.5, effectiveness: 0.35, quality: 0.15 },
  stability: { heuristic: 0.35, effectiveness: 0.4, quality: 0.25 },
  simplicity: { heuristic: 0.45, effectiveness: 0.3, quality: 0.25 },
}

const PATH_RANK_WEIGHTS: Record<DecisionMode, PathRankWeights> = {
  balanced: { quality: 0.35, speed: 0.25, stability: 0.25, complexity: 0.15 },
  quality: { quality: 0.6, speed: 0.1, stability: 0.2, complexity: 0.1 },
  speed: { quality: 0.15, speed: 0.5, stability: 0.2, complexity: 0.15 },
  stability: { quality: 0.2, speed: 0.15, stability: 0.5, complexity: 0.15 },
  simplicity: { quality: 0.15, speed: 0.2, stability: 0.15, complexity: 0.5 },
}

export function getDecisionWeights(mode: DecisionMode = 'balanced'): DecisionWeights {
  return DECISION_WEIGHTS[mode]
}

export function getPathRankWeights(mode: DecisionMode = 'balanced'): PathRankWeights {
  return PATH_RANK_WEIGHTS[mode]
}

export type RecommendationType =
  | 'workflow'
  | 'retry_strategy'
  | 'memory'
  | 'autonomy'
  | 'execution_pattern'

export interface Recommendation {
  id: string
  type: RecommendationType
  label: string
  explanation: string
  confidence: number
  evidence: RecommendationEvidence
  action?: RecommendationAction
}

export interface RecommendationEvidence {
  basedOnRunIds: string[]
  sampleSize: number
  successRate?: number
  avgDurationMs?: number
  verdictSummary?: string
  metricDelta?: string
}

export interface RecommendationAction {
  type:
    | 'run_workflow'
    | 'compare_run'
    | 'retry_group'
    | 'retry_step'
    | 'switch_autonomy'
    | 'inspect_evidence'
  label: string
  payload: Record<string, unknown>
}

export interface SimilarRunMatch {
  runId: string
  score: number
  reasons: string[]
  run: {
    status: string
    durationMs: number | null
    stepCount: number | null
    workflowId: string | null
    workflowName: string | null
    autonomyLevel: string | null
    memoryCount: number | null
    agentIds: string[] | null
    qualityScore: number | null
    qualityLabel: string | null
  }
}

export interface WorkflowInsightSummary {
  workflowId: string | null
  workflowName: string | null
  totalRuns: number
  successRate: number
  avgDurationMs: number | null
  avgStepCount: number | null
  retryRecoveryRate: number | null
  autonomyBreakdown: Record<string, { count: number; successRate: number }> | null
}

// ── Similarity Scoring ────────────────────────────────────────────────

function agentOverlap(currentAgents: string[], runAgents: string[]): number {
  if (currentAgents.length === 0 && runAgents.length === 0) return 0.5
  const setA = new Set(currentAgents)
  const setB = new Set(runAgents.filter(Boolean))
  const intersection = [...setA].filter((x) => setB.has(x)).length
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

function textSimilarity(currentText: string, runText: string): number {
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2)
  const tokensA = new Set(tokenize(currentText))
  const tokensB = new Set(tokenize(runText))
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  const intersection = [...tokensA].filter((t) => tokensB.has(t)).length
  return intersection / Math.max(tokensA.size, tokensB.size)
}

function toolPatternSimilarity(currentTools: string[], runTools: string[]): number {
  const setA = new Set(currentTools)
  const setB = new Set(runTools)
  if (setA.size === 0 && setB.size === 0) return 0.5
  const intersection = [...setA].filter((x) => setB.has(x)).length
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

// ── Similar Run Finder ────────────────────────────────────────────────

export async function findSimilarRuns(
  db: Database,
  params: {
    sessionId: string
    userInput?: string
    agentIds?: string[]
    limit?: number
  },
): Promise<SimilarRunMatch[]> {
  const { sessionId, userInput, agentIds = [], limit = 5 } = params

  // Get current session's recent user message if no input provided
  let currentText = userInput ?? ''
  if (!currentText) {
    const msgs = await db.query.chatMessages.findMany({
      where: eq(chatMessages.sessionId, sessionId),
      orderBy: desc(chatMessages.createdAt),
      limit: 3,
    })
    const lastUser = msgs.find((m) => m.role === 'user')
    currentText = lastUser?.text ?? ''
  }

  // Query recent completed/failed runs (exclude current session, last 100)
  const recentRuns = await db.query.chatRuns.findMany({
    where: and(ne(chatRuns.sessionId, sessionId), not(eq(chatRuns.status, 'running'))),
    orderBy: desc(chatRuns.startedAt),
    limit: 100,
  })

  if (recentRuns.length === 0) return []

  // Batch-load user messages for these runs
  const runMessageMap = new Map<string, string>()
  const runIds = recentRuns.map((r) => r.id)

  // Load user messages linked to these runs
  for (const run of recentRuns) {
    if (run.userMessageId) {
      const msg = await db.query.chatMessages.findFirst({
        where: eq(chatMessages.id, run.userMessageId),
      })
      if (msg) runMessageMap.set(run.id, msg.text)
    }
  }

  // Load tool names per run (lightweight — just distinct tool names)
  const runToolMap = new Map<string, string[]>()
  if (runIds.length > 0) {
    const allSteps = await db.query.chatRunSteps.findMany({
      where: sql`${chatRunSteps.runId} = ANY(${runIds})`,
    })
    for (const step of allSteps) {
      if (step.type === 'tool' && step.toolName) {
        const existing = runToolMap.get(step.runId) ?? []
        if (!existing.includes(step.toolName)) existing.push(step.toolName)
        runToolMap.set(step.runId, existing)
      }
    }
  }

  // Load quality scores per run
  const runQualityMap = new Map<string, { score: number; label: string }>()
  if (runIds.length > 0) {
    const qualities = await db.query.runQuality.findMany({
      where: sql`${runQuality.runId} = ANY(${runIds})`,
    })
    for (const q of qualities) {
      runQualityMap.set(q.runId, { score: q.score, label: q.label })
    }
  }

  // Score each run
  const scored: SimilarRunMatch[] = []
  for (const run of recentRuns) {
    const runText = runMessageMap.get(run.id) ?? ''
    const runAgents = (run.agentIds ?? []).filter(Boolean)
    const runTools = runToolMap.get(run.id) ?? []

    const agentScore = agentOverlap(agentIds, runAgents)
    const textScore = currentText
      ? textSimilarity(currentText.slice(0, 200), runText.slice(0, 200))
      : 0
    const toolScore = toolPatternSimilarity([], runTools) // No current tools yet pre-run
    const workflowScore = 0 // No current workflow context pre-run

    const composite = agentScore * 0.35 + textScore * 0.35 + toolScore * 0.15 + workflowScore * 0.15

    if (composite >= 0.25) {
      const reasons: string[] = []
      if (agentScore > 0.5) reasons.push('Same agents')
      if (textScore > 0.3) reasons.push('Similar input')
      if (toolScore > 0.3) reasons.push('Similar tools')

      scored.push({
        runId: run.id,
        score: Math.round(composite * 100) / 100,
        reasons,
        run: {
          status: run.status,
          durationMs: run.durationMs,
          stepCount: run.stepCount,
          workflowId: run.workflowId,
          workflowName: run.workflowName,
          autonomyLevel: run.autonomyLevel,
          memoryCount: run.memoryCount,
          agentIds: run.agentIds,
          qualityScore: runQualityMap.get(run.id)?.score ?? null,
          qualityLabel: runQualityMap.get(run.id)?.label ?? null,
        },
      })
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}

// ── Workflow Recommendation Builder ───────────────────────────────────

function avg(nums: (number | null | undefined)[]): number | null {
  const valid = nums.filter((n): n is number => n !== null && n !== undefined)
  if (valid.length === 0) return null
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
}

export function buildRecommendations(similarRuns: SimilarRunMatch[]): Recommendation[] {
  if (similarRuns.length === 0) return []

  const recommendations: Recommendation[] = []

  // 1. Workflow recommendation — group by workflowName
  const byWorkflow = new Map<string, SimilarRunMatch[]>()
  for (const match of similarRuns) {
    const key = match.run.workflowName ?? '_adhoc_'
    const group = byWorkflow.get(key) ?? []
    group.push(match)
    byWorkflow.set(key, group)
  }

  for (const [workflowKey, runs] of byWorkflow) {
    if (workflowKey === '_adhoc_') continue
    const total = runs.length
    const completed = runs.filter((r) => r.run.status === 'completed').length
    const successRate = total > 0 ? completed / total : 0
    const avgDuration = avg(runs.map((r) => r.run.durationMs))

    const sampleBonus = Math.min(total / 10, 1) * 0.3
    const successBonus = successRate * 0.5
    const similarityBonus = Math.min((runs[0]?.score ?? 0) * 0.2, 0.2)
    let confidence = Math.min(sampleBonus + successBonus + similarityBonus, 1)

    // Quality bonus/penalty
    const wfQualityScores = runs
      .map((r) => r.run.qualityScore)
      .filter((s): s is number => s != null)
    const wfAvgQuality =
      wfQualityScores.length > 0
        ? wfQualityScores.reduce((a, b) => a + b, 0) / wfQualityScores.length
        : null
    const qualityBonus =
      wfAvgQuality !== null ? (wfAvgQuality >= 0.7 ? 0.1 : wfAvgQuality < 0.4 ? -0.05 : 0) : 0
    confidence = Math.min(confidence + qualityBonus, 1)

    if (confidence >= 0.3) {
      const qualityNote =
        wfAvgQuality !== null ? `, ${Math.round(wfAvgQuality * 100)}% avg quality` : ''
      recommendations.push({
        id: `wf-${runs[0]?.run.workflowId ?? workflowKey}`,
        type: 'workflow',
        label: `Use Workflow: "${workflowKey}"`,
        explanation: `${total} similar run${total !== 1 ? 's' : ''}, ${Math.round(successRate * 100)}% success rate${avgDuration ? `, avg ${(avgDuration / 1000).toFixed(1)}s` : ''}${qualityNote}`,
        confidence: Math.round(confidence * 100) / 100,
        evidence: {
          basedOnRunIds: runs.slice(0, 5).map((r) => r.runId),
          sampleSize: total,
          successRate,
          avgDurationMs: avgDuration ?? undefined,
        },
        action: runs[0]?.run.workflowId
          ? {
              type: 'run_workflow',
              label: 'Apply Workflow',
              payload: { workflowId: runs[0].run.workflowId, workflowName: workflowKey },
            }
          : undefined,
      })
    }
  }

  // 2. Autonomy recommendation — compare autonomy levels
  const byAutonomy = new Map<string, SimilarRunMatch[]>()
  for (const match of similarRuns) {
    const level = match.run.autonomyLevel ?? 'manual'
    const group = byAutonomy.get(level) ?? []
    group.push(match)
    byAutonomy.set(level, group)
  }

  if (byAutonomy.size > 1) {
    let bestLevel: string | null = null
    let bestRate = 0
    let bestCount = 0
    for (const [level, runs] of byAutonomy) {
      const completed = runs.filter((r) => r.run.status === 'completed').length
      const rate = runs.length > 0 ? completed / runs.length : 0
      if (rate > bestRate + 0.1 && runs.length >= 2) {
        bestRate = rate
        bestLevel = level
        bestCount = runs.length
      }
    }

    if (bestLevel && bestLevel !== 'manual') {
      const delta = Math.round(
        (bestRate -
          ((byAutonomy.get('manual')?.length ?? 0 > 0)
            ? byAutonomy.get('manual')!.filter((r) => r.run.status === 'completed').length /
              byAutonomy.get('manual')!.length
            : 0)) *
          100,
      )

      recommendations.push({
        id: `auto-${bestLevel}`,
        type: 'autonomy',
        label: `${bestLevel.charAt(0).toUpperCase() + bestLevel.slice(1)} mode improved outcomes`,
        explanation: `${bestCount} similar runs with ${bestLevel} mode had ${Math.round(bestRate * 100)}% success${delta > 0 ? ` (+${delta}% vs manual)` : ''}`,
        confidence: Math.min(0.3 + bestRate * 0.4 + Math.min(bestCount / 10, 1) * 0.2, 0.95),
        evidence: {
          basedOnRunIds: (byAutonomy.get(bestLevel) ?? []).slice(0, 3).map((r) => r.runId),
          sampleSize: bestCount,
          successRate: bestRate,
          metricDelta: delta > 0 ? `+${delta}% success rate` : undefined,
        },
        action: {
          type: 'switch_autonomy',
          label: `Switch to ${bestLevel}`,
          payload: { level: bestLevel },
        },
      })
    }
  }

  // 3. Memory recommendation — compare memory vs no-memory runs
  const withMemory = similarRuns.filter((r) => (r.run.memoryCount ?? 0) > 0)
  const withoutMemory = similarRuns.filter((r) => (r.run.memoryCount ?? 0) === 0)

  if (withMemory.length >= 2 && withoutMemory.length >= 2) {
    const memRate =
      withMemory.filter((r) => r.run.status === 'completed').length / withMemory.length
    const noMemRate =
      withoutMemory.filter((r) => r.run.status === 'completed').length / withoutMemory.length
    const delta = Math.round((memRate - noMemRate) * 100)

    if (Math.abs(delta) >= 10) {
      const helped = delta > 0
      recommendations.push({
        id: 'mem-impact',
        type: 'memory',
        label: helped ? 'Memory improved outcomes' : 'Memory may not help here',
        explanation: `Runs with memory: ${Math.round(memRate * 100)}% success. Without: ${Math.round(noMemRate * 100)}% success (${delta > 0 ? '+' : ''}${delta}%)`,
        confidence: Math.min(
          0.3 + (Math.abs(delta) / 100) * 0.4 + Math.min(withMemory.length / 5, 1) * 0.2,
          0.9,
        ),
        evidence: {
          basedOnRunIds: [...withMemory, ...withoutMemory].slice(0, 5).map((r) => r.runId),
          sampleSize: withMemory.length + withoutMemory.length,
          metricDelta: `${delta > 0 ? '+' : ''}${delta}% with memory`,
        },
      })
    }
  }

  return recommendations.sort((a, b) => b.confidence - a.confidence).slice(0, 3)
}

// ── Workflow Insights Refresh ─────────────────────────────────────────

export async function refreshInsights(
  db: Database,
  workflowId?: string,
): Promise<{ updated: number }> {
  // Query all runs grouped by workflowId
  const whereClause = workflowId ? eq(chatRuns.workflowId, workflowId) : undefined
  const allRuns = await db.query.chatRuns.findMany({
    where: whereClause,
    orderBy: desc(chatRuns.startedAt),
  })

  // Group by workflowId (null = ad-hoc)
  const groups = new Map<string | null, typeof allRuns>()
  for (const run of allRuns) {
    const key = run.workflowId ?? null
    const group = groups.get(key) ?? []
    group.push(run)
    groups.set(key, group)
  }

  let updated = 0
  for (const [wfId, runs] of groups) {
    const total = runs.length
    const completed = runs.filter((r) => r.status === 'completed').length
    const failed = runs.filter((r) => r.status === 'failed').length
    const successRate = total > 0 ? completed / total : 0
    const avgDuration = avg(runs.map((r) => r.durationMs))
    const avgSteps = avg(runs.map((r) => r.stepCount))

    // Retry recovery rate
    const retryRuns = runs.filter((r) => r.retryOfRunId)
    const retryRecovered = retryRuns.filter((r) => r.status === 'completed').length
    const retryRecoveryRate = retryRuns.length > 0 ? retryRecovered / retryRuns.length : null

    // Memory impact
    const withMem = runs.filter((r) => (r.memoryCount ?? 0) > 0)
    const noMem = runs.filter((r) => (r.memoryCount ?? 0) === 0)
    const memImpact =
      withMem.length >= 2 && noMem.length >= 2
        ? withMem.filter((r) => r.status === 'completed').length / withMem.length -
          noMem.filter((r) => r.status === 'completed').length / noMem.length
        : null

    // Autonomy breakdown
    const autonomyBreakdown: Record<string, { count: number; successRate: number }> = {}
    for (const level of ['manual', 'assist', 'auto'] as const) {
      const levelRuns = runs.filter((r) => r.autonomyLevel === level)
      if (levelRuns.length > 0) {
        autonomyBreakdown[level] = {
          count: levelRuns.length,
          successRate: levelRuns.filter((r) => r.status === 'completed').length / levelRuns.length,
        }
      }
    }

    // Top agents and tools (from most recent runs)
    const recentRunIds = runs.slice(0, 20).map((r) => r.id)
    const steps =
      recentRunIds.length > 0
        ? await db.query.chatRunSteps.findMany({
            where: sql`${chatRunSteps.runId} = ANY(${recentRunIds})`,
          })
        : []

    const agentCounts = new Map<string, number>()
    const toolCounts = new Map<string, number>()
    for (const step of steps) {
      if (step.agentId) agentCounts.set(step.agentId, (agentCounts.get(step.agentId) ?? 0) + 1)
      if (step.toolName) toolCounts.set(step.toolName, (toolCounts.get(step.toolName) ?? 0) + 1)
    }
    const topAgents = [...agentCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id)
    const topTools = [...toolCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name)

    const wfName = runs[0]?.workflowName ?? (wfId ? 'Unknown' : null)

    // Upsert
    const existing = await db.query.workflowInsights.findFirst({
      where: wfId
        ? eq(workflowInsights.workflowId, wfId)
        : sql`${workflowInsights.workflowId} IS NULL`,
    })

    // Quality aggregation
    const runIds = runs.map((r) => r.id)
    const qualityRecords =
      runIds.length > 0
        ? await db.query.runQuality.findMany({
            where: sql`${runQuality.runId} = ANY(${runIds})`,
          })
        : []
    const avgQualityScore =
      qualityRecords.length > 0
        ? Math.round(
            (qualityRecords.reduce((s, q) => s + q.score, 0) / qualityRecords.length) * 1000,
          ) / 1000
        : null
    const highQualityRate =
      qualityRecords.length > 0
        ? Math.round(
            (qualityRecords.filter((q) => q.label === 'high').length / qualityRecords.length) *
              1000,
          ) / 1000
        : null

    const values = {
      workflowId: wfId,
      workflowName: wfName,
      totalRuns: total,
      completedRuns: completed,
      failedRuns: failed,
      successRate: Math.round(successRate * 1000) / 1000,
      avgDurationMs: avgDuration,
      avgStepCount: avgSteps,
      retryRecoveryRate:
        retryRecoveryRate !== null ? Math.round(retryRecoveryRate * 1000) / 1000 : null,
      memoryImpactScore: memImpact !== null ? Math.round(memImpact * 1000) / 1000 : null,
      autonomyBreakdown,
      topAgentIds: topAgents,
      topToolNames: topTools,
      avgQualityScore,
      highQualityRate,
      updatedAt: new Date(),
    }

    if (existing) {
      await db.update(workflowInsights).set(values).where(eq(workflowInsights.id, existing.id))
    } else {
      await db.insert(workflowInsights).values(values)
    }
    updated++
  }

  return { updated }
}

// ── Effectiveness Scoring ─────────────────────────────────────────────

export interface RecommendationStats {
  shown: number
  clicked: number
  improved: number
  recovered: number
  acceptanceRate: number
  improvementRate: number
}

/**
 * Fetch effectiveness stats for a recommendation ID.
 * Used to boost/demote recommendations based on real-world outcomes.
 */
export async function getEffectivenessStats(
  db: Database,
  recommendationId: string,
): Promise<RecommendationStats> {
  const events = await db.query.recommendationEvents.findMany({
    where: eq(recommendationEvents.recommendationId, recommendationId),
    limit: 100,
  })

  const shown = events.length
  const clicked = events.filter((e) => e.clickedAt).length
  const linkedIds = events.filter((e) => e.resultingRunId).map((e) => e.id)

  const outcomes =
    linkedIds.length > 0
      ? await db.query.recommendationOutcomes.findMany({
          where: sql`${recommendationOutcomes.eventId} = ANY(${linkedIds})`,
        })
      : []

  const improved = outcomes.filter((o) => o.improved).length
  const recovered = outcomes.filter((o) => o.recovered).length

  return {
    shown,
    clicked,
    improved,
    recovered,
    acceptanceRate: shown > 0 ? clicked / shown : 0,
    improvementRate: outcomes.length > 0 ? improved / outcomes.length : 0,
  }
}

/**
 * Compute a blended score: 50% base heuristic + 30% effectiveness + 20% quality.
 * Falls back gracefully when effectiveness or quality data is unavailable.
 */
export function computeBlendedScore(
  baseConfidence: number,
  stats: RecommendationStats | null,
  avgQualityScore?: number | null,
  mode?: DecisionMode,
): number {
  const w = getDecisionWeights(mode ?? 'balanced')
  const hasEffectiveness = stats != null && stats.shown >= 3
  const hasQuality = avgQualityScore != null

  if (!hasEffectiveness && !hasQuality) return baseConfidence

  if (!hasEffectiveness && hasQuality) {
    // Redistribute effectiveness weight to heuristic
    const h = w.heuristic + w.effectiveness
    return Math.round((baseConfidence * h + avgQualityScore * w.quality) * 100) / 100
  }

  const effectivenessScore = stats!.acceptanceRate * 0.4 + stats!.improvementRate * 0.6
  const qualityComponent = hasQuality ? avgQualityScore : baseConfidence

  return (
    Math.round(
      (baseConfidence * w.heuristic +
        effectivenessScore * w.effectiveness +
        qualityComponent * w.quality) *
        100,
    ) / 100
  )
}

// ── Evidence Payload ──────────────────────────────────────────────────

export interface ConfidenceBreakdown {
  baseHeuristic: number
  effectiveness: number | null
  blended: number
  dataQuality: 'strong' | 'moderate' | 'early' | 'heuristic_only'
}

export interface SimilarRunEvidence {
  runId: string
  score: number
  reasons: string[]
  status: string
  durationMs: number | null
  stepCount: number | null
  workflowName: string | null
  autonomyLevel: string | null
  memoryCount: number | null
  qualityScore: number | null
  qualityLabel: string | null
}

export interface RecommendationEvidencePayload {
  recommendationId: string
  recommendationType: string
  label: string
  confidence: ConfidenceBreakdown
  similarRuns: SimilarRunEvidence[]
  effectivenessStats: {
    shown: number
    clicked: number
    improved: number
    recovered: number
    acceptanceRate: number
    improvementRate: number
  } | null
  workflowStats: {
    workflowName: string
    totalRuns: number
    successRate: number
    avgDurationMs: number | null
    avgStepCount: number | null
    retryRecoveryRate: number | null
  } | null
  autonomyStats: {
    breakdown: Record<string, { count: number; successRate: number }>
    bestMode: string | null
    bestRate: number | null
    delta: number | null
  } | null
  memoryStats: {
    withMemoryRate: number
    withoutMemoryRate: number
    impactDelta: number
  } | null
  qualityStats: {
    avgScore: number
    highCount: number
    mediumCount: number
    lowCount: number
  } | null
  tradeoff: TradeoffVector | null
  explanationSummary: string
}

/**
 * Build a full evidence payload for a recommendation.
 * Reuses findSimilarRuns, buildRecommendations, and getEffectivenessStats.
 */
export async function buildEvidencePayload(
  db: Database,
  params: {
    recommendationId: string
    recommendationType: string
    label: string
    sessionId: string
    userInput?: string
    agentIds?: string[]
  },
): Promise<RecommendationEvidencePayload> {
  // 1. Get similar runs (same as when recommendation was generated)
  const similarRuns = await findSimilarRuns(db, {
    sessionId: params.sessionId,
    userInput: params.userInput,
    agentIds: params.agentIds,
  })

  // 2. Find the specific recommendation to get base heuristic confidence
  const recs = buildRecommendations(similarRuns)
  const targetRec = recs.find((r) => r.id === params.recommendationId)
  const baseHeuristic = targetRec?.confidence ?? 0

  // 3. Get effectiveness stats
  const stats = await getEffectivenessStats(db, params.recommendationId)
  const hasEffectiveness = stats.shown >= 3
  const effectivenessScore = hasEffectiveness
    ? stats.acceptanceRate * 0.4 + stats.improvementRate * 0.6
    : null
  // Compute avg quality from similar runs for blended score
  const evQScores = similarRuns.map((r) => r.run.qualityScore).filter((s): s is number => s != null)
  const evAvgQuality =
    evQScores.length > 0 ? evQScores.reduce((a, b) => a + b, 0) / evQScores.length : null
  const blended = computeBlendedScore(baseHeuristic, hasEffectiveness ? stats : null, evAvgQuality)

  const dataQuality: ConfidenceBreakdown['dataQuality'] =
    stats.shown >= 10 && stats.improved >= 3
      ? 'strong'
      : stats.shown >= 3
        ? 'moderate'
        : stats.shown >= 1
          ? 'early'
          : 'heuristic_only'

  // 4. Build similar runs evidence
  const similarRunEvidence: SimilarRunEvidence[] = similarRuns.slice(0, 5).map((m) => ({
    runId: m.runId,
    score: m.score,
    reasons: m.reasons,
    status: m.run.status,
    durationMs: m.run.durationMs,
    stepCount: m.run.stepCount,
    workflowName: m.run.workflowName,
    autonomyLevel: m.run.autonomyLevel,
    memoryCount: m.run.memoryCount,
    qualityScore: m.run.qualityScore,
    qualityLabel: m.run.qualityLabel,
  }))

  // 4b. Quality stats from similar runs
  const evQualityScores = similarRunEvidence
    .map((r) => r.qualityScore)
    .filter((s): s is number => s != null)
  const qualityStats: RecommendationEvidencePayload['qualityStats'] =
    evQualityScores.length > 0
      ? {
          avgScore:
            Math.round(
              (evQualityScores.reduce((a, b) => a + b, 0) / evQualityScores.length) * 100,
            ) / 100,
          highCount: evQualityScores.filter((s) => s >= 0.7).length,
          mediumCount: evQualityScores.filter((s) => s >= 0.4 && s < 0.7).length,
          lowCount: evQualityScores.filter((s) => s < 0.4).length,
        }
      : null

  // 5. Workflow stats (if workflow recommendation)
  let workflowStats: RecommendationEvidencePayload['workflowStats'] = null
  if (params.recommendationType === 'workflow') {
    const workflowRuns = similarRuns.filter((r) => r.run.workflowName)
    const topWorkflow = workflowRuns[0]?.run.workflowName
    if (topWorkflow) {
      const wfRuns = workflowRuns.filter((r) => r.run.workflowName === topWorkflow)
      const completed = wfRuns.filter((r) => r.run.status === 'completed').length
      workflowStats = {
        workflowName: topWorkflow,
        totalRuns: wfRuns.length,
        successRate: wfRuns.length > 0 ? completed / wfRuns.length : 0,
        avgDurationMs: avg(wfRuns.map((r) => r.run.durationMs)),
        avgStepCount: avg(wfRuns.map((r) => r.run.stepCount)),
        retryRecoveryRate: null,
      }
      // Try to get richer stats from workflowInsights
      const wfId = wfRuns[0]?.run.workflowId
      if (wfId) {
        const insight = await db.query.workflowInsights.findFirst({
          where: eq(workflowInsights.workflowId, wfId),
        })
        if (insight) {
          workflowStats.totalRuns = insight.totalRuns
          workflowStats.successRate = insight.successRate
          workflowStats.avgDurationMs = insight.avgDurationMs
          workflowStats.avgStepCount = insight.avgStepCount
          workflowStats.retryRecoveryRate = insight.retryRecoveryRate
        }
      }
    }
  }

  // 6. Autonomy stats (if autonomy recommendation)
  let autonomyStats: RecommendationEvidencePayload['autonomyStats'] = null
  if (params.recommendationType === 'autonomy') {
    const breakdown: Record<string, { count: number; successRate: number }> = {}
    const byLevel = new Map<string, SimilarRunMatch[]>()
    for (const m of similarRuns) {
      const lvl = m.run.autonomyLevel ?? 'manual'
      const group = byLevel.get(lvl) ?? []
      group.push(m)
      byLevel.set(lvl, group)
    }
    let bestMode: string | null = null
    let bestRate = 0
    for (const [level, runs] of byLevel) {
      const completed = runs.filter((r) => r.run.status === 'completed').length
      const rate = runs.length > 0 ? completed / runs.length : 0
      breakdown[level] = { count: runs.length, successRate: Math.round(rate * 100) / 100 }
      if (rate > bestRate) {
        bestRate = rate
        bestMode = level
      }
    }
    const manualRate = breakdown['manual']?.successRate ?? 0
    autonomyStats = {
      breakdown,
      bestMode,
      bestRate: Math.round(bestRate * 100) / 100,
      delta: bestMode && bestMode !== 'manual' ? Math.round((bestRate - manualRate) * 100) : null,
    }
  }

  // 7. Memory stats (if memory recommendation)
  let memoryStats: RecommendationEvidencePayload['memoryStats'] = null
  if (params.recommendationType === 'memory') {
    const withMem = similarRuns.filter((r) => (r.run.memoryCount ?? 0) > 0)
    const withoutMem = similarRuns.filter((r) => (r.run.memoryCount ?? 0) === 0)
    if (withMem.length > 0 && withoutMem.length > 0) {
      const memRate = withMem.filter((r) => r.run.status === 'completed').length / withMem.length
      const noMemRate =
        withoutMem.filter((r) => r.run.status === 'completed').length / withoutMem.length
      memoryStats = {
        withMemoryRate: Math.round(memRate * 100) / 100,
        withoutMemoryRate: Math.round(noMemRate * 100) / 100,
        impactDelta: Math.round((memRate - noMemRate) * 100),
      }
    }
  }

  // 8. Build explanation summary from structured data
  const parts: string[] = []
  parts.push(`Based on ${similarRuns.length} similar run${similarRuns.length !== 1 ? 's' : ''}`)
  if (workflowStats) {
    parts[0] += ` using "${workflowStats.workflowName}" with ${Math.round(workflowStats.successRate * 100)}% success rate`
  }
  if (autonomyStats?.bestMode && autonomyStats.delta) {
    parts.push(
      `${autonomyStats.bestMode} mode had ${Math.round(autonomyStats.bestRate! * 100)}% success (+${autonomyStats.delta}% vs manual)`,
    )
  }
  if (memoryStats) {
    parts.push(
      `memory usage correlated with ${memoryStats.impactDelta > 0 ? '+' : ''}${memoryStats.impactDelta}% outcomes`,
    )
  }
  if (hasEffectiveness && stats.improved > 0) {
    parts.push(
      `historically helped ${stats.improved}/${stats.shown} time${stats.shown !== 1 ? 's' : ''}`,
    )
  }

  return {
    recommendationId: params.recommendationId,
    recommendationType: params.recommendationType,
    label: params.label,
    confidence: {
      baseHeuristic: Math.round(baseHeuristic * 100) / 100,
      effectiveness:
        effectivenessScore !== null ? Math.round(effectivenessScore * 100) / 100 : null,
      blended: Math.round(blended * 100) / 100,
      dataQuality,
    },
    similarRuns: similarRunEvidence,
    effectivenessStats: hasEffectiveness
      ? {
          shown: stats.shown,
          clicked: stats.clicked,
          improved: stats.improved,
          recovered: stats.recovered,
          acceptanceRate: Math.round(stats.acceptanceRate * 100) / 100,
          improvementRate: Math.round(stats.improvementRate * 100) / 100,
        }
      : null,
    workflowStats,
    autonomyStats,
    memoryStats,
    qualityStats,
    tradeoff:
      similarRuns.length > 0
        ? computeTradeoffVector(
            similarRuns.map((r) => ({
              status: r.run.status,
              durationMs: r.run.durationMs,
              stepCount: r.run.stepCount,
              qualityScore: r.run.qualityScore,
            })),
          )
        : null,
    explanationSummary: parts.join('. ') + '.',
  }
}

// ── Tradeoff Intelligence ─────────────────────────────────────────────

export interface TradeoffVector {
  quality: number // 0-1, from runQuality score
  speed: number // 0-1, normalized (faster = higher)
  stability: number // 0-1, normalized (fewer retries/failures = higher)
  complexity: number // 0-1, normalized (fewer steps = higher)
}

export type TradeoffDimension = keyof TradeoffVector

export interface TradeoffInsight {
  betterIn: TradeoffDimension[]
  worseIn: TradeoffDimension[]
  summary: string
}

export interface TradeoffComparison {
  vectorA: TradeoffVector
  vectorB: TradeoffVector
  delta: TradeoffVector // B - A (positive = B is better)
  insight: TradeoffInsight
}

const TRADEOFF_LABELS: Record<TradeoffDimension, { better: string; worse: string }> = {
  quality: { better: 'higher quality', worse: 'lower quality' },
  speed: { better: 'faster', worse: 'slower' },
  stability: { better: 'more stable', worse: 'less stable' },
  complexity: { better: 'simpler', worse: 'more complex' },
}

/**
 * Compute a normalized tradeoff vector for a set of runs.
 * Each dimension is 0-1 where higher = better.
 * Uses session-relative baselines for normalization.
 */
export function computeTradeoffVector(
  runs: Array<{
    status: string
    durationMs: number | null
    stepCount: number | null
    qualityScore: number | null
  }>,
  baselines?: { maxDurationMs: number; maxStepCount: number },
): TradeoffVector {
  // Quality: average quality score, fallback to success rate
  const qualityScores = runs.map((r) => r.qualityScore).filter((s): s is number => s != null)
  const quality =
    qualityScores.length > 0
      ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
      : runs.filter((r) => r.status === 'completed').length / Math.max(runs.length, 1)

  // Speed: normalized against baseline (lower duration = higher speed)
  const durations = runs.map((r) => r.durationMs).filter((d): d is number => d != null)
  const avgDuration =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null
  const maxD = baselines?.maxDurationMs ?? 30000 // fallback 30s
  const speed = avgDuration != null ? Math.max(0, Math.min(1, 1 - avgDuration / (maxD * 2))) : 0.5

  // Stability: based on failure rate + retry rate
  const failedCount = runs.filter((r) => r.status === 'failed').length
  const retriedCount = runs.filter((r) => r.status === 'retried').length
  const failureRate = (failedCount + retriedCount * 0.5) / Math.max(runs.length, 1)
  const stability = Math.max(0, Math.min(1, 1 - failureRate))

  // Complexity: normalized step count (fewer steps = higher simplicity)
  const stepCounts = runs.map((r) => r.stepCount).filter((s): s is number => s != null)
  const avgSteps =
    stepCounts.length > 0 ? stepCounts.reduce((a, b) => a + b, 0) / stepCounts.length : null
  const maxS = baselines?.maxStepCount ?? 20 // fallback 20 steps
  const complexity = avgSteps != null ? Math.max(0, Math.min(1, 1 - avgSteps / (maxS * 2))) : 0.5

  return {
    quality: Math.round(quality * 100) / 100,
    speed: Math.round(speed * 100) / 100,
    stability: Math.round(stability * 100) / 100,
    complexity: Math.round(complexity * 100) / 100,
  }
}

/**
 * Compare tradeoff vectors between two options.
 * Returns delta (B - A) and a human-readable insight.
 */
export function compareTradeoffs(
  vectorA: TradeoffVector,
  vectorB: TradeoffVector,
): TradeoffComparison {
  const delta: TradeoffVector = {
    quality: Math.round((vectorB.quality - vectorA.quality) * 100) / 100,
    speed: Math.round((vectorB.speed - vectorA.speed) * 100) / 100,
    stability: Math.round((vectorB.stability - vectorA.stability) * 100) / 100,
    complexity: Math.round((vectorB.complexity - vectorA.complexity) * 100) / 100,
  }

  const THRESHOLD = 0.05 // 5% minimum to count as different
  const dims: TradeoffDimension[] = ['quality', 'speed', 'stability', 'complexity']
  const betterIn = dims.filter((d) => delta[d] > THRESHOLD)
  const worseIn = dims.filter((d) => delta[d] < -THRESHOLD)

  // Build human-readable summary
  const betterParts = betterIn.map((d) => TRADEOFF_LABELS[d].better)
  const worseParts = worseIn.map((d) => TRADEOFF_LABELS[d].worse)

  let summary: string
  if (betterParts.length > 0 && worseParts.length > 0) {
    summary = `${betterParts.join(', ')} but ${worseParts.join(', ')}`
  } else if (betterParts.length > 0) {
    summary = `${betterParts.join(', ')}`
  } else if (worseParts.length > 0) {
    summary = `${worseParts.join(', ')}`
  } else {
    summary = 'similar tradeoffs'
  }

  return { vectorA, vectorB, delta, insight: { betterIn, worseIn, summary } }
}

/**
 * Summarize tradeoffs across multiple options.
 * Returns the best option per dimension.
 */
export function summarizeTradeoffs(options: Array<{ id: string; vector: TradeoffVector }>): {
  bestQuality: string | null
  fastest: string | null
  mostStable: string | null
  simplest: string | null
} {
  if (options.length === 0)
    return { bestQuality: null, fastest: null, mostStable: null, simplest: null }

  const best = (dim: TradeoffDimension) =>
    options.reduce((a, b) => (b.vector[dim] > a.vector[dim] ? b : a)).id

  return {
    bestQuality: best('quality'),
    fastest: best('speed'),
    mostStable: best('stability'),
    simplest: best('complexity'),
  }
}

// ── Best-Known Path Extraction ────────────────────────────────────────

export interface BestKnownPath {
  patternId: string
  agentSequence: string[]
  toolSequence: string[]
  stats: {
    totalRuns: number
    successRate: number
    avgQualityScore: number
    avgDurationMs: number | null
  }
  tradeoff: TradeoffVector
  sampleRunIds: string[]
}

function extractPattern(
  steps: Array<{
    sequence: number
    type: string
    agentName: string | null
    toolName: string | null
  }>,
) {
  const agents: string[] = []
  const tools: string[] = []
  const sorted = [...steps].sort((a, b) => a.sequence - b.sequence)
  for (const step of sorted) {
    if (step.type === 'agent' && step.agentName && !agents.includes(step.agentName)) {
      agents.push(step.agentName)
    }
    if (step.type === 'tool' && step.toolName) {
      tools.push(step.toolName)
    }
  }
  return { agents, tools }
}

function patternHash(agents: string[], tools: string[]): string {
  return JSON.stringify([agents, tools])
}

/**
 * Extract the best-known execution paths from similar runs.
 * Groups runs by agent+tool sequence pattern, ranks by quality-weighted success.
 */
export async function extractBestKnownPaths(
  db: Database,
  params: {
    sessionId: string
    userInput?: string
    agentIds?: string[]
    limit?: number
    decisionMode?: DecisionMode
  },
): Promise<BestKnownPath[]> {
  const limit = params.limit ?? 3
  const similarRuns = await findSimilarRuns(db, {
    sessionId: params.sessionId,
    userInput: params.userInput,
    agentIds: params.agentIds,
    limit: 20, // wider net for pattern grouping
  })

  if (similarRuns.length === 0) return []

  // Load steps for all similar runs
  const runIds = similarRuns.map((r) => r.runId)
  const allSteps = await db.query.chatRunSteps.findMany({
    where: sql`${chatRunSteps.runId} = ANY(${runIds})`,
  })

  // Group steps by run
  const stepsByRun = new Map<string, typeof allSteps>()
  for (const step of allSteps) {
    const existing = stepsByRun.get(step.runId) ?? []
    existing.push(step)
    stepsByRun.set(step.runId, existing)
  }

  // Extract patterns and group runs by pattern
  const patternGroups = new Map<
    string,
    { agents: string[]; tools: string[]; runs: SimilarRunMatch[] }
  >()
  for (const match of similarRuns) {
    const steps = stepsByRun.get(match.runId) ?? []
    if (steps.length === 0) continue
    const { agents, tools } = extractPattern(steps)
    const hash = patternHash(agents, tools)
    const group = patternGroups.get(hash) ?? { agents, tools, runs: [] }
    group.runs.push(match)
    patternGroups.set(hash, group)
  }

  // Compute stats and rank
  const paths: BestKnownPath[] = []
  for (const [hash, group] of patternGroups) {
    const { agents, tools, runs } = group
    if (runs.length < 1) continue
    const completed = runs.filter((r) => r.run.status === 'completed').length
    const successRate = runs.length > 0 ? completed / runs.length : 0
    const qualityScores = runs.map((r) => r.run.qualityScore).filter((s): s is number => s != null)
    const avgQuality =
      qualityScores.length > 0 ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : 0
    const durations = runs.map((r) => r.run.durationMs).filter((d): d is number => d != null)
    const avgDuration =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null

    // Compute tradeoff vector for this pattern's runs
    const tradeoffRuns = runs.map((r) => ({
      status: r.run.status,
      durationMs: r.run.durationMs,
      stepCount: r.run.stepCount,
      qualityScore: r.run.qualityScore,
    }))
    const tradeoff = computeTradeoffVector(tradeoffRuns)

    paths.push({
      patternId: hash,
      agentSequence: agents,
      toolSequence: tools,
      stats: {
        totalRuns: runs.length,
        successRate: Math.round(successRate * 100) / 100,
        avgQualityScore: Math.round(avgQuality * 100) / 100,
        avgDurationMs: avgDuration,
      },
      tradeoff,
      sampleRunIds: runs.slice(0, 3).map((r) => r.runId),
    })
  }

  // Rank by decision-mode-aware tradeoff weights
  const pw = getPathRankWeights(params.decisionMode ?? 'balanced')
  paths.sort((a, b) => {
    const scoreA =
      a.tradeoff.quality * pw.quality +
      a.tradeoff.speed * pw.speed +
      a.tradeoff.stability * pw.stability +
      a.tradeoff.complexity * pw.complexity
    const scoreB =
      b.tradeoff.quality * pw.quality +
      b.tradeoff.speed * pw.speed +
      b.tradeoff.stability * pw.stability +
      b.tradeoff.complexity * pw.complexity
    return scoreB - scoreA
  })

  return paths.slice(0, limit)
}

// ── Run Quality Scoring ───────────────────────────────────────────────

export interface RunQualityResult {
  score: number
  label: 'high' | 'medium' | 'low'
  components: {
    success: number
    efficiency: number
    stability: number
    consistency: number
  }
  explanation: string
}

/**
 * Compute an absolute quality score for a run.
 * Deterministic, no LLM dependency, grounded in execution data.
 * Returns null for runs still in 'running' state.
 */
export async function computeRunQualityScore(
  db: Database,
  runId: string,
): Promise<RunQualityResult | null> {
  const run = await db.query.chatRuns.findFirst({ where: eq(chatRuns.id, runId) })
  if (!run || run.status === 'running') return null

  const steps = await db.query.chatRunSteps.findMany({
    where: eq(chatRunSteps.runId, runId),
  })

  // 1. Success Score (weight 0.40)
  let successScore = 0
  if (run.status === 'completed') {
    successScore = 1.0
    const failedSteps = steps.filter((s) => s.status === 'failed')
    if (failedSteps.length === 0 && run.completedAt) successScore = 1.0 // clean
  } else if (run.status === 'retried') {
    successScore = 0.5
  } else {
    successScore = 0.0
  }

  // 2. Efficiency Score (weight 0.25) — normalized against session baseline
  let efficiencyScore = 0.5
  const baselineRuns = await db.query.chatRuns.findMany({
    where: and(eq(chatRuns.sessionId, run.sessionId), eq(chatRuns.status, 'completed')),
    orderBy: desc(chatRuns.startedAt),
    limit: 20,
  })
  const baselineDurations = baselineRuns
    .map((r) => r.durationMs)
    .filter((d): d is number => d != null)
  const baselineSteps = baselineRuns.map((r) => r.stepCount).filter((s): s is number => s != null)

  if (baselineDurations.length >= 2 && run.durationMs != null) {
    const avgDuration = baselineDurations.reduce((a, b) => a + b, 0) / baselineDurations.length
    const durationScore =
      avgDuration > 0 ? Math.max(0, Math.min(1, 1 - run.durationMs / (avgDuration * 2))) : 0.5
    const avgSteps =
      baselineSteps.length > 0
        ? baselineSteps.reduce((a, b) => a + b, 0) / baselineSteps.length
        : null
    const stepScore =
      avgSteps && (run.stepCount ?? 0) > 0
        ? Math.max(0, Math.min(1, 1 - (run.stepCount ?? 0) / (avgSteps * 2)))
        : 0.5
    efficiencyScore = durationScore * 0.6 + stepScore * 0.4
  }

  // 3. Stability Score (weight 0.20)
  let stabilityScore = 1.0
  if (run.retryOfRunId) {
    // This is a retry
    const parentRun = await db.query.chatRuns.findFirst({
      where: eq(chatRuns.id, run.retryOfRunId),
    })
    if (run.status === 'completed' && parentRun?.status === 'failed') {
      stabilityScore = 0.7 // recovered
    } else if (run.status === 'completed') {
      stabilityScore = 0.8 // retry that succeeded (parent may not have failed)
    } else {
      stabilityScore = 0.3 // retry that didn't help
    }
  } else if (run.status === 'failed') {
    stabilityScore = 0.0
  } else {
    const failedSteps = steps.filter((s) => s.status === 'failed')
    if (failedSteps.length > 0 && run.status === 'completed') {
      stabilityScore = 0.6 // completed despite some failed steps
    }
  }

  // 4. Consistency Score (weight 0.15) — pattern match with successful runs
  let consistencyScore = 0.5
  const successfulRuns = baselineRuns.filter((r) => r.id !== runId)
  if (successfulRuns.length > 0) {
    const runAgents = (run.agentIds ?? []).filter(Boolean)
    const similarities = successfulRuns.slice(0, 3).map((sr) => {
      const srAgents = (sr.agentIds ?? []).filter(Boolean)
      return agentOverlap(runAgents, srAgents)
    })
    consistencyScore =
      similarities.length > 0 ? similarities.reduce((a, b) => a + b, 0) / similarities.length : 0.5
  }

  // Composite
  const score =
    Math.round(
      (successScore * 0.4 +
        efficiencyScore * 0.25 +
        stabilityScore * 0.2 +
        consistencyScore * 0.15) *
        100,
    ) / 100

  const label: RunQualityResult['label'] = score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low'

  // Build explanation from components
  const explParts: string[] = []
  if (run.status === 'completed') explParts.push('completed successfully')
  else if (run.status === 'failed') explParts.push('failed')
  else explParts.push(run.status)
  if (efficiencyScore > 0.6) explParts.push('efficient execution')
  else if (efficiencyScore < 0.4) explParts.push('below-average efficiency')
  if (stabilityScore >= 1.0) explParts.push('no retries needed')
  else if (stabilityScore >= 0.7) explParts.push('recovered via retry')
  else if (stabilityScore < 0.4) explParts.push('unstable execution')
  if (consistencyScore > 0.6) explParts.push('consistent pattern')
  else if (consistencyScore < 0.4) explParts.push('new pattern')

  const explanation = `${label.charAt(0).toUpperCase() + label.slice(1)} quality: ${explParts.join(', ')}`

  // Persist
  const values = {
    runId,
    score,
    label,
    successScore,
    efficiencyScore,
    stabilityScore,
    consistencyScore,
    explanation,
    computedAt: new Date(),
  }

  const existing = await db.query.runQuality.findFirst({ where: eq(runQuality.runId, runId) })
  if (existing) {
    await db.update(runQuality).set(values).where(eq(runQuality.runId, runId))
  } else {
    await db.insert(runQuality).values(values)
  }

  return {
    score,
    label,
    components: {
      success: successScore,
      efficiency: efficiencyScore,
      stability: stabilityScore,
      consistency: consistencyScore,
    },
    explanation,
  }
}
