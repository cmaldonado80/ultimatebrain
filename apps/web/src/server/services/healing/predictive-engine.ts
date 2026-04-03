/**
 * Predictive Healing Engine
 *
 * Trend analysis and forecasting to intervene BEFORE failures happen.
 *
 * Architecture:
 * 1. Time-series collection — sliding windows of health metrics
 * 2. Trend detection — linear regression on failure rates, latencies, error counts
 * 3. Anomaly scoring — deviation from rolling baseline
 * 4. Forecasting — project metric trajectory to predict breach time
 * 5. Proactive intervention — trigger healing before threshold is hit
 */

import type { Database } from '@solarc/db'
import { agents, healingLogs, tickets } from '@solarc/db'
import { and, eq, gte, sql } from 'drizzle-orm'

// ── Types ────────────────────────────────────────────────────────────────

export interface MetricSample {
  timestamp: number
  value: number
}

export interface TrendAnalysis {
  metric: string
  slope: number // positive = worsening, negative = improving
  current: number
  baseline: number
  anomalyScore: number // 0-1, higher = more anomalous
  predictedBreachIn: number | null // ms until threshold breach, null = safe
  confidence: number // 0-1
}

export interface PredictiveReport {
  timestamp: Date
  trends: TrendAnalysis[]
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  interventions: PredictiveIntervention[]
}

export interface PredictiveIntervention {
  metric: string
  action: string
  reason: string
  urgency: 'deferred' | 'soon' | 'immediate'
  estimatedImpact: string
}

// ── Configuration ────────────────────────────────────────────────────────

const WINDOW_SIZE = 12 // 12 samples per metric
const SAMPLE_INTERVAL_MS = 5 * 60 * 1000 // 5 min per sample = 1 hour window
const ANOMALY_THRESHOLD = 0.7
const BREACH_HORIZON_MS = 30 * 60 * 1000 // predict 30 min ahead

const METRIC_THRESHOLDS: Record<string, number> = {
  'agent.error_rate': 0.3, // 30% of agents in error = critical
  'ticket.failure_rate': 0.2, // 20% ticket failure rate
  'ticket.stuck_count': 5,
  'entity.degraded_ratio': 0.25,
  'healing.action_rate': 10, // >10 healing actions/hour = system thrashing
}

// ── Sliding Window Store ─────────────────────────────────────────────────

class MetricStore {
  private windows = new Map<string, MetricSample[]>()

  push(metric: string, value: number) {
    const samples = this.windows.get(metric) ?? []
    samples.push({ timestamp: Date.now(), value })
    // Keep only the window
    while (samples.length > WINDOW_SIZE) samples.shift()
    this.windows.set(metric, samples)
  }

  get(metric: string): MetricSample[] {
    return this.windows.get(metric) ?? []
  }

  getAllMetrics(): string[] {
    return Array.from(this.windows.keys())
  }

  getSnapshot(): Record<string, MetricSample[]> {
    const out: Record<string, MetricSample[]> = {}
    for (const [k, v] of this.windows) out[k] = [...v]
    return out
  }
}

// ── Math Utilities ───────────────────────────────────────────────────────

function linearRegression(samples: MetricSample[]): {
  slope: number
  intercept: number
  r2: number
} {
  if (samples.length < 2) return { slope: 0, intercept: samples[0]?.value ?? 0, r2: 0 }

  const n = samples.length
  const t0 = samples[0]!.timestamp
  const xs = samples.map((s) => (s.timestamp - t0) / 1000) // seconds from start
  const ys = samples.map((s) => s.value)

  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i]!, 0)
  const sumX2 = xs.reduce((a, x) => a + x * x, 0)
  const sumY2 = ys.reduce((a, y) => a + y * y, 0)

  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 }

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  // R² for confidence
  const yMean = sumY / n
  const ssTot = sumY2 - n * yMean * yMean
  const ssRes = ys.reduce((a, y, i) => {
    const predicted = slope * xs[i]! + intercept
    return a + (y - predicted) ** 2
  }, 0)
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot

  return { slope, intercept, r2: Math.max(0, r2) }
}

function rollingMean(samples: MetricSample[]): number {
  if (samples.length === 0) return 0
  return samples.reduce((a, s) => a + s.value, 0) / samples.length
}

function rollingStdDev(samples: MetricSample[], mean: number): number {
  if (samples.length < 2) return 0
  const variance = samples.reduce((a, s) => a + (s.value - mean) ** 2, 0) / (samples.length - 1)
  return Math.sqrt(variance)
}

// ── Predictive Engine ────────────────────────────────────────────────────

export class PredictiveHealingEngine {
  private store = new MetricStore()
  private lastCollect = 0

  constructor(private db: Database) {}

