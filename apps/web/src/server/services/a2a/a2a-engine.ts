/**
 * A2A (Agent-to-Agent) Delegation Engine
 *
 * Enables agents to discover and delegate tasks to each other:
 * - Agent card registry (capability advertisement)
 * - Task delegation with context passing
 * - Callback-based result delivery
 * - Skill-based agent discovery
 */

import type { Database } from '@solarc/db'
import { agentCards, agents } from '@solarc/db'
import { eq, sql } from 'drizzle-orm'
import type { AgentCard, A2ADelegateInput } from '@solarc/engine-contracts'

export type DelegationStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'failed' | 'rejected'

export interface DelegationResult {
  delegationId: string
  status: DelegationStatus
  result?: unknown
  error?: string
}

/** In-memory delegation tracking (would be DB-backed in production) */
const delegations = new Map<string, {
  input: A2ADelegateInput
  status: DelegationStatus
  result?: unknown
  error?: string
  createdAt: Date
}>()

export class A2AEngine {
  constructor(private db: Database) {}

  // === Agent Card Registry ===

  /**
   * Register or update an agent's capability card.
   */
  async registerCard(
    agentId: string,
    card: { capabilities?: unknown; authRequirements?: unknown; endpoint?: string },
  ): Promise<void> {
    const existing = await this.db.query.agentCards.findFirst({
      where: eq(agentCards.agentId, agentId),
    })

    if (existing) {
      await this.db.update(agentCards).set({
        capabilities: card.capabilities,
        authRequirements: card.authRequirements,
        endpoint: card.endpoint,
        updatedAt: new Date(),
      }).where(eq(agentCards.agentId, agentId))
    } else {
      await this.db.insert(agentCards).values({
        agentId,
        capabilities: card.capabilities,
        authRequirements: card.authRequirements,
        endpoint: card.endpoint,
      })
    }
  }

  /**
   * Get an agent's card.
   */
  async getCard(agentId: string) {
    return this.db.query.agentCards.findFirst({
      where: eq(agentCards.agentId, agentId),
    })
  }

  /**
   * List all registered agent cards.
   */
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

  /**
   * Discover agents by skill/capability.
   * Searches agent cards and agent skills for matches.
   */
  async discover(skill: string): Promise<Array<{
    agentId: string
    agentName: string
    matchType: 'card' | 'skill'
    endpoint?: string | null
  }>> {
    const results: Array<{
      agentId: string
      agentName: string
      matchType: 'card' | 'skill'
      endpoint?: string | null
    }> = []

    // Search agent skills
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

    // Search agent cards (check if capabilities JSON contains the skill)
    const allCards = await this.listCards()
    for (const card of allCards) {
      const caps = card.capabilities as Record<string, unknown> | null
      if (caps && JSON.stringify(caps).toLowerCase().includes(skill.toLowerCase())) {
        // Avoid duplicates
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

  // === Task Delegation ===

  /**
   * Delegate a task to another agent.
   */
  async delegate(input: A2ADelegateInput): Promise<string> {
    const delegationId = crypto.randomUUID()

    delegations.set(delegationId, {
      input,
      status: 'pending',
      createdAt: new Date(),
    })

    return delegationId
  }

  /**
   * Accept a delegation.
   */
  async accept(delegationId: string): Promise<void> {
    const delegation = delegations.get(delegationId)
    if (!delegation) throw new Error(`Delegation ${delegationId} not found`)
    delegation.status = 'accepted'
  }

  /**
   * Reject a delegation.
   */
  async reject(delegationId: string, reason?: string): Promise<void> {
    const delegation = delegations.get(delegationId)
    if (!delegation) throw new Error(`Delegation ${delegationId} not found`)
    delegation.status = 'rejected'
    delegation.error = reason
  }

  /**
   * Mark a delegation as in progress.
   */
  async markInProgress(delegationId: string): Promise<void> {
    const delegation = delegations.get(delegationId)
    if (!delegation) throw new Error(`Delegation ${delegationId} not found`)
    delegation.status = 'in_progress'
  }

  /**
   * Complete a delegation with a result.
   */
  async complete(delegationId: string, result: unknown): Promise<void> {
    const delegation = delegations.get(delegationId)
    if (!delegation) throw new Error(`Delegation ${delegationId} not found`)
    delegation.status = 'completed'
    delegation.result = result
  }

  /**
   * Fail a delegation.
   */
  async fail(delegationId: string, error: string): Promise<void> {
    const delegation = delegations.get(delegationId)
    if (!delegation) throw new Error(`Delegation ${delegationId} not found`)
    delegation.status = 'failed'
    delegation.error = error
  }

  /**
   * Get delegation status.
   */
  async getStatus(delegationId: string): Promise<DelegationResult> {
    const delegation = delegations.get(delegationId)
    if (!delegation) throw new Error(`Delegation ${delegationId} not found`)
    return {
      delegationId,
      status: delegation.status,
      result: delegation.result,
      error: delegation.error,
    }
  }

  /**
   * List pending delegations for an agent.
   */
  async pendingFor(agentId: string): Promise<Array<{ delegationId: string; task: string; context?: unknown }>> {
    const results: Array<{ delegationId: string; task: string; context?: unknown }> = []
    for (const [id, delegation] of delegations) {
      if (delegation.input.agentId === agentId && delegation.status === 'pending') {
        results.push({
          delegationId: id,
          task: delegation.input.task,
          context: delegation.input.context,
        })
      }
    }
    return results
  }

  /**
   * Remove an agent's card.
   */
  async removeCard(agentId: string): Promise<void> {
    await this.db.delete(agentCards).where(eq(agentCards.agentId, agentId))
  }
}
