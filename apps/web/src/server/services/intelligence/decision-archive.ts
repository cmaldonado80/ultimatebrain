/**
 * Decision Archive — institutional memory for the AI Corporation.
 *
 * Records every high-impact decision with reasoning, assumptions,
 * and expected outcomes. Tracks assumption validity over time.
 * Generates playbooks from recurring patterns and postmortems
 * from failed decisions.
 */

import type { Database } from '@solarc/db'
import { decisionRecords } from '@solarc/db'
import { desc, eq } from 'drizzle-orm'

import { logger } from '../../../lib/logger'

// ── Types ────────────────────────────────────────────────────────────────

export interface DecisionRecord {
  id: string
  type: string // 'evolution' | 'restructuring' | 'initiative' | 'debate' | 'hiring' | 'budget'
  description: string
  assumptions: Record<string, string> // key assumption → expected value
  stakeholders: string[] // agent names involved
  expectedOutcome: string
  actualOutcome?: string
  status: 'pending' | 'validated' | 'failed' | 'mixed'
  createdAt: Date
}

export interface Playbook {
  pattern: string
  steps: string[]
  decisionCount: number
  successRate: number
}

// ── Decision Archive ─────────────────────────────────────────────────────

export class DecisionArchive {
  constructor(private db: Database) {}

  /**
   * Record a high-impact decision.
   */
  async recordDecision(input: {
    type: string
    description: string
    assumptions?: Record<string, string>
    stakeholders?: string[]
    expectedOutcome?: string
  }): Promise<string> {
    const [record] = await this.db
      .insert(decisionRecords)
      .values({
        type: input.type,
        description: input.description,
        assumptions: input.assumptions ?? {},
        stakeholders: input.stakeholders ?? [],
        expectedOutcome: input.expectedOutcome ?? '',
        status: 'pending',
      })
      .returning({ id: decisionRecords.id })

    if (!record) throw new Error('Failed to create decision record')

    logger.info(
      { decisionId: record.id, type: input.type },
      `decision-archive: recorded "${input.description.slice(0, 60)}"`,
    )

    return record.id
  }

  /**
   * Update decision outcome after validation period.
   */
  async updateOutcome(
    decisionId: string,
    actualOutcome: string,
    status: 'validated' | 'failed' | 'mixed',
  ): Promise<void> {
    await this.db
      .update(decisionRecords)
      .set({
        actualOutcome,
        status,
      })
      .where(eq(decisionRecords.id, decisionId))
  }

  /**
   * Generate playbooks from recurring decision patterns.
   * Groups decisions by type, extracts common steps.
   */
  async generatePlaybooks(): Promise<Playbook[]> {
    const decisions = await this.db.query.decisionRecords.findMany({
      orderBy: desc(decisionRecords.createdAt),
      limit: 200,
    })

    // Group by type
    const byType = new Map<string, typeof decisions>()
    for (const d of decisions) {
      const existing = byType.get(d.type) ?? []
      existing.push(d)
      byType.set(d.type, existing)
    }

    const playbooks: Playbook[] = []
    for (const [type, group] of byType) {
      if (group.length < 3) continue // need 3+ decisions to form a playbook

      const validated = group.filter((d) => d.status === 'validated')
      const successRate = group.length > 0 ? validated.length / group.length : 0

      playbooks.push({
        pattern: type,
        steps: [
          `1. Identify ${type} opportunity`,
          `2. Gather context and stakeholders`,
          `3. Evaluate assumptions (${Object.keys((group[0]?.assumptions as Record<string, string>) ?? {}).length} typical)`,
          `4. Execute decision`,
          `5. Validate outcome after 30 days`,
        ],
        decisionCount: group.length,
        successRate,
      })
    }

    logger.info({ playbooks: playbooks.length }, 'decision-archive: playbooks generated')

    return playbooks
  }

  /**
   * Generate postmortem for a failed decision.
   */
  async generatePostmortem(decisionId: string): Promise<string> {
    const decision = await this.db.query.decisionRecords.findFirst({
      where: eq(decisionRecords.id, decisionId),
    })

    if (!decision) return 'Decision not found'

    const assumptions = decision.assumptions as Record<string, string>
    const assumptionList = Object.entries(assumptions)
      .map(([k, v]) => `- ${k}: expected "${v}"`)
      .join('\n')

    return [
      `## Postmortem: ${decision.description}`,
      `**Type:** ${decision.type}`,
      `**Status:** ${decision.status}`,
      `**Expected:** ${decision.expectedOutcome}`,
      `**Actual:** ${decision.actualOutcome ?? 'Unknown'}`,
      '',
      `### Assumptions`,
      assumptionList || '(none recorded)',
      '',
      `### Lessons Learned`,
      `Review which assumptions failed and update instincts accordingly.`,
    ].join('\n')
  }

  /**
   * Get recent decisions.
   */
  async getDecisions(limit = 50): Promise<DecisionRecord[]> {
    return this.db.query.decisionRecords.findMany({
      orderBy: desc(decisionRecords.createdAt),
      limit,
    }) as unknown as DecisionRecord[]
  }
}
