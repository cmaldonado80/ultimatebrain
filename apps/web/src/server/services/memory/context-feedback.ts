/**
 * Context Feedback — tracks which memory sources correlate with quality.
 *
 * After each response, records which memories were used and the quality score.
 * Over time, builds effectiveness weights that improve memory ranking.
 */
import type { Database } from '@solarc/db'
import { contextEffectiveness } from '@solarc/db'
import { avg, eq } from 'drizzle-orm'

import { logger } from '../../../lib/logger'

/**
 * Record which memories contributed to a run and its quality.
 */
export async function recordContextEffectiveness(
  db: Database,
  runId: string,
  memoryIds: string[],
  qualityScore: number,
  sourceType: string = 'memory',
): Promise<void> {
  if (memoryIds.length === 0) return

  const rows = memoryIds.map((memoryId) => ({
    memoryId,
    runId,
    qualityScore,
    sourceType,
  }))

  await db
    .insert(contextEffectiveness)
    .values(rows)
    .catch((err) =>
      logger.warn(
        { err: err instanceof Error ? err : undefined },
        'context-feedback: failed to record effectiveness',
      ),
    )
}

/**
 * Get the average quality score when a specific memory was used.
 * Returns 0.5 (neutral) if no data available.
 */
export async function getEffectivenessWeight(db: Database, memoryId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ avgQuality: avg(contextEffectiveness.qualityScore) })
      .from(contextEffectiveness)
      .where(eq(contextEffectiveness.memoryId, memoryId))
    return row?.avgQuality ? Number(row.avgQuality) : 0.5
  } catch {
    return 0.5
  }
}

/**
 * Get average effectiveness weights grouped by source type.
 */
export async function getSourceTypeWeights(db: Database): Promise<Record<string, number>> {
  try {
    const rows = await db
      .select({
        sourceType: contextEffectiveness.sourceType,
        avgQuality: avg(contextEffectiveness.qualityScore),
      })
      .from(contextEffectiveness)
      .groupBy(contextEffectiveness.sourceType)

    const weights: Record<string, number> = {}
    for (const row of rows) {
      if (row.sourceType) {
        weights[row.sourceType] = row.avgQuality ? Number(row.avgQuality) : 0.5
      }
    }
    return weights
  } catch {
    return {}
  }
}
