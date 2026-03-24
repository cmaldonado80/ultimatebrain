/**
 * Healing Engine
 *
 * Auto-recovery and diagnostics for the brain:
 * - Health check aggregation across agents and entities
 * - Automated recovery actions (restart, reassign, escalate)
 * - Diagnostic reports
 * - Self-healing triggers based on health status
 */

import type { Database } from '@solarc/db'
import { agents, tickets, brainEntities, ticketExecution, healingLogs } from '@solarc/db'
import { eq, and, lte, sql, desc } from 'drizzle-orm'
import type { HealthCheckOutput } from '@solarc/engine-contracts'

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy'
export type HealingAction =
  | 'restart_agent'
  | 'reassign_ticket'
  | 'requeue_ticket'
  | 'escalate'
  | 'suspend_entity'
  | 'clear_lock'
  | 'reconnect_openclaw'

export interface DiagnosticReport {
  timestamp: Date
  overallStatus: HealthStatus
  checks: Array<{
    name: string
    status: 'pass' | 'warn' | 'fail'
    message?: string
    latencyMs?: number
  }>
  recommendations: string[]
}

export interface HealingRecord {
  action: HealingAction
  target: string
  reason: string
  timestamp: Date
  success: boolean
}

export class HealingEngine {
  constructor(private db: Database) {}

  /**
   * Run full system health check.
   */
  async diagnose(): Promise<DiagnosticReport> {
    const start = Date.now()
    const checks: DiagnosticReport['checks'] = []
    const recommendations: string[] = []

    // Check 1: Agent health — any stuck in error state?
    const errorAgents = await this.db.query.agents.findMany({
      where: eq(agents.status, 'error'),
    })
    checks.push({
      name: 'agents.error_state',
      status: errorAgents.length === 0 ? 'pass' : errorAgents.length <= 2 ? 'warn' : 'fail',
      message:
        errorAgents.length > 0
          ? `${errorAgents.length} agent(s) in error state: ${errorAgents.map((a) => a.name).join(', ')}`
          : 'All agents operational',
      latencyMs: Date.now() - start,
    })
    if (errorAgents.length > 0) {
      recommendations.push(`Restart or investigate ${errorAgents.length} agents in error state`)
    }

    // Check 2: Expired execution leases
    const expiredLeases = await this.db
      .select()
      .from(ticketExecution)
      .where(
        and(
          lte(ticketExecution.leaseUntil, new Date()),
          sql`${ticketExecution.lockOwner} is not null`,
        ),
      )
    checks.push({
      name: 'tickets.expired_leases',
      status: expiredLeases.length === 0 ? 'pass' : 'warn',
      message:
        expiredLeases.length > 0
          ? `${expiredLeases.length} expired execution lease(s)`
          : 'No expired leases',
      latencyMs: Date.now() - start,
    })
    if (expiredLeases.length > 0) {
      recommendations.push(`Clear ${expiredLeases.length} expired leases and requeue tickets`)
    }

    // Check 3: Stuck tickets (in_progress for too long)
    const stuckThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours
    const stuckTickets = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(tickets)
      .where(and(eq(tickets.status, 'in_progress'), lte(tickets.updatedAt, stuckThreshold)))
    const stuckCount = stuckTickets[0]?.count ?? 0
    checks.push({
      name: 'tickets.stuck',
      status: stuckCount === 0 ? 'pass' : stuckCount <= 3 ? 'warn' : 'fail',
      message:
        stuckCount > 0
          ? `${stuckCount} ticket(s) stuck in_progress for >2 hours`
          : 'No stuck tickets',
      latencyMs: Date.now() - start,
    })
    if (stuckCount > 0) {
      recommendations.push(
        `Investigate ${stuckCount} stuck tickets — consider reassignment or failure`,
      )
    }

    // Check 4: Degraded entities
    const degradedEntities = await this.db.query.brainEntities.findMany({
      where: eq(brainEntities.status, 'degraded'),
    })
    checks.push({
      name: 'entities.degraded',
      status: degradedEntities.length === 0 ? 'pass' : 'warn',
      message:
        degradedEntities.length > 0
          ? `${degradedEntities.length} degraded entit(y/ies): ${degradedEntities.map((e) => e.name).join(', ')}`
          : 'All entities healthy',
      latencyMs: Date.now() - start,
    })

    // Check 5: Failed tickets accumulation
    const recentFailedTickets = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(tickets)
      .where(
        and(eq(tickets.status, 'failed'), sql`${tickets.updatedAt} > now() - interval '1 hour'`),
      )
    const failedCount = recentFailedTickets[0]?.count ?? 0
    checks.push({
      name: 'tickets.recent_failures',
      status: failedCount <= 2 ? 'pass' : failedCount <= 5 ? 'warn' : 'fail',
      message: `${failedCount} ticket(s) failed in last hour`,
      latencyMs: Date.now() - start,
    })
    if (failedCount > 5) {
      recommendations.push('High ticket failure rate — investigate root cause or escalate')
    }

    // Check 6: OpenClaw daemon health
    try {
      const { getOpenClawStatus } = await import('../../adapters/openclaw/bootstrap')
      const status = getOpenClawStatus()
      if (status.connected === false && status.lastSeen !== null) {
        checks.push({
          name: 'openclaw.connection',
          status: 'warn',
          message: `OpenClaw daemon disconnected (last seen: ${status.lastSeen.toISOString()})`,
          latencyMs: Date.now() - start,
        })
        recommendations.push('Check OpenClaw daemon process and network connectivity')
      } else if (status.connected && status.capabilities.providers === 0) {
        checks.push({
          name: 'openclaw.providers',
          status: 'warn',
          message: 'OpenClaw connected but reports 0 providers',
          latencyMs: Date.now() - start,
        })
        recommendations.push('Check OpenClaw provider configuration')
      } else if (status.connected) {
        checks.push({
          name: 'openclaw.connection',
          status: 'pass',
          message: `OpenClaw v${status.version} — ${status.capabilities.providers} providers, ${status.capabilities.skills} skills`,
          latencyMs: Date.now() - start,
        })
      }
    } catch {
      // OpenClaw not configured — skip
    }

    // Determine overall status
    const hasFailure = checks.some((c) => c.status === 'fail')
    const hasWarning = checks.some((c) => c.status === 'warn')
    const overallStatus: HealthStatus = hasFailure
      ? 'unhealthy'
      : hasWarning
        ? 'degraded'
        : 'healthy'

    return {
      timestamp: new Date(),
      overallStatus,
      checks,
      recommendations,
    }
  }

