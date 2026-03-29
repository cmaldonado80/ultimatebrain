/**
 * Run Observer — feeds instinct observations from completed chat runs.
 *
 * Called fire-and-forget on run completion (same pattern as
 * computeRunQualityScore and refreshInsights). Records observations
 * about retry strategies, autonomy modes, workflows, and agent
 * sequences that produced high-quality outcomes.
 *
 * Observations are written directly to the instinctObservations table
 * (bypassing the in-memory buffer — run-level observations are already
 * naturally batched by the execution lifecycle).
 */

import type { Database } from '@solarc/db'
import { chatRuns, instinctObservations, runQuality } from '@solarc/db'
import { eq } from 'drizzle-orm'

/**
 * Observe a completed run and record behavioral signals as instinct observations.
 * Fire-and-forget — never blocks the response path.
 */
export async function observeRunCompletion(db: Database, runId: string): Promise<void> {
  const run = await db.query.chatRuns.findFirst({ where: eq(chatRuns.id, runId) })
  if (!run || run.status === 'running') return

  const quality = await db.query.runQuality.findFirst({ where: eq(runQuality.runId, runId) })
  const qualityLabel = quality?.label ?? 'unknown'
  const qualityScore = quality?.score ?? 0

  const observations: Array<{
    eventType: string
    payload: Record<string, unknown>
  }> = []

  // 1. Retry strategy observation (if this was a retry that succeeded)
  if (run.retryOfRunId && run.status === 'completed') {
    observations.push({
      eventType: 'error_resolution',
      payload: {
        retryScope: run.retryScope ?? 'run',
        retryType: run.retryType ?? 'manual',
        recovered: true,
        qualityLabel,
        qualityScore,
        _meta: {
          entityId: run.sessionId,
          domain: run.workflowName ?? 'universal',
          occurredAt: new Date().toISOString(),
          runId,
        },
      },
    })
  }

  // 2. Workflow outcome observation (if workflow used and quality is high)
  if (run.workflowName && qualityLabel === 'high') {
    observations.push({
      eventType: 'agent_output',
      payload: {
        workflowName: run.workflowName,
        workflowId: run.workflowId,
        qualityLabel,
        qualityScore,
        outputType: 'workflow_execution',
        userAccepted: true,
        _meta: {
          entityId: run.sessionId,
          domain: run.workflowName,
          occurredAt: new Date().toISOString(),
          runId,
        },
      },
    })
  }

  // 3. Autonomy mode observation (record mode + quality pairing)
  if (run.autonomyLevel && run.autonomyLevel !== 'manual' && qualityScore > 0) {
    observations.push({
      eventType: 'agent_output',
      payload: {
        autonomyLevel: run.autonomyLevel,
        qualityLabel,
        qualityScore,
        outputType: 'autonomy_outcome',
        _meta: {
          entityId: run.sessionId,
          domain: run.workflowName ?? 'universal',
          occurredAt: new Date().toISOString(),
          runId,
        },
      },
    })
  }

  // 4. Failed run observation (if run failed — negative signal)
  if (run.status === 'failed') {
    observations.push({
      eventType: 'error_resolution',
      payload: {
        recovered: false,
        autonomyLevel: run.autonomyLevel,
        workflowName: run.workflowName,
        _meta: {
          entityId: run.sessionId,
          domain: run.workflowName ?? 'universal',
          occurredAt: new Date().toISOString(),
          runId,
        },
      },
    })
  }

  // Write all observations to DB
  if (observations.length > 0) {
    try {
      await db.insert(instinctObservations).values(observations)
    } catch {
      // Instinct observation failures must never block execution
    }
  }
}
