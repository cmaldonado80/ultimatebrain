/**
 * Recommendation Engine — evidence-based workflow intelligence.
 *
 * Uses historical run/workflow/memory/autonomy data to produce
 * explainable, confidence-scored recommendations. Rule-based,
 * no black-box ML. Every recommendation includes evidence.
 */

import type { Database } from '@solarc/db'
import { chatMessages, chatRuns, chatRunSteps, workflowInsights } from '@solarc/db'
import { and, desc, eq, ne, not, sql } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

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
    const confidence = Math.min(sampleBonus + successBonus + similarityBonus, 1)

    if (confidence >= 0.3) {
      recommendations.push({
        id: `wf-${runs[0]?.run.workflowId ?? workflowKey}`,
        type: 'workflow',
        label: `Use Workflow: "${workflowKey}"`,
        explanation: `${total} similar run${total !== 1 ? 's' : ''}, ${Math.round(successRate * 100)}% success rate${avgDuration ? `, avg ${(avgDuration / 1000).toFixed(1)}s` : ''}`,
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
