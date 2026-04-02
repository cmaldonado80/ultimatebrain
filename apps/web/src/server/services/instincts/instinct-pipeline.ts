/**
 * Instinct Pipeline — periodic sweep that detects patterns, scores confidence,
 * and promotes instincts.
 *
 * Called from the daily cron job. Connects the existing instinct infrastructure
 * (PatternDetector, ConfidenceScorer, InstinctPromoter) to real persisted data.
 */

import type { Database } from '@solarc/db'
import { instinctObservations, instincts } from '@solarc/db'
import { desc, eq } from 'drizzle-orm'

import { ConfidenceScorer } from './confidence'
import { PatternDetector } from './pattern-detector'
import type { Instinct, InstinctObservation } from './types'

const scorer = new ConfidenceScorer()
const detector = new PatternDetector()

/**
 * Run the full instinct pipeline:
 * 1. Read recent observations
 * 2. Detect patterns → create candidate instincts
 * 3. Update confidence for existing instincts
 * 4. Apply decay to stale instincts
 * 5. Update statuses (candidate → promoted if confidence >= 0.7)
 */
export async function runInstinctPipeline(db: Database): Promise<{
  observationsProcessed: number
  candidatesCreated: number
  confidenceUpdated: number
  decayed: number
  promoted: number
}> {
  let candidatesCreated = 0
  let confidenceUpdated = 0
  let decayed = 0
  let promoted = 0

  // 1. Read recent observations
  const allRecentObs = await db.query.instinctObservations.findMany({
    orderBy: desc(instinctObservations.createdAt),
    limit: 500,
  })

  // Convert DB records to InstinctObservation type
  const observations: InstinctObservation[] = allRecentObs.map((o) => ({
    id: o.id,
    instinctId: undefined,
    eventType: o.eventType as InstinctObservation['eventType'],
    payload: (o.payload as Record<string, unknown>) ?? {},
    createdAt: o.createdAt,
  }))

  // 2. Detect patterns
  if (observations.length >= 3) {
    const { instincts: candidates } = detector.extractInstincts(observations)

    for (const candidate of candidates) {
      // Check if similar instinct already exists (by trigger fingerprint)
      const existing = await db.query.instincts.findFirst({
        where: eq(instincts.trigger, candidate.trigger),
      })

      if (existing) {
        // Update confidence on existing instinct (coerce nullable DB fields)
        const instinctObj: Instinct = {
          ...existing,
          domain: existing.domain ?? 'universal',
          entityId: existing.entityId ?? '',
          evidenceCount: existing.evidenceCount ?? 1,
          lastObservedAt: existing.lastObservedAt ?? new Date(),
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        }
        scorer.updateConfidence(instinctObj)
        await db
          .update(instincts)
          .set({
            confidence: instinctObj.confidence,
            evidenceCount: instinctObj.evidenceCount,
            lastObservedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(instincts.id, existing.id))
        confidenceUpdated++
      } else {
        // Create new candidate instinct
        await db.insert(instincts).values({
          trigger: candidate.trigger,
          action: candidate.action,
          confidence: candidate.confidence,
          domain: candidate.domain,
          scope: candidate.scope,
          status: 'candidate',
          entityId: candidate.entityId || null,
          evidenceCount: candidate.evidenceCount,
        })
        candidatesCreated++
      }
    }
  }

  // 3. Apply confidence decay to all non-dormant instincts
  const allInstincts = await db.query.instincts.findMany({ limit: 1000 })
  const now = new Date()

  for (const inst of allInstincts) {
    const instObj: Instinct = {
      ...inst,
      domain: inst.domain ?? 'universal',
      entityId: inst.entityId ?? '',
      evidenceCount: inst.evidenceCount ?? 1,
      lastObservedAt: inst.lastObservedAt ?? new Date(),
      createdAt: inst.createdAt,
      updatedAt: inst.updatedAt,
    }
    const prevConf = instObj.confidence
    scorer.applyDecay(instObj, now)

    if (Math.abs(prevConf - instObj.confidence) > 0.01) {
      await db
        .update(instincts)
        .set({ confidence: instObj.confidence, updatedAt: now })
        .where(eq(instincts.id, inst.id))
      decayed++
    }

    // Deprecate dormant instincts
    if (
      scorer.isDormant(instObj, now) &&
      inst.status !== 'deprecated' &&
      inst.status !== 'disabled'
    ) {
      await db
        .update(instincts)
        .set({ status: 'deprecated', updatedAt: now })
        .where(eq(instincts.id, inst.id))
    }
  }

  // 4. Promote candidates with high confidence
  const candidateInstincts = allInstincts.filter(
    (i) => i.status === 'candidate' && i.confidence >= 0.7,
  )
  for (const inst of candidateInstincts) {
    await db
      .update(instincts)
      .set({ status: 'promoted', updatedAt: now })
      .where(eq(instincts.id, inst.id))
    promoted++
  }

  return {
    observationsProcessed: observations.length,
    candidatesCreated,
    confidenceUpdated,
    decayed,
    promoted,
  }
}
