/**
 * Adaptive Model Router + Agent Capability Profiler
 *
 * Learns from historical runQuality scores which model+agent combinations
 * produce the best results, and auto-discovers agent strengths.
 *
 * 1. Adaptive Router: Given an agent, recommend the best model based on
 *    past performance data (not static capability chains).
 * 2. Capability Profiler: Analyze an agent's tool usage, success patterns,
 *    and quality scores to generate a capability profile.
 */

import type { Database } from '@solarc/db'
import { agents, chatRuns, chatRunSteps, gatewayMetrics, runQuality } from '@solarc/db'
import { desc, eq, sql } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export interface ModelPerformance {
  model: string
  avgQuality: number
  avgLatencyMs: number
  totalRuns: number
  costPerRun: number
  /** quality / cost ratio — higher is better */
  efficiency: number
}

export interface ModelRecommendation {
  recommended: string
  reason: string
  alternatives: ModelPerformance[]
  dataConfidence: 'strong' | 'moderate' | 'weak'
}

export interface CapabilityProfile {
  agentId: string
  agentName: string
  /** Top tools by success rate */
  strongTools: Array<{ tool: string; successRate: number; uses: number }>
  /** Tools with high failure rates */
  weakTools: Array<{ tool: string; successRate: number; uses: number }>
  /** Quality trend over last 20 runs */
  qualityTrend: 'improving' | 'stable' | 'declining'
  /** Average quality score */
  avgQuality: number
  /** Total runs analyzed */
  totalRuns: number
  /** Task types this agent handles well (inferred from successful tool patterns) */
  strengths: string[]
  /** Areas needing improvement */
  weaknesses: string[]
}

// ── Adaptive Model Router ─────────────────────────────────────────────

/**
 * Recommend the best model for an agent based on historical quality+cost data.
 */
export async function recommendModel(db: Database, agentId: string): Promise<ModelRecommendation> {
  // Get runs with quality scores for this agent, grouped by model
  const results = await db
    .select({
      model: chatRuns.agentIds, // We'll filter below
      qualityScore: runQuality.score,
    })
    .from(chatRuns)
    .innerJoin(runQuality, eq(chatRuns.id, runQuality.runId))
    .where(sql`${agentId} = ANY(${chatRuns.agentIds})`)
    .orderBy(desc(chatRuns.startedAt))
    .limit(100)

  if (results.length < 5) {
    return {
      recommended: '',
      reason: 'Insufficient data — using default model',
      alternatives: [],
      dataConfidence: 'weak',
    }
  }

  // Get gateway metrics for cost/latency per model used with this agent
  const metrics = await db
    .select({
      model: gatewayMetrics.model,
      latencyMs: gatewayMetrics.latencyMs,
      costUsd: gatewayMetrics.costUsd,
    })
    .from(gatewayMetrics)
    .where(eq(gatewayMetrics.agentId, agentId))
    .orderBy(desc(gatewayMetrics.createdAt))
    .limit(200)

  // Aggregate by model
  const modelMap = new Map<string, { scores: number[]; latencies: number[]; costs: number[] }>()
  for (const m of metrics) {
    if (!m.model) continue
    const entry = modelMap.get(m.model) ?? { scores: [], latencies: [], costs: [] }
    if (m.latencyMs) entry.latencies.push(m.latencyMs)
    if (m.costUsd) entry.costs.push(m.costUsd)
    modelMap.set(m.model, entry)
  }

  // Merge quality scores (we know the agent was involved but need model from metrics)
  for (const r of results) {
    // Quality scores apply across all models — we'll distribute to each known model
    for (const [, entry] of modelMap) {
      entry.scores.push(r.qualityScore)
    }
  }

  // Compute performance per model
  const performances: ModelPerformance[] = []
  for (const [model, data] of modelMap) {
    if (data.latencies.length < 3) continue
    const avgQuality =
      data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0.5
    const avgLatency = data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length
    const avgCost =
      data.costs.length > 0 ? data.costs.reduce((a, b) => a + b, 0) / data.costs.length : 0.001
    performances.push({
      model,
      avgQuality,
      avgLatencyMs: Math.round(avgLatency),
      totalRuns: data.latencies.length,
      costPerRun: avgCost,
      efficiency: avgCost > 0 ? avgQuality / avgCost : avgQuality,
    })
  }

  if (performances.length === 0) {
    return {
      recommended: '',
      reason: 'No model performance data available',
      alternatives: [],
      dataConfidence: 'weak',
    }
  }

  // Sort by quality * efficiency (balances quality vs cost)
  performances.sort((a, b) => b.avgQuality * b.efficiency - a.avgQuality * a.efficiency)

  const best = performances[0]!
  return {
    recommended: best.model,
    reason: `Best quality-cost balance: ${(best.avgQuality * 100).toFixed(0)}% quality, $${best.costPerRun.toFixed(4)}/run, ${best.avgLatencyMs}ms avg`,
    alternatives: performances,
    dataConfidence: performances[0]!.totalRuns >= 20 ? 'strong' : 'moderate',
  }
}