  /**
   * Build a HealthCheckOutput (matches engine contract).
   */
  async healthCheck(): Promise<HealthCheckOutput> {
    const report = await this.diagnose()
    return {
      status: report.overallStatus,
      checks: report.checks,
      timestamp: report.timestamp,
    }
  }

  // === Auto-Healing Actions ===

  /**
   * Restart an agent (set to idle, clear any locks).
   */
  async restartAgent(agentId: string, reason: string): Promise<boolean> {
    try {
      await this.db
        .update(agents)
        .set({
          status: 'idle',
          updatedAt: new Date(),
        })
        .where(eq(agents.id, agentId))

      // Clear any execution locks held by this agent
      await this.db
        .update(ticketExecution)
        .set({
          lockOwner: null,
          lockedAt: null,
          leaseUntil: null,
        })
        .where(eq(ticketExecution.lockOwner, agentId))

      this.log('restart_agent', agentId, reason, true)
      return true
    } catch (_err) {
      this.log('restart_agent', agentId, reason, false)
      return false
    }
  }

  /**
   * Clear expired execution leases and requeue affected tickets.
   */
  async clearExpiredLeases(): Promise<number> {
    const expired = await this.db
      .select()
      .from(ticketExecution)
      .where(
        and(
          lte(ticketExecution.leaseUntil, new Date()),
          sql`${ticketExecution.lockOwner} is not null`,
        ),
      )

    for (const lease of expired) {
      await this.db
        .update(ticketExecution)
        .set({
          lockOwner: null,
          lockedAt: null,
          leaseUntil: null,
        })
        .where(eq(ticketExecution.ticketId, lease.ticketId))

      // Requeue the ticket
      await this.db
        .update(tickets)
        .set({
          status: 'queued',
          assignedAgentId: null,
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, lease.ticketId))

      this.log('clear_lock', lease.ticketId, 'Expired lease', true)
    }

    return expired.length
  }

  /**
   * Requeue a failed ticket for retry.
   */
  async requeueTicket(ticketId: string, reason: string): Promise<boolean> {
    try {
      await this.db
        .update(tickets)
        .set({
          status: 'queued',
          assignedAgentId: null,
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, ticketId))

      this.log('requeue_ticket', ticketId, reason, true)
      return true
    } catch (e) {
      console.warn('[Healing] Operation failed:', e)
      this.log('requeue_ticket', ticketId, reason, false)
      return false
    }
  }

  /**
   * Run auto-heal: diagnose and take corrective actions.
   */
  async autoHeal(): Promise<{
    report: DiagnosticReport
    actions: HealingRecord[]
  }> {
    const report = await this.diagnose()
    const actions: HealingRecord[] = []

    // Auto-clear expired leases
    const cleared = await this.clearExpiredLeases()
    if (cleared > 0) {
      actions.push({
        action: 'clear_lock',
        target: `${cleared} leases`,
        reason: 'Expired execution leases',
        timestamp: new Date(),
        success: true,
      })
    }

    // Auto-restart error agents
    const errorAgents = await this.db.query.agents.findMany({
      where: eq(agents.status, 'error'),
    })
    for (const agent of errorAgents) {
      const success = await this.restartAgent(agent.id, 'Auto-heal: agent in error state')
      actions.push({
        action: 'restart_agent',
        target: agent.name,
        reason: 'Agent in error state',
        timestamp: new Date(),
        success,
      })
    }

    // Auto-reconnect OpenClaw if disconnected
    if (report.checks.some((c) => c.name === 'openclaw.connection' && c.status === 'warn')) {
      try {
        const { getOpenClawClient } = await import('../../adapters/openclaw/bootstrap')
        const client = getOpenClawClient()
        if (client && !client.isConnected()) {
          await client.connect()
          actions.push({
            action: 'reconnect_openclaw',
            target: 'daemon',
            reason: 'OpenClaw daemon disconnected',
            timestamp: new Date(),
            success: true,
          })
        }
      } catch {
        actions.push({
          action: 'reconnect_openclaw',
          target: 'daemon',
          reason: 'OpenClaw daemon disconnected',
          timestamp: new Date(),
          success: false,
        })
      }
    }

    return { report, actions }
  }

  /**
   * Get recent healing actions from DB.
   */
  async getHealingLog(limit = 50): Promise<HealingRecord[]> {
    const rows = await this.db
      .select()
      .from(healingLogs)
      .orderBy(desc(healingLogs.createdAt))
      .limit(limit)
    return rows.map((r) => ({
      action: r.action as HealingAction,
      target: r.target,
      reason: r.reason,
      timestamp: r.createdAt,
      success: r.success,
    }))
  }

  private log(action: HealingAction, target: string, reason: string, success: boolean) {
    // Fire-and-forget DB write
    this.db
      .insert(healingLogs)
      .values({ action, target, reason, success })
      .catch(() => {
        // Silently fail — healing log is non-critical
      })
  }
}
