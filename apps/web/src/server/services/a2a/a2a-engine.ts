/**
 * A2A (Agent-to-Agent) Delegation Engine
 *
 * Enables agents to discover and delegate tasks to each other:
 * - Agent card registry (capability advertisement)
 * - Task delegation with context passing + fromAgentId tracking
 * - Skill-based agent discovery
 * - Delegation lifecycle: pending → accepted → in_progress → completed/failed/cancelled
 */

import type { Database } from '@solarc/db'
import { a2aDelegations, agentCards, agents } from '@solarc/db'
import type { A2ADelegateInput } from '@solarc/engine-contracts'
import { and, desc, eq, lte, sql } from 'drizzle-orm'

import type { Span, Tracer } from '../platform/tracer'

export type DelegationStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'cancelled'

export interface DelegationResult {
  delegationId: string
  status: DelegationStatus
  result?: unknown
  error?: string
}

export class A2AEngine {
  constructor(private db: Database) {}

  // === Agent Card Registry ===

  async registerCard(
    agentId: string,
    card: { capabilities?: unknown; authRequirements?: unknown; endpoint?: string },
  ): Promise<void> {
    const existing = await this.db.query.agentCards.findFirst({
      where: eq(agentCards.agentId, agentId),
    })

    if (existing) {
      await this.db
        .update(agentCards)
        .set({
          capabilities: card.capabilities,
          authRequirements: card.authRequirements,
          endpoint: card.endpoint,
          updatedAt: new Date(),
        })
        .where(eq(agentCards.agentId, agentId))
    } else {
      await this.db.insert(agentCards).values({
        agentId,
        capabilities: card.capabilities,
        authRequirements: card.authRequirements,
        endpoint: card.endpoint,
      })
    }
  }

  async getCard(agentId: string) {
    return this.db.query.agentCards.findFirst({
      where: eq(agentCards.agentId, agentId),
    })
  }

  async listCards() {
    return this.db
      .select({
        agentId: agentCards.agentId,
        capabilities: agentCards.capabilities,
        authRequirements: agentCards.authRequirements,
        endpoint: agentCards.endpoint,
        agentName: agents.name,
        agentStatus: agents.status,
      })
      .from(agentCards)
      .innerJoin(agents, eq(agentCards.agentId, agents.id))
  }

  async discover(skill: string): Promise<
    Array<{
      agentId: string
      agentName: string
      matchType: 'card' | 'skill'
      endpoint?: string | null
    }>
  > {
    const results: Array<{
      agentId: string
      agentName: string
      matchType: 'card' | 'skill'
      endpoint?: string | null
    }> = []

    const skillAgents = await this.db
      .select()
      .from(agents)
      .where(sql`${skill} = ANY(${agents.skills})`)
    for (const agent of skillAgents) {
      results.push({
        agentId: agent.id,
        agentName: agent.name,
        matchType: 'skill',
      })
    }

    const allCards = await this.listCards()
    for (const card of allCards) {
      const caps = card.capabilities as Record<string, unknown> | null
      if (caps && JSON.stringify(caps).toLowerCase().includes(skill.toLowerCase())) {
        if (!results.find((r) => r.agentId === card.agentId)) {
          results.push({
            agentId: card.agentId,
            agentName: card.agentName,
            matchType: 'card',
            endpoint: card.endpoint,
          })
        }
      }
    }

    return results
  }

  // === Task Delegation (DB-backed) ===

  async delegate(input: A2ADelegateInput, tracer?: Tracer, parentSpan?: Span): Promise<string> {
    const span = tracer?.start('a2a.delegate', {
      traceId: parentSpan?.traceId,
      parentSpanId: parentSpan?.spanId,
    })
    span?.setAttribute('a2a.toAgentId', input.agentId)
    span?.setAttribute('a2a.task', input.task.slice(0, 100))

    try {
      const [row] = await this.db
        .insert(a2aDelegations)
        .values({
          fromAgentId: input.fromAgentId ?? null,
          toAgentId: input.agentId,
          task: input.task,
          context: input.context,
          status: 'pending',
        })
        .returning({ id: a2aDelegations.id })

      span?.setAttribute('a2a.delegationId', row.id)
      return row.id
    } catch (err) {
      span?.recordError(err)
      throw err
    } finally {
      span?.end()
    }
  }

