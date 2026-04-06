/**
 * Debate Engine — Collective Decision-Making through Multi-Agent Deliberation
 *
 * When a strategic decision needs multiple perspectives, the debate engine:
 *   1. Selects participant agents (by ID or top idle agents)
 *   2. Collects each agent's position via the LLM gateway
 *   3. Resolves the debate using reputation-weighted voting
 *   4. Persists the full debate record for auditability
 */

import type { Database } from '@solarc/db'
import { agents, collectiveDebates } from '@solarc/db'
import { desc, eq, inArray } from 'drizzle-orm'

import { logger } from '../../../lib/logger'

// ── Types ────────────────────────────────────────────────────────────────

interface DebatePosition {
  agentId: string
  agentName: string
  position: string
  weight: number
  reasoning: string
}

// ── Engine ───────────────────────────────────────────────────────────────

export class DebateEngine {
  constructor(private db: Database) {}

  /**
   * Trigger a multi-agent debate on a given topic.
   *
   * Each participant is asked to SUPPORT or OPPOSE the topic.
   * Final outcome is determined by weighted vote (reputation-based weights).
   */
  async triggerDebate(topic: string, context: string, agentIds?: string[]): Promise<string> {
    // 1. Select participants
    let participants
    if (agentIds?.length) {
      participants = await this.db.select().from(agents).where(inArray(agents.id, agentIds))
    } else {
      participants = await this.db.query.agents.findMany({
        where: eq(agents.status, 'idle'),
        limit: 5,
      })
    }

    if (participants.length === 0) {
      logger.warn({ topic }, 'debate: no participants available')
      const [debate] = await this.db
        .insert(collectiveDebates)
        .values({
          topic,
          context,
          positions: [],
          outcome: 'no_quorum',
          reasoning: 'No agents available to participate in the debate.',
          participantCount: 0,
        })
        .returning({ id: collectiveDebates.id })
      return debate?.id ?? ''
    }

    // 2. Collect positions from each agent via gateway
    const { GatewayRouter } = await import('../gateway')
    const { WorkMarket } = await import('./work-market')
    const gateway = new GatewayRouter(this.db)
    const market = new WorkMarket(this.db)

    const positions: DebatePosition[] = []

    for (const agent of participants) {
      const result = await gateway
        .chat({
          model: agent.model ?? undefined,
          messages: [
            {
              role: 'system',
              content: agent.soul ?? 'You are a decision-making agent.',
            },
            {
              role: 'user',
              content: `DEBATE TOPIC: ${topic}\n\nCONTEXT: ${context}\n\nProvide your position on this topic. State clearly: SUPPORT or OPPOSE, followed by your reasoning.`,
            },
          ],
        })
        .catch((err: unknown) => {
          logger.warn(
            { err: err instanceof Error ? err : undefined, agentId: agent.id },
            'debate: agent position collection failed',
          )
          return { content: 'No position available' }
        })

      const rep = await market.getReputation(agent.id)
      const weight = rep?.successRate ?? 0.5

      positions.push({
        agentId: agent.id,
        agentName: agent.name,
        position: result.content.slice(0, 500),
        weight,
        reasoning: result.content,
      })
    }

    // 3. Resolve via weighted vote
    const { outcome, reasoning } = this.resolvePositions(positions)

    // 4. Persist debate
    const [debate] = await this.db
      .insert(collectiveDebates)
      .values({
        topic,
        context,
        positions,
        outcome,
        reasoning,
        participantCount: positions.length,
      })
      .returning({ id: collectiveDebates.id })

    logger.info(
      { debateId: debate?.id, outcome, participants: positions.length },
      'debate: resolved',
    )
    return debate?.id ?? ''
  }

  /**
   * Resolve positions using reputation-weighted voting.
   * Agents with higher success rates have stronger votes.
   */
  private resolvePositions(positions: DebatePosition[]): { outcome: string; reasoning: string } {
    let supportWeight = 0
    let opposeWeight = 0
    const supportReasons: string[] = []
    const opposeReasons: string[] = []

    for (const p of positions) {
      const isSupport = p.position.toUpperCase().includes('SUPPORT')
      if (isSupport) {
        supportWeight += p.weight
        supportReasons.push(`${p.agentName}: ${p.reasoning.slice(0, 100)}`)
      } else {
        opposeWeight += p.weight
        opposeReasons.push(`${p.agentName}: ${p.reasoning.slice(0, 100)}`)
      }
    }

    const outcome = supportWeight > opposeWeight ? 'approved' : 'rejected'
    const topReasons = outcome === 'approved' ? supportReasons.join('; ') : opposeReasons.join('; ')
    const reasoning = `Support: ${supportWeight.toFixed(2)} vs Oppose: ${opposeWeight.toFixed(2)}. ${topReasons}`
    return { outcome, reasoning }
  }

  /**
   * Retrieve recent debate history.
   */
  async getDebateHistory(limit = 20) {
    return this.db.query.collectiveDebates.findMany({
      orderBy: desc(collectiveDebates.createdAt),
      limit,
    })
  }
}
