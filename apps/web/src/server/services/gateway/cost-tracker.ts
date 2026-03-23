/**
 * LLM cost tracking: calculates cost from token counts + pricing,
 * enforces budgets, and records metrics.
 */

import { eq, and, gte, sql } from 'drizzle-orm'
import { gatewayMetrics } from '@solarc/db'
import type { Database } from '@solarc/db'

/** Per-million-token pricing (USD). Updated as providers change rates. */
const PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-opus-4-6':   { input: 15.0,  output: 75.0  },
  'claude-sonnet-4-6': { input: 3.0,   output: 15.0  },
  'claude-haiku-4-5':  { input: 0.80,  output: 4.0   },
  // OpenAI
  'gpt-4o':            { input: 2.50,  output: 10.0  },
  'gpt-4o-mini':       { input: 0.15,  output: 0.60  },
  'gpt-4.1':           { input: 2.0,   output: 8.0   },
  'gpt-4.1-mini':      { input: 0.40,  output: 1.60  },
  'gpt-4.1-nano':      { input: 0.10,  output: 0.40  },
  'o3':                { input: 10.0,  output: 40.0  },
  'o3-mini':           { input: 1.10,  output: 4.40  },
  'o4-mini':           { input: 1.10,  output: 4.40  },
  // Google
  'gemini-2.5-pro':    { input: 1.25,  output: 10.0  },
  'gemini-2.5-flash':  { input: 0.15,  output: 0.60  },
  'gemini-2.0-flash':  { input: 0.10,  output: 0.40  },
  // Local (free)
  'ollama':            { input: 0,     output: 0     },
}

export interface BudgetConfig {
  /** Soft limit (USD) — triggers warning */
  softLimitUsd: number
  /** Hard limit (USD) — blocks requests */
  hardLimitUsd: number
  /** Period for budget window */
  period: 'daily' | 'weekly' | 'monthly'
}

export interface CostResult {
  costUsd: number
  model: string
  tokensIn: number
  tokensOut: number
}

export interface UsageSummary {
  totalCostUsd: number
  totalTokensIn: number
  totalTokensOut: number
  requestCount: number
}

const DEFAULT_BUDGET: BudgetConfig = {
  softLimitUsd: 50,
  hardLimitUsd: 100,
  period: 'daily',
}

export class CostTracker {
  private budgets = new Map<string, BudgetConfig>()

  constructor(private db: Database) {}

  /** Calculate cost for a single LLM call */
  calculateCost(model: string, tokensIn: number, tokensOut: number): number {
    // Try exact match first, then prefix match for ollama models
    let pricing = PRICING[model]
    if (!pricing) {
      // Ollama local models are free
      if (model.includes(':') || model.startsWith('ollama/')) {
        pricing = PRICING['ollama']
      } else {
        // Unknown model: use sonnet pricing as safe default
        pricing = PRICING['claude-sonnet-4-6']
      }
    }
    return (tokensIn * pricing.input + tokensOut * pricing.output) / 1_000_000
  }

  /** Record a completed LLM call to gateway_metrics */
  async record(params: {
    provider: string
    model: string
    agentId?: string
    ticketId?: string
    tokensIn: number
    tokensOut: number
    latencyMs: number
    cached: boolean
    error?: string
  }): Promise<CostResult> {
    const costUsd = params.cached ? 0 : this.calculateCost(params.model, params.tokensIn, params.tokensOut)

    await this.db.insert(gatewayMetrics).values({
      provider: params.provider,
      model: params.model,
      agentId: params.agentId,
      ticketId: params.ticketId,
      tokensIn: params.tokensIn,
      tokensOut: params.tokensOut,
      latencyMs: params.latencyMs,
      costUsd,
      cached: params.cached,
      error: params.error,
    })

    return { costUsd, model: params.model, tokensIn: params.tokensIn, tokensOut: params.tokensOut }
  }

  /** Set budget for an agent or workspace */
  setBudget(entityId: string, config: Partial<BudgetConfig>): void {
    this.budgets.set(entityId, { ...DEFAULT_BUDGET, ...config })
  }

  /** Get usage for an entity within current budget period */
  async getUsage(entityId: string, entityType: 'agent' | 'workspace'): Promise<UsageSummary> {
    const budget = this.budgets.get(entityId) ?? DEFAULT_BUDGET
    const periodStart = this.getPeriodStart(budget.period)

    const field = entityType === 'agent' ? gatewayMetrics.agentId : gatewayMetrics.agentId

    const [result] = await this.db
      .select({
        totalCostUsd: sql<number>`coalesce(sum(${gatewayMetrics.costUsd}), 0)`,
        totalTokensIn: sql<number>`coalesce(sum(${gatewayMetrics.tokensIn}), 0)`,
        totalTokensOut: sql<number>`coalesce(sum(${gatewayMetrics.tokensOut}), 0)`,
        requestCount: sql<number>`count(*)`,
      })
      .from(gatewayMetrics)
      .where(and(eq(field, entityId), gte(gatewayMetrics.createdAt, periodStart)))

    return {
      totalCostUsd: Number(result.totalCostUsd),
      totalTokensIn: Number(result.totalTokensIn),
      totalTokensOut: Number(result.totalTokensOut),
      requestCount: Number(result.requestCount),
    }
  }

  /** Check if entity is within budget. Returns { allowed, warning, remaining } */
  async checkBudget(entityId: string, entityType: 'agent' | 'workspace' = 'agent'): Promise<{
    allowed: boolean
    warning: boolean
    remainingUsd: number
  }> {
    const budget = this.budgets.get(entityId) ?? DEFAULT_BUDGET
    const usage = await this.getUsage(entityId, entityType)

    return {
      allowed: usage.totalCostUsd < budget.hardLimitUsd,
      warning: usage.totalCostUsd >= budget.softLimitUsd,
      remainingUsd: Math.max(0, budget.hardLimitUsd - usage.totalCostUsd),
    }
  }

  private getPeriodStart(period: 'daily' | 'weekly' | 'monthly'): Date {
    const now = new Date()
    switch (period) {
      case 'daily':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate())
      case 'weekly': {
        const day = now.getDay()
        const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday start
        return new Date(now.getFullYear(), now.getMonth(), diff)
      }
      case 'monthly':
        return new Date(now.getFullYear(), now.getMonth(), 1)
    }
  }

  /** Get pricing table (for UI display) */
  static getPricing(): Record<string, { input: number; output: number }> {
    return { ...PRICING }
  }
}
