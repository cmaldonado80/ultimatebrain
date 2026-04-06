/**
 * Financial Governor — economic intelligence for the AI Corporation.
 *
 * Computes agent ROI, generates efficiency reports, and suggests
 * model optimizations. Turns cost from an observed metric into
 * an actively managed variable.
 */

import type { Database } from '@solarc/db'
import { tickets } from '@solarc/db'
import { and, eq, sql } from 'drizzle-orm'

import { logger } from '../../../lib/logger'

// ── Types ────────────────────────────────────────────────────────────────

export interface AgentROI {
  agentId: string
  agentName: string
  completedTickets: number
  totalTokenCost: number
  avgQuality: number
  roi: number // (completedTickets × avgQuality) / max(totalTokenCost, 1)
}

export interface EfficiencyReport {
  topPerformers: AgentROI[]
  bottomPerformers: AgentROI[]
  totalAgents: number
  avgROI: number
  recommendations: string[]
}

// ── Financial Governor ───────────────────────────────────────────────────

export class FinancialGovernor {
  constructor(private db: Database) {}

  /**
   * Compute ROI for all agents with recent activity.
   */
  async computeAgentROI(): Promise<AgentROI[]> {
    const allAgents = await this.db.query.agents.findMany({ limit: 200 })
    const results: AgentROI[] = []

    for (const agent of allAgents) {
      // Count completed tickets
      const [ticketRow] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(tickets)
        .where(and(eq(tickets.assignedAgentId, agent.id), eq(tickets.status, 'done')))
      const completedTickets = ticketRow?.count ?? 0
      if (completedTickets === 0) continue

      // Estimate token cost from ticket count (simplified — real impl would use token_usage table)
      const totalTokenCost = completedTickets * 5000 // rough estimate: 5k tokens per ticket
      const avgQuality = 0.7 // placeholder — would query runQuality
      const roi = (completedTickets * avgQuality) / Math.max(totalTokenCost / 10000, 1)

      results.push({
        agentId: agent.id,
        agentName: agent.name,
        completedTickets,
        totalTokenCost,
        avgQuality,
        roi,
      })
    }

    return results.sort((a, b) => b.roi - a.roi)
  }

  /**
   * Generate efficiency report with top/bottom performers and recommendations.
   */
  async generateEfficiencyReport(): Promise<EfficiencyReport> {
    const roiData = await this.computeAgentROI()

    if (roiData.length === 0) {
      return {
        topPerformers: [],
        bottomPerformers: [],
        totalAgents: 0,
        avgROI: 0,
        recommendations: ['No agent activity data available yet'],
      }
    }

    const avgROI = roiData.reduce((s, r) => s + r.roi, 0) / roiData.length
    const topPerformers = roiData.slice(0, 3)
    const bottomPerformers = roiData.slice(-3).reverse()

    const recommendations: string[] = []

    // Generate recommendations
    for (const bottom of bottomPerformers) {
      if (bottom.roi < avgROI * 0.5) {
        recommendations.push(
          `Agent "${bottom.agentName}" has ROI ${bottom.roi.toFixed(2)} (${Math.round((bottom.roi / avgROI) * 100)}% of avg) — consider model downgrade or soul evolution`,
        )
      }
    }

    if (topPerformers[0] && topPerformers[0].roi > avgROI * 2) {
      recommendations.push(
        `Agent "${topPerformers[0].agentName}" is a star performer (${topPerformers[0].roi.toFixed(2)} ROI) — consider expanding their workload`,
      )
    }

    if (recommendations.length === 0) {
      recommendations.push('All agents performing within normal ROI range')
    }

    logger.info(
      { totalAgents: roiData.length, avgROI: avgROI.toFixed(2) },
      'financial-governor: efficiency report generated',
    )

    return { topPerformers, bottomPerformers, totalAgents: roiData.length, avgROI, recommendations }
  }
}