  async accept(delegationId: string): Promise<void> {
    const updated = await this.db
      .update(a2aDelegations)
      .set({ status: 'accepted' })
      .where(eq(a2aDelegations.id, delegationId))
      .returning({ id: a2aDelegations.id })
    if (updated.length === 0) throw new Error(`Delegation ${delegationId} not found`)
  }

  async reject(delegationId: string, reason?: string): Promise<void> {
    const updated = await this.db
      .update(a2aDelegations)
      .set({ status: 'rejected', error: reason ?? null, completedAt: new Date() })
      .where(eq(a2aDelegations.id, delegationId))
      .returning({ id: a2aDelegations.id })
    if (updated.length === 0) throw new Error(`Delegation ${delegationId} not found`)
  }

  async markInProgress(delegationId: string): Promise<void> {
    const updated = await this.db
      .update(a2aDelegations)
      .set({ status: 'in_progress' })
      .where(eq(a2aDelegations.id, delegationId))
      .returning({ id: a2aDelegations.id })
    if (updated.length === 0) throw new Error(`Delegation ${delegationId} not found`)
  }

  async complete(delegationId: string, result: unknown): Promise<void> {
    const serialized = typeof result === 'string' ? result : JSON.stringify(result)
    const updated = await this.db
      .update(a2aDelegations)
      .set({ status: 'completed', result: serialized, completedAt: new Date() })
      .where(eq(a2aDelegations.id, delegationId))
      .returning({ id: a2aDelegations.id })
    if (updated.length === 0) throw new Error(`Delegation ${delegationId} not found`)
  }

  async fail(delegationId: string, error: string): Promise<void> {
    const updated = await this.db
      .update(a2aDelegations)
      .set({ status: 'failed', error, completedAt: new Date() })
      .where(eq(a2aDelegations.id, delegationId))
      .returning({ id: a2aDelegations.id })
    if (updated.length === 0) throw new Error(`Delegation ${delegationId} not found`)
  }

  /** Cancel an in-progress or pending delegation. */
  async cancel(delegationId: string, reason?: string): Promise<void> {
    const updated = await this.db
      .update(a2aDelegations)
      .set({
        status: 'cancelled',
        error: reason ?? 'Cancelled by caller',
        completedAt: new Date(),
      })
      .where(
        and(
          eq(a2aDelegations.id, delegationId),
          sql`${a2aDelegations.status} IN ('pending', 'accepted', 'in_progress')`,
        ),
      )
      .returning({ id: a2aDelegations.id })
    if (updated.length === 0) {
      throw new Error(`Delegation ${delegationId} not found or already terminal`)
    }
  }

  async getStatus(delegationId: string): Promise<DelegationResult> {
    const row = await this.db.query.a2aDelegations.findFirst({
      where: eq(a2aDelegations.id, delegationId),
    })
    if (!row) throw new Error(`Delegation ${delegationId} not found`)
    return {
      delegationId: row.id,
      status: row.status as DelegationStatus,
      result: row.result ?? undefined,
      error: row.error ?? undefined,
    }
  }

  async pendingFor(
    agentId: string,
  ): Promise<Array<{ delegationId: string; task: string; context?: unknown }>> {
    const rows = await this.db
      .select({
        id: a2aDelegations.id,
        task: a2aDelegations.task,
        context: a2aDelegations.context,
      })
      .from(a2aDelegations)
      .where(and(eq(a2aDelegations.toAgentId, agentId), eq(a2aDelegations.status, 'pending')))
      .orderBy(desc(a2aDelegations.createdAt))

    return rows.map((r) => ({
      delegationId: r.id,
      task: r.task,
      context: r.context,
    }))
  }

  /**
   * Expire stale delegations that have been pending/in_progress beyond the TTL.
   * Called by a worker cron job.
   */
  async expireStale(ttlHours = 24): Promise<number> {
    const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000)
    const expired = await this.db
      .update(a2aDelegations)
      .set({
        status: 'failed',
        error: `Expired after ${ttlHours}h without completion`,
        completedAt: new Date(),
      })
      .where(
        and(
          sql`${a2aDelegations.status} IN ('pending', 'accepted', 'in_progress')`,
          lte(a2aDelegations.createdAt, cutoff),
        ),
      )
      .returning({ id: a2aDelegations.id })
    return expired.length
  }

  async removeCard(agentId: string): Promise<void> {
    await this.db.delete(agentCards).where(eq(agentCards.agentId, agentId))
  }
}
