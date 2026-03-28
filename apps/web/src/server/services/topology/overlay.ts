/**
 * Runtime Overlay Builder — live agent statuses, health scoring.
 * Extracted from builder.ts for single-responsibility.
 */
import type { Database } from '@solarc/db'

import type { RuntimeOverlay } from './schemas'

/**
 * Pure function to compute overall health from status counts and cron failures.
 */
export function computeHealthScore(
  statusCounts: { error: number },
  cronFails: number,
): 'healthy' | 'degraded' | 'unhealthy' {
  if (statusCounts.error === 0 && cronFails === 0) return 'healthy'
  if (statusCounts.error > 3 || cronFails > 2) return 'unhealthy'
  return 'degraded'
}

/**
 * Queries agents, ticket executions, approval gates, and cron jobs,
 * then builds the runtime overlay with agent statuses, counts, and health score.
 */
export async function buildRuntimeOverlay(db: Database): Promise<RuntimeOverlay> {
  const [allAgents, executions, pendingApprovals, jobs] = await Promise.all([
    db.query.agents.findMany(),
    db.query.ticketExecution.findMany(),
    db.query.approvalGates.findMany(),
    db.query.cronJobs.findMany(),
  ])

  const agentStatuses: Record<string, { status: string; currentTicket?: string }> = {}
  for (const a of allAgents) {
    const exec = executions.find((e) => e.lockOwner === a.id)
    agentStatuses[a.id] = {
      status: a.status ?? 'idle',
      currentTicket: exec?.ticketId ?? undefined,
    }
  }

  const statusCounts = {
    idle: allAgents.filter((a) => a.status === 'idle').length,
    executing: allAgents.filter((a) => a.status === 'executing' || a.status === 'planning').length,
    error: allAgents.filter((a) => a.status === 'error').length,
    offline: allAgents.filter((a) => a.status === 'offline').length,
  }

  const pending = pendingApprovals.filter((a) => a.status === 'pending').length
  const activeCrons = jobs.filter((j) => j.status === 'active').length
  const failedCrons = jobs.filter((j) => j.status === 'failed').length

  return {
    agentStatuses,
    statusCounts,
    pendingApprovals: pending,
    cronSummary: { active: activeCrons, failed: failedCrons, total: jobs.length },
    healthScore: computeHealthScore(statusCounts, failedCrons),
    timestamp: new Date(),
  }
}
