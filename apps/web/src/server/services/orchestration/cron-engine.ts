/**
 * Cron/Schedule Engine
 *
 * Manages scheduled background jobs with:
 * - Cron expression parsing (minute/hour/day/month/weekday)
 * - Job lifecycle (create, pause, resume, delete)
 * - Execution tracking with fail counts and auto-pause
 * - Next-run computation
 */
import type { Database } from '@solarc/db'
import { cronJobs } from '@solarc/db'
import { and, eq, lte, sql } from 'drizzle-orm'

import { logger } from '../../../lib/logger'

export type CronJobStatus = 'active' | 'paused' | 'failed'

export interface CreateJobInput {
  name: string
  /** Cron expression: "min hour day month weekday" */
  schedule: string
  type?: string
  task?: string
  workspaceId?: string
  agentId?: string
}

/** Max consecutive failures before auto-pause */
const MAX_FAIL_COUNT = 5

export class CronEngine {
  constructor(private db: Database) {}

  /**
   * Create a new scheduled job.
   */
  async createJob(input: CreateJobInput) {
    const nextRun = computeNextRun(input.schedule)
    const [job] = await this.db
      .insert(cronJobs)
      .values({
        ...input,
        enabled: true,
        nextRun,
      })
      .returning()
    return job
  }

  /**
   * Pause a job.
   */
  async pause(jobId: string): Promise<void> {
    await this.db
      .update(cronJobs)
      .set({
        status: 'paused',
        enabled: false,
      })
      .where(eq(cronJobs.id, jobId))
  }

  /**
   * Resume a paused/failed job (resets fail count).
   */
  async resume(jobId: string): Promise<void> {
    const job = await this.db.query.cronJobs.findFirst({ where: eq(cronJobs.id, jobId) })
    if (!job) throw new Error(`Job ${jobId} not found`)

    const nextRun = computeNextRun(job.schedule)
    await this.db
      .update(cronJobs)
      .set({
        status: 'active',
        enabled: true,
        failCount: 0,
        nextRun,
      })
      .where(eq(cronJobs.id, jobId))
  }

  /**
   * Delete a job.
   */
  async delete(jobId: string): Promise<void> {
    await this.db.delete(cronJobs).where(eq(cronJobs.id, jobId))
  }

  /**
   * Get all jobs that are due to run (nextRun <= now, enabled, active).
   */
  async getDueJobs(): Promise<Array<typeof cronJobs.$inferSelect>> {
    return this.db
      .select()
      .from(cronJobs)
      .where(
        and(
          eq(cronJobs.status, 'active'),
          eq(cronJobs.enabled, true),
          lte(cronJobs.nextRun, new Date()),
        ),
      )
  }

  /**
   * Record a successful job execution.
   */
  async recordSuccess(jobId: string, result?: string): Promise<void> {
    const job = await this.db.query.cronJobs.findFirst({ where: eq(cronJobs.id, jobId) })
    if (!job) return

    const nextRun = computeNextRun(job.schedule)
    await this.db
      .update(cronJobs)
      .set({
        lastRun: new Date(),
        nextRun,
        lastResult: result ?? 'success',
        runs: sql`${cronJobs.runs} + 1`,
        failCount: 0,
      })
      .where(eq(cronJobs.id, jobId))

    // Notify OpenClaw of job success (non-blocking)
    this.notifyOpenClaw('job.success', jobId, { result }).catch(() =>
      logger.warn({}, '[CronEngine] notification failed'),
    )
  }

  /**
   * Record a failed job execution. Auto-pauses after MAX_FAIL_COUNT.
   */
  async recordFailure(jobId: string, error: string): Promise<{ autoPaused: boolean }> {
    const job = await this.db.query.cronJobs.findFirst({ where: eq(cronJobs.id, jobId) })
    if (!job) return { autoPaused: false }

    const newFailCount = (job.failCount ?? 0) + 1
    const autoPaused = newFailCount >= MAX_FAIL_COUNT

    const nextRun = autoPaused ? null : computeNextRunWithBackoff(job.schedule, newFailCount)

    await this.db
      .update(cronJobs)
      .set({
        lastRun: new Date(),
        nextRun,
        lastResult: `FAILED: ${error}`,
        failCount: newFailCount,
        fails: sql`${cronJobs.fails} + 1`,
        ...(autoPaused ? { status: 'failed', enabled: false } : {}),
      })
      .where(eq(cronJobs.id, jobId))

    // Notify OpenClaw of job failure with severity escalation
    this.notifyOpenClaw('job.failed', jobId, { error, failCount: newFailCount, autoPaused }).catch(
      (err) =>
        logger.warn(
          { err: err instanceof Error ? err : undefined, jobId },
          'cron-engine: failure notification failed',
        ),
    )

    return { autoPaused }
  }

