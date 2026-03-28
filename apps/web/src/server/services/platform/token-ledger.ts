/**
 * Token Ledger & Budget Manager
 *
 * Financial accounting for LLM usage:
 * - Record token usage per entity/agent/model
 * - Budget enforcement (daily + monthly limits)
 * - Alert threshold checking
 * - Usage aggregation and reporting
 */

import type { Database } from '@solarc/db'
import { brainEngineUsage, tokenBudgets, tokenLedger } from '@solarc/db'
import { and, eq, gte, lte, sql } from 'drizzle-orm'

export interface RecordUsageInput {
  entityId?: string
  agentId?: string
  model?: string
  provider?: string
  tokensIn: number
  tokensOut: number
  costUsd: number
}

export interface BudgetStatus {
  entityId: string
  dailySpent: number
  dailyLimit: number | null
  monthlySpent: number
  monthlyLimit: number | null
  dailyPercent: number
  monthlyPercent: number
  overBudget: boolean
  alertTriggered: boolean
}

export class TokenLedgerService {
  constructor(private db: Database) {}

  /**
   * Record token usage.
   */
  async record(input: RecordUsageInput): Promise<void> {
    const now = new Date()
    // Period = start of current hour (for aggregation)
    const period = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())

    await this.db.insert(tokenLedger).values({
      entityId: input.entityId,
      agentId: input.agentId,
      model: input.model,
      provider: input.provider,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      costUsd: input.costUsd,
      period,
    })

    // Also record to engine usage if entity provided
    if (input.entityId && input.provider) {
      await this.db.insert(brainEngineUsage).values({
        entityId: input.entityId,
        engine: input.provider,
        requestsCount: 1,
        tokensUsed: input.tokensIn + input.tokensOut,
        costUsd: input.costUsd,
        period,
      })
    }
  }

  /**
   * Check if an entity is within budget.
   * Returns budget status and whether the request should be blocked.
   */
  async checkBudget(entityId: string): Promise<BudgetStatus> {
    const budget = await this.db.query.tokenBudgets.findFirst({
      where: eq(tokenBudgets.entityId, entityId),
    })

    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [dailyResult, monthlyResult] = await Promise.all([
      this.db
        .select({ total: sql<number>`coalesce(sum(${tokenLedger.costUsd}), 0)` })
        .from(tokenLedger)
        .where(and(eq(tokenLedger.entityId, entityId), gte(tokenLedger.period, startOfDay))),
      this.db
        .select({ total: sql<number>`coalesce(sum(${tokenLedger.costUsd}), 0)` })
        .from(tokenLedger)
        .where(and(eq(tokenLedger.entityId, entityId), gte(tokenLedger.period, startOfMonth))),
    ])

    const dailySpent = dailyResult[0]?.total ?? 0
    const monthlySpent = monthlyResult[0]?.total ?? 0

    const dailyLimit = budget?.dailyLimitUsd ?? null
    const monthlyLimit = budget?.monthlyLimitUsd ?? null
    const alertThreshold = budget?.alertThreshold ?? 0.8

    const dailyPercent = dailyLimit ? dailySpent / dailyLimit : 0
    const monthlyPercent = monthlyLimit ? monthlySpent / monthlyLimit : 0

    const overBudget = budget?.enforce
      ? (dailyLimit !== null && dailySpent >= dailyLimit) ||
        (monthlyLimit !== null && monthlySpent >= monthlyLimit)
      : false

    const alertTriggered = dailyPercent >= alertThreshold || monthlyPercent >= alertThreshold

    return {
      entityId,
      dailySpent,
      dailyLimit,
      monthlySpent,
      monthlyLimit,
      dailyPercent,
      monthlyPercent,
      overBudget,
      alertTriggered,
    }
  }

  /**
   * Set budget limits for an entity.
   */
  async setBudget(
    entityId: string,
    limits: {
      dailyLimitUsd?: number
      monthlyLimitUsd?: number
      alertThreshold?: number
      enforce?: boolean
    },
  ): Promise<void> {
    const existing = await this.db.query.tokenBudgets.findFirst({
      where: eq(tokenBudgets.entityId, entityId),
    })

    if (existing) {
      await this.db
        .update(tokenBudgets)
        .set({
          ...limits,
          updatedAt: new Date(),
        })
        .where(eq(tokenBudgets.entityId, entityId))
    } else {
      await this.db.insert(tokenBudgets).values({
        entityId,
        dailyLimitUsd: limits.dailyLimitUsd,
        monthlyLimitUsd: limits.monthlyLimitUsd,
        alertThreshold: limits.alertThreshold ?? 0.8,
        enforce: limits.enforce ?? true,
      })
    }
  }

  /**
   * Get usage summary for an entity over a time range.
   */
  async usageSummary(entityId: string, since?: Date, until?: Date) {
    const conditions = [eq(tokenLedger.entityId, entityId)]
    if (since) conditions.push(gte(tokenLedger.period, since))
    if (until) conditions.push(lte(tokenLedger.period, until))

    const byModel = await this.db
      .select({
        model: tokenLedger.model,
        provider: tokenLedger.provider,
        totalTokensIn: sql<number>`sum(${tokenLedger.tokensIn})`,
        totalTokensOut: sql<number>`sum(${tokenLedger.tokensOut})`,
        totalCost: sql<number>`sum(${tokenLedger.costUsd})`,
        requests: sql<number>`count(*)`,
      })
      .from(tokenLedger)
      .where(and(...conditions))
      .groupBy(tokenLedger.model, tokenLedger.provider)

    const totals = await this.db
      .select({
        totalTokensIn: sql<number>`coalesce(sum(${tokenLedger.tokensIn}), 0)`,
        totalTokensOut: sql<number>`coalesce(sum(${tokenLedger.tokensOut}), 0)`,
        totalCost: sql<number>`coalesce(sum(${tokenLedger.costUsd}), 0)`,
        requests: sql<number>`count(*)`,
      })
      .from(tokenLedger)
      .where(and(...conditions))

    return {
      byModel,
      totals: totals[0] ?? { totalTokensIn: 0, totalTokensOut: 0, totalCost: 0, requests: 0 },
    }
  }

  /**
   * Get usage for an agent.
   */
  async agentUsage(agentId: string, since?: Date) {
    const conditions = [eq(tokenLedger.agentId, agentId)]
    if (since) conditions.push(gte(tokenLedger.period, since))

    return this.db
      .select({
        model: tokenLedger.model,
        totalTokensIn: sql<number>`sum(${tokenLedger.tokensIn})`,
        totalTokensOut: sql<number>`sum(${tokenLedger.tokensOut})`,
        totalCost: sql<number>`sum(${tokenLedger.costUsd})`,
        requests: sql<number>`count(*)`,
      })
      .from(tokenLedger)
      .where(and(...conditions))
      .groupBy(tokenLedger.model)
  }

  /**
   * Get daily cost trend for an entity.
   */
  async dailyCostTrend(entityId: string, days = 30) {
    const since = new Date(Date.now() - days * 86_400_000)

    return this.db
      .select({
        day: sql<string>`date_trunc('day', ${tokenLedger.period})`,
        cost: sql<number>`sum(${tokenLedger.costUsd})`,
        tokens: sql<number>`sum(${tokenLedger.tokensIn} + ${tokenLedger.tokensOut})`,
      })
      .from(tokenLedger)
      .where(and(eq(tokenLedger.entityId, entityId), gte(tokenLedger.period, since)))
      .groupBy(sql`date_trunc('day', ${tokenLedger.period})`)
      .orderBy(sql`date_trunc('day', ${tokenLedger.period})`)
  }
}
