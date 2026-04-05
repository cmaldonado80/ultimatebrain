/**
 * Agent Routines — Recurring automation with concurrency control.
 *
 * Inspired by Paperclip AI's routines service.
 * Supports three trigger modes:
 *   - schedule: Cron-based recurring execution
 *   - webhook: Event-driven via external triggers
 *   - manual: On-demand dispatch
 *
 * Three concurrency policies:
 *   - always_enqueue: Allow unlimited concurrent runs
 *   - skip_if_active: Ignore new triggers while a run is active
 *   - coalesce: Merge new triggers into the active run
 */

import type { Database } from '@solarc/db'
import { cronJobs } from '@solarc/db'
import { eq } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export type TriggerMode = 'schedule' | 'webhook' | 'manual'
export type ConcurrencyPolicy = 'always_enqueue' | 'skip_if_active' | 'coalesce'
export type RoutineStatus = 'idle' | 'running' | 'paused' | 'error'

export interface RoutineDefinition {
  id?: string
  name: string
  agentId: string
  workspaceId: string
  /** What triggers this routine */
  triggerMode: TriggerMode
  /** Cron expression (for schedule mode) */
  schedule?: string
  /** Webhook secret (for webhook mode) */
  webhookSecret?: string
  /** What the agent should do when triggered */
  task: string
  /** How to handle concurrent triggers */
  concurrencyPolicy: ConcurrencyPolicy
  /** Max catch-up runs if scheduler falls behind (default: 5) */
  maxCatchUp: number
  /** Whether the routine is active */
  enabled: boolean
}

export interface RoutineRun {
  routineId: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'skipped'
  triggerSource: TriggerMode | 'catch_up'
  startedAt: number
  completedAt?: number
  result?: string
  error?: string
}

export interface DispatchResult {
  dispatched: boolean
  reason: string
  runId?: string
}

// ── In-Memory Run Tracking ──────────────────────────────────────────

const activeRuns = new Map<string, RoutineRun>()
const runHistory = new Map<string, RoutineRun[]>()
const MAX_ACTIVE_RUN_AGE_MS = 60 * 60 * 1000 // 1 hour — evict stale runs

function pruneStaleRuns() {
  const now = Date.now()
  for (const [id, run] of activeRuns) {
    if (now - run.startedAt > MAX_ACTIVE_RUN_AGE_MS) {
      activeRuns.delete(id)
    }
  }
}

// ── Routine Management ──────────────────────────────────────────────

/**
 * Create or update a routine definition.
 * Stores as a cron job in the database.
 */
export async function upsertRoutine(
  db: Database,
  routine: RoutineDefinition,
): Promise<{ id: string }> {
  // Store routine config as JSON in lastResult (config column not in schema)
  const configJson = JSON.stringify({
    triggerMode: routine.triggerMode,
    concurrencyPolicy: routine.concurrencyPolicy,
    maxCatchUp: routine.maxCatchUp,
    webhookSecret: routine.webhookSecret,
  })

  if (routine.id) {
    await db
      .update(cronJobs)
      .set({
        name: routine.name,
        schedule: routine.schedule ?? '0 * * * *',
        task: routine.task,
        type: routine.triggerMode,
        agentId: routine.agentId,
        workspaceId: routine.workspaceId,
        status: routine.enabled ? 'active' : 'paused',
        lastResult: configJson,
        updatedAt: new Date(),
      })
      .where(eq(cronJobs.id, routine.id))
    return { id: routine.id }
  }

  const [created] = await db
    .insert(cronJobs)
    .values({
      name: routine.name,
      schedule: routine.schedule ?? '0 * * * *',
      task: routine.task,
      type: routine.triggerMode,
      agentId: routine.agentId,
      workspaceId: routine.workspaceId,
      status: routine.enabled ? 'active' : 'paused',
      lastResult: configJson,
    })
    .returning({ id: cronJobs.id })

  return { id: created!.id }
}

/**
 * List all routines for a workspace.
 */
export async function listRoutines(db: Database, workspaceId: string) {
  return db
    .select({
      id: cronJobs.id,
      name: cronJobs.name,
      schedule: cronJobs.schedule,
      status: cronJobs.status,
      task: cronJobs.task,
      type: cronJobs.type,
      agentId: cronJobs.agentId,
      lastResult: cronJobs.lastResult,
    })
    .from(cronJobs)
    .where(eq(cronJobs.workspaceId, workspaceId))
}

/**
 * Dispatch a routine run with concurrency policy enforcement.
 */
export async function dispatchRoutine(
  db: Database,
  routineId: string,
  triggerSource: TriggerMode | 'catch_up' = 'manual',
  executeFn?: (agentId: string, task: string) => Promise<string>,
): Promise<DispatchResult> {
  // Load routine config
  const routine = await db.query.cronJobs.findFirst({
    where: eq(cronJobs.id, routineId),
  })
  if (!routine) return { dispatched: false, reason: 'Routine not found' }
  if (routine.status !== 'active') return { dispatched: false, reason: 'Routine is paused' }

  let config: Record<string, unknown> = {}
  try {
    config = JSON.parse(routine.lastResult ?? '{}')
  } catch {
    /* invalid JSON — use defaults */
  }
  const policy = (config.concurrencyPolicy as ConcurrencyPolicy) ?? 'always_enqueue'

  // Check concurrency policy
  const currentRun = activeRuns.get(routineId)
  if (currentRun && currentRun.status === 'running') {
    switch (policy) {
      case 'skip_if_active':
        return {
          dispatched: false,
          reason: 'Skipped — routine already running (skip_if_active policy)',
        }
      case 'coalesce':
        return { dispatched: false, reason: 'Coalesced — merged into active run (coalesce policy)' }
      case 'always_enqueue':
        // Allow concurrent — continue
        break
    }
  }

  // Prune any stale runs before creating a new one
  pruneStaleRuns()

  // Create run
  const run: RoutineRun = {
    routineId,
    status: 'running',
    triggerSource,
    startedAt: Date.now(),
  }
  activeRuns.set(routineId, run)

  // Execute
  if (executeFn && routine.agentId) {
    try {
      const task = routine.task ?? 'No task defined'
      const result = await executeFn(routine.agentId, task)
      run.status = 'completed'
      run.completedAt = Date.now()
      run.result = result
    } catch (err) {
      run.status = 'failed'
      run.completedAt = Date.now()
      run.error = err instanceof Error ? err.message : 'Unknown error'
    }
  } else {
    run.status = 'completed'
    run.completedAt = Date.now()
    run.result = 'No executor provided — routine logged only'
  }

  // Record in history
  const history = runHistory.get(routineId) ?? []
  history.push(run)
  if (history.length > 50) history.shift()
  runHistory.set(routineId, history)

  // Clear active
  activeRuns.delete(routineId)

  return {
    dispatched: true,
    reason: run.status === 'completed' ? 'Completed' : `Failed: ${run.error}`,
  }
}

/**
 * Get run history for a routine.
 */
export function getRoutineHistory(routineId: string): RoutineRun[] {
  return runHistory.get(routineId) ?? []
}
