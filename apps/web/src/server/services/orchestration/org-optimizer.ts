/**
 * Org Optimizer — Organizational Structure Analysis & Restructuring Proposals
 *
 * Periodically analyzes the agent workforce to detect bottlenecks:
 *   - Overloaded agents (>5 in-progress tickets)
 *   - Idle agents (no recent work in 7 days)
 *
 * Generates restructuring proposals for human review:
 *   - split_workload: Redistribute overloaded agent's tickets
 *   - consolidate: Merge or retire idle agents
 *   - hire_skill: Create new specialist agent for missing capability
 *   - create_specialist: Spin up a focused sub-agent
 */

import type { Database } from '@solarc/db'
import { agents, restructuringProposals, tickets } from '@solarc/db'
import { and, desc, eq, sql } from 'drizzle-orm'

import { logger } from '../../../lib/logger'

// ── Types ────────────────────────────────────────────────────────────────

interface Bottleneck {
  type: 'overloaded' | 'idle' | 'missing_skill' | 'slow_department'
  target: string
  detail: string
  severity: 'medium' | 'high' | 'critical'
}

// ── Engine ───────────────────────────────────────────────────────────────

export class OrgOptimizer {
  constructor(private db: Database) {}

  /**
   * Analyze the current workforce for bottlenecks.
   *
   * Returns a list of detected issues with severity ratings.
   */
  async analyzeBottlenecks(): Promise<Bottleneck[]> {
    const bottlenecks: Bottleneck[] = []

    // 1. Overloaded agents (>5 in-progress tickets)
    const overloaded = await this.db
      .select({
        agentId: tickets.assignedAgentId,
        count: sql<number>`count(*)::int`,
      })
      .from(tickets)
      .where(eq(tickets.status, 'in_progress'))
      .groupBy(tickets.assignedAgentId)

    for (const row of overloaded) {
      if (row.count > 5 && row.agentId) {
        bottlenecks.push({
          type: 'overloaded',
          target: row.agentId,
          detail: `${row.count} in-progress tickets`,
          severity: row.count > 10 ? 'critical' : 'high',
        })
      }
    }

    // 2. Idle agents (no tickets in last 7 days)
    const allAgents = await this.db.query.agents.findMany({
      where: eq(agents.status, 'idle'),
      limit: 100,
    })

    for (const agent of allAgents) {
      const [recent] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(tickets)
        .where(
          and(
            eq(tickets.assignedAgentId, agent.id),
            sql`${tickets.createdAt} > now() - interval '7 days'`,
          ),
        )
      if ((recent?.count ?? 0) === 0) {
        bottlenecks.push({
          type: 'idle',
          target: agent.id,
          detail: `Agent ${agent.name} has no recent work`,
          severity: 'medium',
        })
      }
    }

    return bottlenecks
  }

  /**
   * Generate restructuring proposals based on detected bottlenecks.
   *
   * Limits to 5 proposals per run to avoid overwhelming reviewers.
   */
  async generateProposals(): Promise<string[]> {
    const bottlenecks = await this.analyzeBottlenecks()
    const proposalIds: string[] = []

    for (const b of bottlenecks.slice(0, 5)) {
      let description = ''
      let type = ''

      switch (b.type) {
        case 'overloaded':
          type = 'split_workload'
          description = `Split workload for overloaded agent: ${b.detail}`
          break
        case 'idle':
          type = 'consolidate'
          description = `Consider consolidating idle agent: ${b.detail}`
          break
        case 'missing_skill':
          type = 'hire_skill'
          description = `Create specialist agent for missing skill: ${b.detail}`
          break
        default:
          type = 'consolidate'
          description = b.detail
      }

      const [proposal] = await this.db
        .insert(restructuringProposals)
        .values({
          type,
          description,
          metrics: b,
          status: 'proposed',
        })
        .returning({ id: restructuringProposals.id })

      if (proposal) proposalIds.push(proposal.id)
    }

    logger.info(
      { proposals: proposalIds.length, bottlenecks: bottlenecks.length },
      'org-optimizer: proposals generated',
    )
    return proposalIds
  }

  /**
   * Retrieve restructuring proposals, optionally filtered by status.
   */
  async getProposals(status?: string) {
    if (status) {
      return this.db.query.restructuringProposals.findMany({
        where: eq(restructuringProposals.status, status),
        orderBy: desc(restructuringProposals.createdAt),
        limit: 50,
      })
    }
    return this.db.query.restructuringProposals.findMany({
      orderBy: desc(restructuringProposals.createdAt),
      limit: 50,
    })
  }
}
