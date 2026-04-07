/**
 * Ticket Execution Engine
 *
 * Manages the lifecycle of tickets through DAG-based scheduling:
 * - Agent assignment (by skills, workload, affinity)
 * - Execution locking with lease-based concurrency
 * - DAG dependency resolution (topological ordering)
 * - Status transitions with history tracking
 */

import type { Database } from '@solarc/db'
import {
  agents,
  ticketComments,
  ticketDependencies,
  ticketExecution,
  tickets,
  ticketStatusHistory,
} from '@solarc/db'
import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'

import { logger } from '../../../lib/logger'
import { NotFoundError, ValidationError } from '../../errors'
import { eventBus } from './event-bus'

export type TicketStatus =
  | 'backlog'
  | 'queued'
  | 'in_progress'
  | 'review'
  | 'done'
  | 'failed'
  | 'cancelled'

/** Valid status transitions */
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  backlog: ['queued', 'cancelled'],
  queued: ['in_progress', 'cancelled'],
  in_progress: ['review', 'done', 'failed', 'cancelled'],
  review: ['done', 'failed', 'in_progress'],
  done: [],
  failed: ['queued', 'cancelled'],
  cancelled: ['backlog'],
}

export interface AssignmentStrategy {
  type: 'round_robin' | 'least_loaded' | 'skill_match' | 'affinity' | 'market'
}

export class TicketExecutionEngine {
  constructor(private db: Database) {}

