/**
 * Financial Reports — ROI per department, cost trends, budget utilization.
 *
 * The CFO function for the AI Corporation.
 * Aggregates token ledger data into executive-level financial reports.
 */

import type { Database } from '@solarc/db'
import { brainEntities, tokenBudgets, tokenLedger } from '@solarc/db'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export interface DepartmentFinancials {
  entityId: string
  name: string
  domain: string | null
  dailySpent: number
  monthlySpent: number
  dailyLimit: number | null
  monthlyLimit: number | null
  utilization: number // 0-1
  status: 'under_budget' | 'warning' | 'over_budget'
}

export interface CorporateFinancialReport {
  period: string
  totalSpent: number
  totalBudget: number
  utilization: number
  departments: DepartmentFinancials[]
  topSpenders: Array<{ name: string; spent: number }>
  costByModel: Array<{ model: string; spent: number; requests: number }>
  dailyTrend: Array<{ date: string; spent: number }>
}

// ── Report Generation ───────────────────────────────────────────────

/**
 * Generate a full corporate financial report.
 */
export async function generateFinancialReport(
  db: Database,
  days: number = 30,
): Promise<CorporateFinancialReport> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  // 1. Get all departments
  const depts = await db
    .select({
      id: brainEntities.id,
      name: brainEntities.name,
      domain: brainEntities.domain,
    })
    .from(brainEntities)
    .where(eq(brainEntities.tier, 'mini_brain'))

  // 2. Get budgets
  const budgets = await db.select().from(tokenBudgets)
  const budgetMap = new Map(budgets.map((b) => [b.entityId, b]))

  // 3. Get monthly spending per department
  const departments: DepartmentFinancials[] = []
  let totalSpent = 0
  let totalBudget = 0

  for (const dept of depts) {
    const [monthlyRow] = await db
      .select({ total: sql<number>`coalesce(sum(${tokenLedger.costUsd}), 0)::float` })
      .from(tokenLedger)
      .where(and(eq(tokenLedger.entityId, dept.id), gte(tokenLedger.period, startOfMonth)))

    const [dailyRow] = await db
      .select({ total: sql<number>`coalesce(sum(${tokenLedger.costUsd}), 0)::float` })
      .from(tokenLedger)
      .where(
        and(
          eq(tokenLedger.entityId, dept.id),
          gte(tokenLedger.period, new Date(Date.now() - 24 * 60 * 60 * 1000)),
        ),
      )

    const budget = budgetMap.get(dept.id)
    const monthlySpent = monthlyRow?.total ?? 0
    const dailySpent = dailyRow?.total ?? 0
    const monthlyLimit = budget?.monthlyLimitUsd ?? null
    const utilization = monthlyLimit ? monthlySpent / monthlyLimit : 0

    totalSpent += monthlySpent
    if (monthlyLimit) totalBudget += monthlyLimit

    departments.push({
      entityId: dept.id,
      name: dept.name,
      domain: dept.domain,
      dailySpent,
      monthlySpent,
      dailyLimit: budget?.dailyLimitUsd ?? null,
      monthlyLimit,
      utilization,
      status: utilization >= 1 ? 'over_budget' : utilization >= 0.8 ? 'warning' : 'under_budget',
    })
  }

  // 4. Cost by model
  const costByModel = await db
    .select({
      model: tokenLedger.model,
      spent: sql<number>`coalesce(sum(${tokenLedger.costUsd}), 0)::float`,
      requests: sql<number>`count(*)::int`,
    })
    .from(tokenLedger)
    .where(gte(tokenLedger.period, since))
    .groupBy(tokenLedger.model)
    .orderBy(desc(sql`sum(${tokenLedger.costUsd})`))
    .limit(10)

  // 5. Daily trend
  const dailyTrend = await db
    .select({
      date: sql<string>`to_char(${tokenLedger.period}::date, 'YYYY-MM-DD')`,
      spent: sql<number>`coalesce(sum(${tokenLedger.costUsd}), 0)::float`,
    })
    .from(tokenLedger)
    .where(gte(tokenLedger.period, since))
    .groupBy(sql`${tokenLedger.period}::date`)
    .orderBy(sql`${tokenLedger.period}::date`)

  // 6. Top spenders
  const topSpenders = [...departments]
    .sort((a, b) => b.monthlySpent - a.monthlySpent)
    .slice(0, 5)
    .map((d) => ({ name: d.name, spent: d.monthlySpent }))

  return {
    period: `${days} days`,
    totalSpent,
    totalBudget,
    utilization: totalBudget > 0 ? totalSpent / totalBudget : 0,
    departments,
    topSpenders,
    costByModel: costByModel.map((r) => ({
      model: r.model ?? 'unknown',
      spent: r.spent,
      requests: r.requests,
    })),
    dailyTrend: dailyTrend.map((r) => ({ date: r.date, spent: r.spent })),
  }
}
