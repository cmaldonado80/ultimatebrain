/**
 * Agent Scorecard — compute performance metrics from real execution data.
 *
 * Uses chatRunSteps.agentId to attribute performance to specific agents,
 * joined with chatRuns (status, duration) and runQuality (score, label).
 *
 * Also auto-updates agentTrustScores with computed factors.
 */

import type { Database } from '@solarc/db'
import { agents, agentTrustScores, chatRuns, chatRunSteps, runQuality } from '@solarc/db'
import { desc, eq, sql } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export interface AgentScorecard {
  agentId: string
  agentName: string
  workspaceId: string | null
  totalRuns: number
  completedRuns: number
  failedRuns: number
  successRate: number
  avgQualityScore: number | null
  avgDurationMs: number | null
  retryRecoveryRate: number | null
  trend: 'improving' | 'stable' | 'declining' | null
  totalSteps: number
  dataConfidence: 'strong' | 'moderate' | 'early' | 'none'
}

// ── Computation ───────────────────────────────────────────────────────

/**
 * Compute a performance scorecard for a single agent from real run data.
 * Returns null if agent not found.
 */
export async function computeAgentScorecard(
  db: Database,
  agentId: string,
): Promise<AgentScorecard | null> {
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) return null

  // Get all steps this agent executed
  const steps = await db.query.chatRunSteps.findMany({
    where: eq(chatRunSteps.agentId, agentId),
    orderBy: desc(chatRunSteps.startedAt),
    limit: 500,
  })

  const totalSteps = steps.length

  // Get unique run IDs from steps
  const runIds = [...new Set(steps.map((s) => s.runId))]
  if (runIds.length === 0) {
    return {
      agentId,
      agentName: agent.name,
      workspaceId: agent.workspaceId,
      totalRuns: 0,
      completedRuns: 0,
      failedRuns: 0,
      successRate: 0,
      avgQualityScore: null,
      avgDurationMs: null,
      retryRecoveryRate: null,
      trend: null,
      totalSteps: 0,
      dataConfidence: 'none',
    }
  }

  // Load runs
  const runs =
    runIds.length > 0
      ? await db.query.chatRuns.findMany({
          where: sql`${chatRuns.id} = ANY(${runIds})`,
        })
      : []

  const nonRunning = runs.filter((r) => r.status !== 'running')
  const completed = nonRunning.filter((r) => r.status === 'completed')
  const failed = nonRunning.filter((r) => r.status === 'failed')
  const totalRuns = nonRunning.length
  const successRate = totalRuns > 0 ? Math.round((completed.length / totalRuns) * 100) / 100 : 0

  // Quality scores
  const qualities =
    runIds.length > 0
      ? await db.query.runQuality.findMany({
          where: sql`${runQuality.runId} = ANY(${runIds})`,
        })
      : []
  const qualityScores = qualities.map((q) => q.score)
  const avgQualityScore =
    qualityScores.length > 0
      ? Math.round((qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length) * 100) / 100
      : null

  // Duration (from steps)
  const stepDurations = steps.map((s) => s.durationMs).filter((d): d is number => d != null)
  const avgDurationMs =
    stepDurations.length > 0
      ? Math.round(stepDurations.reduce((a, b) => a + b, 0) / stepDurations.length)
      : null

  // Retry recovery rate
  const retryRuns = runs.filter((r) => r.retryOfRunId)
  const retryRecovered = retryRuns.filter((r) => r.status === 'completed').length
  const retryRecoveryRate =
    retryRuns.length > 0 ? Math.round((retryRecovered / retryRuns.length) * 100) / 100 : null

  // Trend: compare recent 3 quality scores vs earlier 3
  let trend: AgentScorecard['trend'] = null
  if (qualityScores.length >= 6) {
    const recent = qualityScores.slice(0, 3).reduce((a, b) => a + b, 0) / 3
    const earlier = qualityScores.slice(-3).reduce((a, b) => a + b, 0) / 3
    const delta = recent - earlier
    trend = delta > 0.1 ? 'improving' : delta < -0.1 ? 'declining' : 'stable'
  }

  // Data confidence
  const dataConfidence: AgentScorecard['dataConfidence'] =
    totalRuns >= 10 ? 'strong' : totalRuns >= 3 ? 'moderate' : totalRuns >= 1 ? 'early' : 'none'

  // Auto-update agentTrustScores with computed factors
  try {
    const factors = {
      taskCompletionRate: successRate,
      errorRate: totalRuns > 0 ? failed.length / totalRuns : 0,
      avgResponseTime: avgDurationMs ?? 5000,
      guardrailViolations: 0, // Not tracked here — kept from existing
      userRating: avgQualityScore ?? 0.5,
    }
    const score =
      factors.taskCompletionRate * 0.3 +
      (1 - factors.errorRate) * 0.2 +
      Math.min(1, 5000 / factors.avgResponseTime) * 0.15 +
      (1 - Math.min(1, factors.guardrailViolations / 10)) * 0.15 +
      factors.userRating * 0.2

    const existing = await db.query.agentTrustScores.findFirst({
      where: eq(agentTrustScores.agentId, agentId),
    })
    if (existing) {
      await db
        .update(agentTrustScores)
        .set({ score: Math.round(score * 100) / 100, factors, updatedAt: new Date() })
        .where(eq(agentTrustScores.agentId, agentId))
    } else {
      await db
        .insert(agentTrustScores)
        .values({ agentId, score: Math.round(score * 100) / 100, factors })
    }
  } catch {
    // Trust score update is non-blocking
  }

  return {
    agentId,
    agentName: agent.name,
    workspaceId: agent.workspaceId,
    totalRuns,
    completedRuns: completed.length,
    failedRuns: failed.length,
    successRate,
    avgQualityScore,
    avgDurationMs,
    retryRecoveryRate,
    trend,
    totalSteps,
    dataConfidence,
  }
}