  /**
   * Transition a ticket's status with validation and history tracking.
   */
  async transition(ticketId: string, toStatus: TicketStatus, agentId?: string): Promise<void> {
    const ticket = await this.db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) })
    if (!ticket) throw new NotFoundError('Ticket', ticketId)

    const allowed = TRANSITIONS[ticket.status as TicketStatus] ?? []
    if (!allowed.includes(toStatus)) {
      throw new ValidationError(`Invalid transition: ${ticket.status} → ${toStatus}`)
    }

    await this.db.transaction(async (tx) => {
      await tx.insert(ticketStatusHistory).values({
        ticketId,
        fromStatus: ticket.status,
        toStatus,
      })

      const updates: Record<string, unknown> = { status: toStatus, updatedAt: new Date() }

      if (toStatus === 'in_progress' && agentId) {
        updates.assignedAgentId = agentId
      }

      await tx.update(tickets).set(updates).where(eq(tickets.id, ticketId))
    })
  }

  /**
   * Acquire an execution lock on a ticket.
   * Uses lease-based locking to prevent double-execution.
   */
  async acquireLock(ticketId: string, agentId: string, leaseSeconds = 300): Promise<boolean> {
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000)
    const runId = crypto.randomUUID()

    // Atomic update: claim only if unlocked or lease expired (prevents TOCTOU race)
    const result = await this.db
      .update(ticketExecution)
      .set({
        lockOwner: agentId,
        lockedAt: now,
        leaseUntil,
        leaseSeconds,
        runId,
      })
      .where(
        and(
          eq(ticketExecution.ticketId, ticketId),
          or(
            isNull(ticketExecution.lockOwner),
            lte(ticketExecution.leaseUntil, now),
            eq(ticketExecution.lockOwner, agentId),
          ),
        ),
      )
      .returning()

    if (result.length > 0) return true

    // No row existed — try insert (another agent may beat us, so catch conflicts)
    try {
      await this.db.insert(ticketExecution).values({
        ticketId,
        lockOwner: agentId,
        lockedAt: now,
        leaseUntil,
        leaseSeconds,
        runId,
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Release an execution lock.
   */
  async releaseLock(ticketId: string, agentId: string): Promise<void> {
    await this.db
      .update(ticketExecution)
      .set({
        lockOwner: null,
        lockedAt: null,
        leaseUntil: null,
      })
      .where(and(eq(ticketExecution.ticketId, ticketId), eq(ticketExecution.lockOwner, agentId)))
  }

  /**
   * Renew an existing lease.
   */
  async renewLease(ticketId: string, agentId: string, leaseSeconds = 300): Promise<boolean> {
    const leaseUntil = new Date(Date.now() + leaseSeconds * 1000)
    const result = await this.db
      .update(ticketExecution)
      .set({ leaseUntil })
      .where(and(eq(ticketExecution.ticketId, ticketId), eq(ticketExecution.lockOwner, agentId)))
      .returning()
    return result.length > 0
  }

  /**
   * Resolve DAG dependencies: return tickets that are ready to execute
   * (all blockers are done).
   */
  async getReadyTickets(workspaceId?: string): Promise<Array<typeof tickets.$inferSelect>> {
    // Get all queued tickets
    const conditions = [eq(tickets.status, 'queued')]
    if (workspaceId) conditions.push(eq(tickets.workspaceId, workspaceId))

    const queuedTickets = await this.db.query.tickets.findMany({
      where: and(...conditions),
    })

    if (queuedTickets.length === 0) return []

    // Get all dependencies for queued tickets
    const queuedIds = queuedTickets.map((t) => t.id)
    const deps = await this.db
      .select()
      .from(ticketDependencies)
      .where(inArray(ticketDependencies.ticketId, queuedIds))

    // Build blocked-by map
    const blockedBy = new Map<string, string[]>()
    for (const dep of deps) {
      const existing = blockedBy.get(dep.ticketId) ?? []
      existing.push(dep.blockedByTicketId)
      blockedBy.set(dep.ticketId, existing)
    }

    // Check which blockers are done
    const allBlockerIds = [...new Set(deps.map((d) => d.blockedByTicketId))]
    const blockerStatuses =
      allBlockerIds.length > 0
        ? await this.db
            .select({ id: tickets.id, status: tickets.status })
            .from(tickets)
            .where(inArray(tickets.id, allBlockerIds))
        : []

    const doneBlockers = new Set(
      blockerStatuses.filter((b) => b.status === 'done').map((b) => b.id),
    )

    // Ready = no unresolved blockers
    return queuedTickets.filter((t) => {
      const blockingIds = blockedBy.get(t.id) ?? []
      return blockingIds.every((bid) => doneBlockers.has(bid))
    })
  }

  /**
   * Assign a ticket to the best available agent.
   */
  async assignAgent(
    ticketId: string,
    strategy: AssignmentStrategy = { type: 'least_loaded' },
    workspaceId?: string,
  ): Promise<string | null> {
    const ticket = await this.db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) })
    if (!ticket) return null

    // Goal-aware priority boosting: boost tickets aligned with at-risk goals
    try {
      const { GoalCascadeEngine } = await import('./goal-cascade')
      const cascade = new GoalCascadeEngine()
      const atRiskGoals = cascade.getAtRiskGoals()
      if (atRiskGoals.length > 0 && ticket.priority !== 'critical') {
        const meta = ticket.metadata as Record<string, unknown> | null
        const goalAlignment = meta?.goalAlignment as { okrId?: string } | undefined
        if (goalAlignment?.okrId) {
          const boosted =
            ticket.priority === 'medium'
              ? 'high'
              : ticket.priority === 'high'
                ? 'critical'
                : ticket.priority
          if (boosted !== ticket.priority) {
            await this.db
              .update(tickets)
              .set({ priority: boosted as typeof ticket.priority })
              .where(eq(tickets.id, ticketId))
          }
        }
      }
    } catch {
      // goal cascade failure shouldn't block assignment
    }

    const wsId = workspaceId ?? ticket.workspaceId
    const conditions = [eq(agents.status, 'idle')]
    if (wsId) conditions.push(eq(agents.workspaceId, wsId))

    const availableAgents = await this.db.query.agents.findMany({
      where: and(...conditions),
    })

    if (availableAgents.length === 0) return null

    let selectedAgent: (typeof availableAgents)[0]

    switch (strategy.type) {
      case 'skill_match': {
        // Prefer agents whose skills overlap with ticket metadata
        const requiredSkills = (ticket.metadata as Record<string, unknown> | null)
          ?.requiredSkills as string[] | undefined
        if (requiredSkills?.length) {
          const scored = availableAgents.map((a) => ({
            agent: a,
            score: (a.skills ?? []).filter((s) => requiredSkills.includes(s)).length,
          }))
          scored.sort((a, b) => b.score - a.score)
          selectedAgent = scored[0]!.agent
        } else {
          selectedAgent = availableAgents[0]!
        }
        break
      }
      case 'least_loaded': {
        // Pick agent with fewest in-progress tickets
        const loadCounts = await this.db
          .select({
            agentId: tickets.assignedAgentId,
            count: sql<number>`count(*)`,
          })
          .from(tickets)
          .where(
            and(
              eq(tickets.status, 'in_progress'),
              inArray(
                tickets.assignedAgentId,
                availableAgents.map((a) => a.id),
              ),
            ),
          )
          .groupBy(tickets.assignedAgentId)

        const loadMap = new Map(loadCounts.map((l) => [l.agentId, l.count]))
        availableAgents.sort((a, b) => (loadMap.get(a.id) ?? 0) - (loadMap.get(b.id) ?? 0))
        selectedAgent = availableAgents[0]!
        break
      }
      case 'market': {
        // Auto-bid all available agents and award to highest scorer
        const { WorkMarket } = await import('./work-market')
        const market = new WorkMarket(this.db)
        const listing = await market.list({
          ticketId,
          title: ticket.title ?? ticketId,
          requiredSkills:
            ((ticket.metadata as Record<string, unknown> | null)?.requiredSkills as string[]) ?? [],
          priority: ticket.priority ?? 'medium',
          complexity: (ticket.complexity as 'easy' | 'medium' | 'hard') ?? 'medium',
        })
        for (const agent of availableAgents) {
          await market.bid(listing.ticketId, {
            agentId: agent.id,
            agentName: agent.name,
            skills: (agent.skills as string[]) ?? [],
            currentLoad: 0.5, // TODO: compute from active tickets
            avgCompletionMs: 10000,
          })
        }
        const winner = await market.award(listing.ticketId)
        if (winner) {
          await this.db
            .update(tickets)
            .set({
              assignedAgentId: winner.agentId,
              updatedAt: new Date(),
            })
            .where(eq(tickets.id, ticketId))
          return winner.agentId
        }
        return null
      }
      default: // round_robin, affinity — fall through to first available
        selectedAgent = availableAgents[0]!
    }

    // Assign
    await this.db
      .update(tickets)
      .set({
        assignedAgentId: selectedAgent.id,
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, ticketId))

    return selectedAgent.id
  }

  /**
   * Add a dependency: ticketId is blocked by blockedByTicketId.
   */
  async addDependency(ticketId: string, blockedByTicketId: string): Promise<void> {
    await this.db.insert(ticketDependencies).values({ ticketId, blockedByTicketId })
  }

  /**
   * Complete a ticket with a result.
   */
  async complete(ticketId: string, result: string, agentId?: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(tickets)
        .set({
          status: 'done',
          result,
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, ticketId))

      await tx.insert(ticketStatusHistory).values({
        ticketId,
        fromStatus: 'in_progress',
        toStatus: 'done',
      })

      // Release lock
      if (agentId) {
        await tx
          .update(ticketExecution)
          .set({
            lockOwner: null,
            lockedAt: null,
            leaseUntil: null,
          })
          .where(eq(ticketExecution.ticketId, ticketId))

        // Set agent back to idle only if currently in execution
        await tx
          .update(agents)
          .set({ status: 'idle', updatedAt: new Date() })
          .where(and(eq(agents.id, agentId), eq(agents.status, 'executing')))
      }
    })

    // Notify OpenClaw of completion (non-blocking)
    this.notifyOpenClaw('ticket.completed', { ticketId, result: result.slice(0, 500) }).catch(
      () => {},
    )

    // Emit lifecycle event
    await eventBus.emit('ticket.completed', { ticketId, agentId })
  }

  /**
   * Fail a ticket with an error reason.
   */
  async fail(ticketId: string, reason: string, agentId?: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(tickets)
        .set({
          status: 'failed',
          result: reason,
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, ticketId))

      await tx.insert(ticketStatusHistory).values({
        ticketId,
        fromStatus: 'in_progress',
        toStatus: 'failed',
      })

      await tx.insert(ticketComments).values({
        ticketId,
        agentId,
        text: `Execution failed: ${reason}`,
      })

      if (agentId) {
        await tx
          .update(ticketExecution)
          .set({
            lockOwner: null,
            lockedAt: null,
            leaseUntil: null,
          })
          .where(eq(ticketExecution.ticketId, ticketId))

        await tx
          .update(agents)
          .set({ status: 'idle', updatedAt: new Date() })
          .where(and(eq(agents.id, agentId), eq(agents.status, 'executing')))
      }
    })

    // Notify OpenClaw of failure (non-blocking)
    this.notifyOpenClaw('ticket.failed', { ticketId, reason: reason.slice(0, 500) }).catch((err) =>
      logger.warn(
        { err: err instanceof Error ? err : undefined },
        '[TicketEngine] notification failed',
      ),
    )

    // Emit lifecycle event
    await eventBus.emit('ticket.failed', { ticketId, agentId, reason })
  }

  /** Push execution events to OpenClaw ops channel (fire-and-forget). */
  private async notifyOpenClaw(event: string, data: Record<string, unknown>): Promise<void> {
    const { getOpenClawClient } = await import('../../adapters/openclaw/bootstrap')
    const client = getOpenClawClient()
    if (!client?.isConnected()) return
    const { OpenClawChannels } = await import('../../adapters/openclaw/channels')
    const channels = new OpenClawChannels(client)
    await channels.sendMessage('ops', 'system', JSON.stringify({ event, ...data }))
  }

  /**
   * Get expired leases (for recovery/requeue).
   */
  async getExpiredLeases(): Promise<Array<typeof ticketExecution.$inferSelect>> {
    return this.db
      .select()
      .from(ticketExecution)
      .where(
        and(
          lte(ticketExecution.leaseUntil, new Date()),
          sql`${ticketExecution.lockOwner} is not null`,
        ),
      )
  }
}