  /** Push cron events to OpenClaw (fire-and-forget). */
  private async notifyOpenClaw(
    event: string,
    jobId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const { getOpenClawClient } = await import('../../adapters/openclaw/bootstrap')
    const client = getOpenClawClient()
    if (!client?.isConnected()) return
    const { OpenClawChannels } = await import('../../adapters/openclaw/channels')
    const channels = new OpenClawChannels(client)
    const severity = data.autoPaused ? 'CRITICAL' : 'info'
    await channels.sendMessage(
      'cron-events',
      'system',
      JSON.stringify({ event, jobId, severity, ...data }),
    )
  }

  /**
   * List all jobs, optionally filtered by workspace.
   */
  async list(workspaceId?: string) {
    if (workspaceId) {
      return this.db.query.cronJobs.findMany({
        where: eq(cronJobs.workspaceId, workspaceId),
      })
    }
    return this.db.query.cronJobs.findMany({ limit: 200 })
  }

  /**
   * Update a job's schedule.
   */
  async updateSchedule(jobId: string, schedule: string): Promise<void> {
    const nextRun = computeNextRun(schedule)
    await this.db.update(cronJobs).set({ schedule, nextRun }).where(eq(cronJobs.id, jobId))
  }
}

// === Cron Expression Parser ===

interface CronFields {
  minute: number[]
  hour: number[]
  dayOfMonth: number[]
  month: number[]
  dayOfWeek: number[]
}

function parseCronExpression(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error(`Invalid cron expression: ${expr}`)

  return {
    minute: parseField(parts[0]!, 0, 59),
    hour: parseField(parts[1]!, 0, 23),
    dayOfMonth: parseField(parts[2]!, 1, 31),
    month: parseField(parts[3]!, 1, 12),
    dayOfWeek: parseField(parts[4]!, 0, 6),
  }
}

function parseField(field: string, min: number, max: number): number[] {
  if (field === '*') return range(min, max)

  const values = new Set<number>()
  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [rangeStr, stepStr] = part.split('/')
      const step = parseInt(stepStr!, 10)
      const start = rangeStr === '*' ? min : parseInt(rangeStr!, 10)
      for (let i = start; i <= max; i += step) values.add(i)
    } else if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number)
      for (let i = a!; i <= b!; i++) values.add(i)
    } else {
      values.add(parseInt(part, 10))
    }
  }
  return [...values].sort((a, b) => a - b)
}

function range(min: number, max: number): number[] {
  const arr: number[] = []
  for (let i = min; i <= max; i++) arr.push(i)
  return arr
}

/**
 * Compute next run time from a cron expression.
 * Simple forward-scanning approach (max 1 year ahead).
 */
function computeNextRun(schedule: string, after?: Date): Date {
  const fields = parseCronExpression(schedule)
  const start = after ?? new Date()
  const candidate = new Date(start.getTime() + 60_000) // Start 1 minute ahead
  candidate.setSeconds(0, 0)

  const maxIterations = 525_600 // ~1 year of minutes
  for (let i = 0; i < maxIterations; i++) {
    const m = candidate.getMinutes()
    const h = candidate.getHours()
    const dom = candidate.getDate()
    const mon = candidate.getMonth() + 1
    const dow = candidate.getDay()

    if (
      fields.minute.includes(m) &&
      fields.hour.includes(h) &&
      fields.dayOfMonth.includes(dom) &&
      fields.month.includes(mon) &&
      fields.dayOfWeek.includes(dow)
    ) {
      return candidate
    }
    candidate.setTime(candidate.getTime() + 60_000)
  }

  // Fallback: 24 hours from now
  return new Date(Date.now() + 86_400_000)
}

/**
 * Compute next run with exponential backoff on failure.
 */
function computeNextRunWithBackoff(schedule: string, failCount: number): Date {
  const normalNext = computeNextRun(schedule)
  const backoffMs = Math.min(2 ** failCount * 60_000, 3_600_000) // Cap at 1 hour
  const backoffTime = new Date(Date.now() + backoffMs)
  return backoffTime > normalNext ? backoffTime : normalNext
}
