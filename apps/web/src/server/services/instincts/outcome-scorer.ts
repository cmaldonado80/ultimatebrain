/**
 * Instinct Outcome Scorer — closes the instinct feedback loop.
 *
 * After each chat response, measures whether injected instincts
 * correlated with higher quality. Updates instinct confidence
 * accordingly: good outcomes boost confidence, bad outcomes penalize.
 */
import type { Database } from '@solarc/db'
import { instinctObservations, instincts } from '@solarc/db'
import { eq } from 'drizzle-orm'

import { logger } from '../../../lib/logger'
import { ConfidenceScorer } from './confidence'
import type { Instinct } from './types'

const scorer = new ConfidenceScorer()

/** Quality thresholds for confidence adjustments */
const BOOST_THRESHOLD = 0.6 // quality > 0.6 → boost instinct confidence
const PENALIZE_THRESHOLD = 0.3 // quality < 0.3 → penalize instinct confidence

/**
 * Score how well injected instincts performed in a run.
 * Called post-response with the quality score from computeRunQualityScore().
 */
export async function scoreInstinctOutcomes(
  db: Database,
  injectedInstinctIds: string[],
  qualityScore: number,
  runId?: string,
): Promise<void> {
  if (injectedInstinctIds.length === 0) return

  // Record observation for analytics
  for (const instinctId of injectedInstinctIds) {
    await db
      .insert(instinctObservations)
      .values({
        instinctId,
        eventType: 'instinct_effectiveness',
        payload: { instinctIds: injectedInstinctIds, qualityScore, runId },
      })
      .catch((err) => logger.warn({ err }, 'instinct: failed to record effectiveness observation'))
  }

  // Update confidence based on quality
  for (const instinctId of injectedInstinctIds) {
    try {
      const row = await db.query.instincts.findFirst({
        where: eq(instincts.id, instinctId),
      })
      if (!row) continue

      const instinct: Instinct = {
        ...row,
        domain: row.domain ?? 'universal',
        entityId: row.entityId ?? '',
        evidenceCount: row.evidenceCount ?? 1,
        lastObservedAt: row.lastObservedAt ?? new Date(),
      }

      if (qualityScore >= BOOST_THRESHOLD) {
        scorer.updateConfidence(instinct)
      } else if (qualityScore < PENALIZE_THRESHOLD) {
        scorer.decreaseConfidence(instinct)
      }
      // Between 0.3-0.6: neutral, no change

      await db
        .update(instincts)
        .set({
          confidence: instinct.confidence,
          evidenceCount: instinct.evidenceCount,
          lastObservedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(instincts.id, instinctId))
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err : undefined },
        `instinct: failed to update confidence for ${instinctId}`,
      )
    }
  }
}
