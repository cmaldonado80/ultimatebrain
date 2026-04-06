import type { Database } from '@solarc/db'
import { instinctObservations, instincts, pathwayEffectiveness } from '@solarc/db'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { logger } from '../../../lib/logger'

export interface PathwayReport {
  eventType: string
  volume: number
  promotedCount: number
  yieldRate: number
  durabilityRate: number | null
  effectivenessScore: number
  adjustedThreshold: number
  metaInsight: string | null
}

const BASE_THRESHOLD = 0.7
const THRESHOLD_FLOOR = 0.5
const THRESHOLD_CEILING = 0.9

export class MetaLearningGovernor {
  constructor(private db: Database) {}

  async runMetaAnalysis(lookbackDays = 90): Promise<PathwayReport[]> {
    const cutoff = new Date(Date.now() - lookbackDays * 86400000)
    // Get distinct event types
    const eventTypes = await this.db
      .selectDistinct({ eventType: instinctObservations.eventType })
      .from(instinctObservations)
      .where(gte(instinctObservations.createdAt, cutoff))

    const reports: PathwayReport[] = []
    for (const { eventType } of eventTypes) {
      const report = await this.analyzePathway(eventType, cutoff)
      reports.push(report)
      // Persist
      await this.db
        .insert(pathwayEffectiveness)
        .values(report)
        .catch((err) => {
          logger.warn({ err }, 'meta-learning: failed to persist pathway report')
        })
    }

    reports.sort((a, b) => b.effectivenessScore - a.effectivenessScore)
    logger.info({ pathways: reports.length }, 'meta-learning: analysis complete')
    return reports
  }

  private async analyzePathway(eventType: string, cutoff: Date): Promise<PathwayReport> {
    // Count observations
    const [volRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(instinctObservations)
      .where(
        and(
          eq(instinctObservations.eventType, eventType),
          gte(instinctObservations.createdAt, cutoff),
        ),
      )
    const volume = volRow?.count ?? 0

    // Count promoted instincts linked to this event type
    const [promRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(instinctObservations)
      .innerJoin(instincts, eq(instinctObservations.instinctId, instincts.id))
      .where(and(eq(instinctObservations.eventType, eventType), eq(instincts.status, 'promoted')))
    const promotedCount = promRow?.count ?? 0

    const yieldRate = volume > 0 ? promotedCount / volume : 0

    // Durability: of promoted, how many are still promoted (not deprecated)
    const [durRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(instinctObservations)
      .innerJoin(instincts, eq(instinctObservations.instinctId, instincts.id))
      .where(and(eq(instinctObservations.eventType, eventType), eq(instincts.status, 'promoted')))
    const [totPromRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(instinctObservations)
      .innerJoin(instincts, eq(instinctObservations.instinctId, instincts.id))
      .where(eq(instinctObservations.eventType, eventType))
    const durabilityRate =
      (totPromRow?.count ?? 0) > 0 ? (durRow?.count ?? 0) / (totPromRow?.count ?? 1) : null

    const adjustedThreshold = this.computeThreshold(yieldRate, durabilityRate)
    const effectivenessScore = yieldRate * (durabilityRate ?? 0.5)
    const metaInsight = this.generateInsight(eventType, yieldRate, volume)

    return {
      eventType,
      volume,
      promotedCount,
      yieldRate,
      durabilityRate,
      effectivenessScore,
      adjustedThreshold,
      metaInsight,
    }
  }

  private computeThreshold(yieldRate: number, durability: number | null): number {
    const d = durability ?? 0.5
    const adj =
      (yieldRate > 0.15 ? -0.1 : yieldRate < 0.02 ? 0.1 : 0) +
      (d > 0.8 ? -0.05 : d < 0.3 ? 0.05 : 0)
    return Math.max(THRESHOLD_FLOOR, Math.min(THRESHOLD_CEILING, BASE_THRESHOLD + adj))
  }

  private generateInsight(eventType: string, yieldRate: number, volume: number): string {
    if (yieldRate > 0.15)
      return `${eventType} is a high-yield pathway (${(yieldRate * 100).toFixed(1)}%) — invest in more observations`
    if (yieldRate < 0.02 && volume > 50)
      return `${eventType} has low yield despite high volume — consider raising quality bar`
    return `${eventType} performing at ${(yieldRate * 100).toFixed(1)}% yield`
  }

  async getLatestReport(): Promise<PathwayReport[]> {
    return this.db.query.pathwayEffectiveness.findMany({
      orderBy: desc(pathwayEffectiveness.effectivenessScore),
      limit: 20,
    }) as unknown as PathwayReport[]
  }
}
