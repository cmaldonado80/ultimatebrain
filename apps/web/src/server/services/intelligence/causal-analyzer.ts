import type { Database } from '@solarc/db'
import { causalInsights, healingLogs, instincts } from '@solarc/db'
import { and, desc, eq, gte } from 'drizzle-orm'

import { logger } from '../../../lib/logger'

export interface CausalInsight {
  interventionType: string
  target: string
  metric: string
  delta: number
  confidence: number
  sampleSize: number
  interventionDetail: string | null
  createdAt: Date
}

interface Intervention {
  type: 'healing_action' | 'instinct_promotion'
  target: string
  occurredAt: Date
  detail: string
}

export class CausalAnalyzer {
  constructor(private db: Database) {}

  async runCausalSweep(lookbackDays = 30): Promise<CausalInsight[]> {
    const cutoff = new Date(Date.now() - lookbackDays * 86400000)
    const interventions = await this.gatherInterventions(cutoff)
    const insights: CausalInsight[] = []

    for (const intervention of interventions.slice(0, 20)) {
      // Get quality-like metrics before and after intervention
      const before = await this.getMetricsWindow(
        intervention.target,
        intervention.occurredAt,
        'before',
      )
      const after = await this.getMetricsWindow(
        intervention.target,
        intervention.occurredAt,
        'after',
      )

      if (before.length < 3 || after.length < 3) continue

      const stats = this.computeStats(before, after)
      if (stats.confidence > 0.6) {
        // only store significant insights
        const insight: CausalInsight = {
          interventionType: intervention.type,
          target: intervention.target,
          metric: 'quality',
          delta: stats.delta,
          confidence: stats.confidence,
          sampleSize: before.length + after.length,
          interventionDetail: intervention.detail,
          createdAt: new Date(),
        }
        await this.db
          .insert(causalInsights)
          .values({
            ...insight,
            meanBefore: stats.meanBefore,
            meanAfter: stats.meanAfter,
          })
          .catch((err) => {
            logger.warn({ err }, 'causal-analyzer: failed to persist insight')
          })
        insights.push(insight)
      }
    }

    logger.info({ count: insights.length }, 'causal-analyzer: sweep complete')
    return insights
  }

  private async gatherInterventions(cutoff: Date): Promise<Intervention[]> {
    // Gather from healing logs (degradation events) and instinct promotions
    const healingEvents = await this.db
      .select({
        target: healingLogs.target,
        action: healingLogs.action,
        reason: healingLogs.reason,
        createdAt: healingLogs.createdAt,
      })
      .from(healingLogs)
      .where(gte(healingLogs.createdAt, cutoff))
      .orderBy(desc(healingLogs.createdAt))
      .limit(50)

    const promotedInstincts = await this.db.query.instincts.findMany({
      where: and(eq(instincts.status, 'promoted'), gte(instincts.updatedAt, cutoff)),
      limit: 50,
    })

    return [
      ...healingEvents.map((e) => ({
        type: 'healing_action' as const,
        target: e.target,
        occurredAt: e.createdAt,
        detail: `${e.action}: ${e.reason}`,
      })),
      ...promotedInstincts.map((i) => ({
        type: 'instinct_promotion' as const,
        target: i.entityId ?? 'global',
        occurredAt: i.updatedAt,
        detail: `${i.trigger} → ${i.action}`,
      })),
    ]
  }

  private async getMetricsWindow(
    target: string,
    pivot: Date,
    direction: 'before' | 'after',
  ): Promise<number[]> {
    // Query run quality scores for runs associated with this target
    // Use healing log success rate as a proxy metric
    const window =
      direction === 'before'
        ? { start: new Date(pivot.getTime() - 7 * 86400000), end: pivot }
        : { start: pivot, end: new Date(pivot.getTime() + 7 * 86400000) }

    const logs = await this.db
      .select({ success: healingLogs.success })
      .from(healingLogs)
      .where(and(eq(healingLogs.target, target), gte(healingLogs.createdAt, window.start)))
      .limit(10)

    return logs.map((l) => (l.success ? 1.0 : 0.0))
  }

  private computeStats(before: number[], after: number[]) {
    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
    const variance = (arr: number[], m: number) =>
      arr.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(arr.length - 1, 1)
    const mB = mean(before)
    const mA = mean(after)
    const vB = variance(before, mB)
    const vA = variance(after, mA)
    const se = Math.sqrt(vB / before.length + vA / after.length)
    const delta = mA - mB
    const tStat = se > 0 ? Math.abs(delta) / se : 0
    const confidence = 1 - 1 / (1 + tStat)
    return { meanBefore: mB, meanAfter: mA, delta, confidence }
  }

  async getTopInsights(opts?: { limit?: number }): Promise<CausalInsight[]> {
    return this.db.query.causalInsights.findMany({
      orderBy: desc(causalInsights.confidence),
      limit: opts?.limit ?? 20,
    }) as unknown as CausalInsight[]
  }
}
