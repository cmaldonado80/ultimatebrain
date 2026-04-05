/**
 * Post-Evolution Validator — closes the evolution feedback loop.
 *
 * After a soul mutation, waits for 10+ post-evolution runs, then compares
 * average quality vs pre-evolution baseline. Auto-rollbacks harmful mutations.
 */
import type { Database } from '@solarc/db'
import { sql } from 'drizzle-orm'

import { logger } from '../../../lib/logger'

interface PendingValidation {
  agentId: string
  evolutionTimestamp: Date
  preEvolutionAvgQuality: number
  /** The soul version number to rollback to if mutation was harmful */
  preEvolutionVersion: number
}

/** Minimum post-evolution runs required before validating */
const MIN_POST_EVOLUTION_RUNS = 10

/** Quality delta threshold — rollback if quality dropped by more than this */
const ROLLBACK_THRESHOLD = -0.1

// In-memory registry of pending validations (persisted via worker schedule)
const pendingValidations = new Map<string, PendingValidation>()

/**
 * Register a pending evolution validation.
 * Called after evolveAgent() completes with an accepted mutation.
 */
export function registerPendingValidation(
  agentId: string,
  preEvolutionAvgQuality: number,
  preEvolutionVersion: number,
): void {
  pendingValidations.set(agentId, {
    agentId,
    evolutionTimestamp: new Date(),
    preEvolutionAvgQuality,
    preEvolutionVersion,
  })
  logger.info(
    { agentId, preEvolutionAvgQuality, preEvolutionVersion },
    'evolution: registered pending validation',
  )
}

/**
 * Validate all pending evolutions.
 * Called by worker job daily.
 */
export async function validatePendingEvolutions(
  db: Database,
): Promise<{ validated: number; rolledBack: number; pending: number }> {
  let validated = 0
  let rolledBack = 0
  let pending = 0

  for (const [agentId, validation] of pendingValidations) {
    try {
      const result = await validateEvolution(db, validation)
      if (result === 'validated') {
        validated++
        pendingValidations.delete(agentId)
      } else if (result === 'rolled_back') {
        rolledBack++
        pendingValidations.delete(agentId)
      } else {
        pending++ // not enough data yet
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err : undefined, agentId },
        'evolution: validation failed',
      )
      pending++
    }
  }

  return { validated, rolledBack, pending }
}

async function validateEvolution(
  db: Database,
  validation: PendingValidation,
): Promise<'validated' | 'rolled_back' | 'pending'> {
  // Query post-evolution run quality scores via chatRunSteps → runQuality join.
  // chatRunSteps has agentId; runQuality has the actual quality score.
  const postEvolutionData = await db.execute(sql`
    SELECT AVG(rq.score) as avg_quality,
           COUNT(DISTINCT crs.run_id) as run_count
    FROM chat_run_steps crs
    INNER JOIN run_quality rq ON rq.run_id = crs.run_id
    WHERE crs.agent_id = ${validation.agentId}
      AND crs.started_at >= ${validation.evolutionTimestamp}
  `)

  const rows = (
    postEvolutionData as unknown as {
      rows: Array<{ avg_quality: number | null; run_count: number }>
    }
  ).rows
  const row = rows?.[0]
  if (!row || row.run_count < MIN_POST_EVOLUTION_RUNS) {
    logger.info(
      { agentId: validation.agentId, runCount: row?.run_count ?? 0 },
      'evolution: not enough post-evolution runs yet',
    )
    return 'pending'
  }

  const postAvg = row.avg_quality ?? 0.5
  const delta = postAvg - validation.preEvolutionAvgQuality

  if (delta < ROLLBACK_THRESHOLD) {
    // Evolution made things worse — rollback
    logger.warn(
      {
        agentId: validation.agentId,
        delta,
        preAvg: validation.preEvolutionAvgQuality,
        postAvg,
        targetVersion: validation.preEvolutionVersion,
      },
      'evolution: rolling back harmful mutation',
    )
    try {
      const { rollbackToVersion } = await import('./evolution-service')
      await rollbackToVersion(db, validation.agentId, validation.preEvolutionVersion)
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err : undefined, agentId: validation.agentId },
        'evolution: rollback failed',
      )
    }
    return 'rolled_back'
  }

  logger.info(
    { agentId: validation.agentId, delta, preAvg: validation.preEvolutionAvgQuality, postAvg },
    'evolution: mutation validated — quality improved or stable',
  )
  return 'validated'
}

export function getPendingValidationCount(): number {
  return pendingValidations.size
}