  /**
   * Collect current metrics from DB into the sliding window.
   */
  async collectMetrics(): Promise<void> {
    const now = Date.now()
    // Throttle collection to SAMPLE_INTERVAL
    if (now - this.lastCollect < SAMPLE_INTERVAL_MS * 0.8) return
    this.lastCollect = now

    const oneHourAgo = new Date(now - 60 * 60 * 1000)

    // Agent error rate
    const [totalAgents, errorAgents] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)` }).from(agents),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(agents)
        .where(eq(agents.status, 'error')),
    ])
    const total = totalAgents[0]?.count ?? 0
    const errCount = errorAgents[0]?.count ?? 0
    this.store.push('agent.error_rate', total > 0 ? errCount / total : 0)

    // Ticket failure rate (last hour)
    const [recentTotal, recentFailed] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(tickets)
        .where(gte(tickets.updatedAt, oneHourAgo)),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(tickets)
        .where(and(eq(tickets.status, 'failed'), gte(tickets.updatedAt, oneHourAgo))),
    ])
    const rt = recentTotal[0]?.count ?? 0
    const rf = recentFailed[0]?.count ?? 0
    this.store.push('ticket.failure_rate', rt > 0 ? rf / rt : 0)

    // Stuck ticket count
    const stuckThreshold = new Date(now - 2 * 60 * 60 * 1000)
    const stuck = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(tickets)
      .where(and(eq(tickets.status, 'in_progress'), sql`${tickets.updatedAt} < ${stuckThreshold}`))
    this.store.push('ticket.stuck_count', stuck[0]?.count ?? 0)

    // Healing action rate (last hour)
    const healingActions = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(healingLogs)
      .where(gte(healingLogs.createdAt, oneHourAgo))
    this.store.push('healing.action_rate', healingActions[0]?.count ?? 0)
  }

  /**
   * Analyze trends across all tracked metrics.
   */
  analyzeTrends(): TrendAnalysis[] {
    const trends: TrendAnalysis[] = []

    for (const metric of this.store.getAllMetrics()) {
      const samples = this.store.get(metric)
      if (samples.length < 3) continue

      const { slope, r2 } = linearRegression(samples)
      const current = samples[samples.length - 1]!.value
      const baseline = rollingMean(samples.slice(0, Math.max(1, samples.length - 3)))
      const stdDev = rollingStdDev(samples, baseline)

      // Anomaly: how many standard deviations from baseline
      const deviation = stdDev > 0 ? Math.abs(current - baseline) / stdDev : 0
      const anomalyScore = Math.min(1, deviation / 3) // 3σ = score 1.0

      // Predict breach time
      const threshold = METRIC_THRESHOLDS[metric]
      let predictedBreachIn: number | null = null
      if (threshold !== undefined && slope > 0 && current < threshold) {
        const secondsToThreshold = (threshold - current) / slope
        const msToThreshold = secondsToThreshold * 1000
        if (msToThreshold > 0 && msToThreshold < BREACH_HORIZON_MS) {
          predictedBreachIn = msToThreshold
        }
      }

      trends.push({
        metric,
        slope,
        current,
        baseline,
        anomalyScore,
        predictedBreachIn,
        confidence: r2,
      })
    }

    return trends
  }

  /**
   * Generate proactive interventions based on trend analysis.
   */
  generateInterventions(trends: TrendAnalysis[]): PredictiveIntervention[] {
    const interventions: PredictiveIntervention[] = []

    for (const trend of trends) {
      // Predicted breach — proactive intervention
      if (trend.predictedBreachIn !== null && trend.confidence > 0.5) {
        const minutesUntil = Math.round(trend.predictedBreachIn / 60000)
        const urgency: PredictiveIntervention['urgency'] =
          minutesUntil < 5 ? 'immediate' : minutesUntil < 15 ? 'soon' : 'deferred'

        interventions.push({
          metric: trend.metric,
          action: this.actionForMetric(trend.metric),
          reason: `${trend.metric} trending toward threshold — breach in ~${minutesUntil}min (confidence: ${(trend.confidence * 100).toFixed(0)}%)`,
          urgency,
          estimatedImpact: `Prevent ${trend.metric} from exceeding safe limit`,
        })
      }

      // Anomaly detection — something unusual is happening
      if (trend.anomalyScore >= ANOMALY_THRESHOLD && trend.slope > 0) {
        interventions.push({
          metric: trend.metric,
          action: 'investigate',
          reason: `Anomalous spike in ${trend.metric}: ${trend.current.toFixed(3)} vs baseline ${trend.baseline.toFixed(3)} (${(trend.anomalyScore * 100).toFixed(0)}% anomaly score)`,
          urgency: trend.anomalyScore > 0.9 ? 'immediate' : 'soon',
          estimatedImpact: 'Early detection of emerging issue',
        })
      }
    }

    // Sort by urgency
    const urgencyOrder = { immediate: 0, soon: 1, deferred: 2 }
    interventions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency])

    return interventions
  }

  /**
   * Full predictive analysis: collect → analyze → recommend.
   */
  async predict(): Promise<PredictiveReport> {
    await this.collectMetrics()
    const trends = this.analyzeTrends()
    const interventions = this.generateInterventions(trends)

    const hasImmediate = interventions.some((i) => i.urgency === 'immediate')
    const hasSoon = interventions.some((i) => i.urgency === 'soon')
    const riskLevel: PredictiveReport['riskLevel'] = hasImmediate
      ? 'critical'
      : hasSoon
        ? 'high'
        : interventions.length > 0
          ? 'medium'
          : 'low'

    return {
      timestamp: new Date(),
      trends,
      riskLevel,
      interventions,
    }
  }

  /**
   * Get the raw metric store snapshot (for UI/debugging).
   */
  getMetricSnapshot() {
    return this.store.getSnapshot()
  }

  private actionForMetric(metric: string): string {
    switch (metric) {
      case 'agent.error_rate':
        return 'preemptive_restart'
      case 'ticket.failure_rate':
        return 'throttle_dispatch'
      case 'ticket.stuck_count':
        return 'force_requeue'
      case 'entity.degraded_ratio':
        return 'activate_fallbacks'
      case 'healing.action_rate':
        return 'cooldown_healing'
      default:
        return 'investigate'
    }
  }
}