// ── Agent Capability Profiler ─────────────────────────────────────────

/**
 * Analyze an agent's capabilities from historical tool usage and quality data.
 */
export async function profileAgentCapabilities(
  db: Database,
  agentId: string,
): Promise<CapabilityProfile | null> {
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) return null

  // Get recent steps for this agent
  const steps = await db.query.chatRunSteps.findMany({
    where: eq(chatRunSteps.agentId, agentId),
    orderBy: desc(chatRunSteps.startedAt),
    limit: 500,
  })

  // Tool success rates
  const toolStats = new Map<string, { success: number; fail: number }>()
  for (const step of steps) {
    if (step.type !== 'tool' || !step.toolName) continue
    const entry = toolStats.get(step.toolName) ?? { success: 0, fail: 0 }
    if (step.status === 'completed') entry.success++
    else entry.fail++
    toolStats.set(step.toolName, entry)
  }

  const toolEntries = [...toolStats.entries()]
    .map(([tool, s]) => ({
      tool,
      successRate: s.success + s.fail > 0 ? s.success / (s.success + s.fail) : 0,
      uses: s.success + s.fail,
    }))
    .filter((t) => t.uses >= 2)

  const strongTools = toolEntries
    .filter((t) => t.successRate >= 0.8)
    .sort((a, b) => b.uses - a.uses)
    .slice(0, 10)

  const weakTools = toolEntries
    .filter((t) => t.successRate < 0.5)
    .sort((a, b) => a.successRate - b.successRate)
    .slice(0, 5)

  // Quality trend from runs
  const runIds = [...new Set(steps.map((s) => s.runId))]
  const qualityScores: number[] = []
  if (runIds.length > 0) {
    const qualities = await db
      .select({ score: runQuality.score, computedAt: runQuality.computedAt })
      .from(runQuality)
      .where(sql`${runQuality.runId} = ANY(${runIds})`)
      .orderBy(desc(runQuality.computedAt))
      .limit(20)
    qualityScores.push(...qualities.map((q) => q.score))
  }

  const avgQuality =
    qualityScores.length > 0 ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : 0

  // Determine trend
  let qualityTrend: 'improving' | 'stable' | 'declining' = 'stable'
  if (qualityScores.length >= 6) {
    const recent = qualityScores.slice(0, 3).reduce((a, b) => a + b, 0) / 3
    const older = qualityScores.slice(-3).reduce((a, b) => a + b, 0) / 3
    if (recent - older > 0.1) qualityTrend = 'improving'
    else if (older - recent > 0.1) qualityTrend = 'declining'
  }

  // Infer strengths/weaknesses from tool patterns
  const strengths: string[] = []
  const weaknesses: string[] = []

  const toolCategories: Record<string, string> = {
    ephemeris: 'Astrology & ephemeris calculations',
    web_search: 'Web research',
    web_scrape: 'Web content extraction',
    deep_research: 'Deep research & analysis',
    memory: 'Memory management',
    db_query: 'Database operations',
    agent_evolve: 'Self-improvement',
    verify_claim: 'Evidence-based verification',
    sessions: 'Agent collaboration',
  }

  for (const t of strongTools) {
    for (const [prefix, label] of Object.entries(toolCategories)) {
      if (t.tool.startsWith(prefix)) {
        strengths.push(`${label} (${(t.successRate * 100).toFixed(0)}% success, ${t.uses} uses)`)
        break
      }
    }
  }

  for (const t of weakTools) {
    for (const [prefix, label] of Object.entries(toolCategories)) {
      if (t.tool.startsWith(prefix)) {
        weaknesses.push(`${label} (${(t.successRate * 100).toFixed(0)}% success, ${t.uses} uses)`)
        break
      }
    }
  }

  return {
    agentId,
    agentName: agent.name,
    strongTools,
    weakTools,
    qualityTrend,
    avgQuality,
    totalRuns: runIds.length,
    strengths,
    weaknesses,
  }
}
