/**
 * Evolution Analyzer — observes agent performance and extracts failure patterns.
 *
 * Inspired by A-Evolve's adaptive_evolve per-claim feedback analysis.
 * Uses real run data (chatRuns, runQuality, chatRunSteps, instinctObservations)
 * to identify what an agent is doing poorly and why.
 */

import type { Database } from '@solarc/db'
import { agents, chatRuns, chatRunSteps, instincts, runQuality } from '@solarc/db'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export interface FailurePattern {
  pattern: string
  count: number
  severity: 'low' | 'medium' | 'high'
  examples: string[]
}

export interface AnalysisResult {
  agentId: string
  agentName: string
  currentSoul: string
  observedRuns: number
  avgScore: number
  successRate: number
  failurePatterns: FailurePattern[]
  strengths: string[]
  weaknesses: string[]
  recentInstincts: Array<{ trigger: string; action: string; confidence: number }>
  recommendation: 'evolve' | 'stable' | 'insufficient_data'
}

// ── Analyzer ──────────────────────────────────────────────────────────

/**
 * Analyze an agent's recent performance to determine if evolution is warranted.
 * Looks at the last `windowDays` days of runs.
 */
export async function analyzeAgentPerformance(
  db: Database,
  agentId: string,
  windowDays: number = 7,
): Promise<AnalysisResult | null> {
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) return null

  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

  // Get recent steps for this agent
  const recentSteps = await db.query.chatRunSteps.findMany({
    where: and(eq(chatRunSteps.agentId, agentId), gte(chatRunSteps.startedAt, cutoff)),
    orderBy: desc(chatRunSteps.startedAt),
    limit: 500,
  })

  const runIds = [...new Set(recentSteps.map((s) => s.runId))]
  if (runIds.length < 3) {
    return {
      agentId,
      agentName: agent.name,
      currentSoul: agent.soul ?? '',
      observedRuns: runIds.length,
      avgScore: 0,
      successRate: 0,
      failurePatterns: [],
      strengths: [],
      weaknesses: [],
      recentInstincts: [],
      recommendation: 'insufficient_data',
    }
  }

  // Get run statuses and quality scores
  const runs = await db
    .select({
      id: chatRuns.id,
      status: chatRuns.status,
      durationMs: chatRuns.durationMs,
      score: runQuality.score,
      successScore: runQuality.successScore,
      efficiencyScore: runQuality.efficiencyScore,
      explanation: runQuality.explanation,
    })
    .from(chatRuns)
    .leftJoin(runQuality, eq(chatRuns.id, runQuality.runId))
    .where(sql`${chatRuns.id} = ANY(${runIds})`)

  const completedRuns = runs.filter((r) => r.status === 'completed')
  const scoredRuns = runs.filter((r) => r.score !== null)

  const successRate = runs.length > 0 ? completedRuns.length / runs.length : 0
  const avgScore =
    scoredRuns.length > 0
      ? scoredRuns.reduce((sum, r) => sum + (r.score ?? 0), 0) / scoredRuns.length
      : 0

  // Extract failure patterns from failed steps
  const failedSteps = recentSteps.filter((s) => s.status === 'failed')
  const patternMap = new Map<string, { count: number; examples: string[] }>()

  for (const step of failedSteps) {
    const result = (step.toolResult ?? '').slice(0, 200)
    // Categorize failure
    let pattern = 'unknown_failure'
    if (result.includes('timeout')) pattern = 'timeout'
    else if (result.includes('not found') || result.includes('404')) pattern = 'resource_not_found'
    else if (result.includes('permission') || result.includes('403')) pattern = 'permission_denied'
    else if (result.includes('rate limit') || result.includes('429')) pattern = 'rate_limited'
    else if (result.includes('error')) pattern = 'execution_error'
    else if (step.toolName) pattern = `tool_failure:${step.toolName}`

    const existing = patternMap.get(pattern) ?? { count: 0, examples: [] }
    existing.count++
    if (existing.examples.length < 3) existing.examples.push(result)
    patternMap.set(pattern, existing)
  }

  // Also look at low-quality explanations for patterns
  for (const run of runs) {
    if (run.score !== null && run.score < 0.4 && run.explanation) {
      const explanation = run.explanation.slice(0, 200)
      const pattern = 'low_quality_output'
      const existing = patternMap.get(pattern) ?? { count: 0, examples: [] }
      existing.count++
      if (existing.examples.length < 3) existing.examples.push(explanation)
      patternMap.set(pattern, existing)
    }
  }

  const failurePatterns: FailurePattern[] = [...patternMap.entries()]
    .map(([pattern, data]) => ({
      pattern,
      count: data.count,
      severity: (data.count >= 5 ? 'high' : data.count >= 2 ? 'medium' : 'low') as
        | 'low'
        | 'medium'
        | 'high',
      examples: data.examples,
    }))
    .sort((a, b) => b.count - a.count)

  // Identify strengths (high-performing tool usage)
  const toolSuccessRate = new Map<string, { success: number; total: number }>()
  for (const step of recentSteps) {
    if (!step.toolName) continue
    const entry = toolSuccessRate.get(step.toolName) ?? { success: 0, total: 0 }
    entry.total++
    if (step.status === 'completed') entry.success++
    toolSuccessRate.set(step.toolName, entry)
  }

  const strengths = [...toolSuccessRate.entries()]
    .filter(([, v]) => v.total >= 3 && v.success / v.total >= 0.8)
    .map(([tool, v]) => `${tool}: ${Math.round((v.success / v.total) * 100)}% success`)

  const weaknesses = [...toolSuccessRate.entries()]
    .filter(([, v]) => v.total >= 3 && v.success / v.total < 0.5)
    .map(([tool, v]) => `${tool}: ${Math.round((v.success / v.total) * 100)}% success`)

  // Get recent instincts for this agent
  const recentInstincts = await db.query.instincts.findMany({
    where: eq(instincts.entityId, agentId),
    orderBy: desc(instincts.lastObservedAt),
    limit: 10,
  })

  // Determine recommendation
  let recommendation: 'evolve' | 'stable' | 'insufficient_data' = 'stable'
  if (scoredRuns.length < 5) {
    recommendation = 'insufficient_data'
  } else if (
    avgScore < 0.5 ||
    successRate < 0.6 ||
    failurePatterns.some((p) => p.severity === 'high')
  ) {
    recommendation = 'evolve'
  }

  return {
    agentId,
    agentName: agent.name,
    currentSoul: agent.soul ?? '',
    observedRuns: runs.length,
    avgScore,
    successRate,
    failurePatterns,
    strengths,
    weaknesses,
    recentInstincts: recentInstincts.map((i) => ({
      trigger: i.trigger,
      action: i.action,
      confidence: i.confidence,
    })),
    recommendation,
  }
}
