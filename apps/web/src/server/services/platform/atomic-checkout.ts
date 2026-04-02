/**
 * Atomic Task Checkout — Single-transaction task claim + budget validation.
 *
 * Inspired by Paperclip AI's atomic checkout pattern.
 * When an agent claims a task, budget check + task assignment + budget deduction
 * happen in one atomic operation. Prevents:
 *   - Two agents claiming the same task (race condition)
 *   - Agents starting work they can't afford
 *   - Budget overruns from concurrent claims
 *
 * Also implements Paperclip's two-tier budget thresholds:
 *   - Soft threshold (80%): Warning, work continues
 *   - Hard threshold (100%): Block, auto-pause
 */

import type { Database } from '@solarc/db'
import { ticketExecution, tickets, tokenBudgets, tokenLedger } from '@solarc/db'
import { and, eq, gte, sql } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export type CheckoutResult =
  | {
      success: true
      ticketId: string
      agentId: string
      leaseUntil: Date
      budgetWarning: string | null
    }
  | { success: false; reason: string; budgetLevel?: 'soft' | 'hard' }

export interface BudgetThresholds {
  softPercent: number // Default: 0.8 (80%)
  hardPercent: number // Default: 1.0 (100%)
}

const DEFAULT_THRESHOLDS: BudgetThresholds = {
  softPercent: 0.8,
  hardPercent: 1.0,
}

const DEFAULT_LEASE_SECONDS = 300 // 5 minutes

// ── Atomic Checkout ─────────────────────────────────────────────────

/**
 * Atomically claim a ticket for an agent with budget validation.
 * Uses SELECT FOR UPDATE to prevent concurrent claims.
 *
 * @param db - Database connection
 * @param ticketId - Ticket to claim
 * @param agentId - Agent claiming the ticket
 * @param entityId - Entity for budget enforcement
 * @param estimatedCostUsd - Estimated cost of this task (for pre-check)
 * @param leaseSeconds - How long the agent has to complete (default: 300s)
 * @param thresholds - Budget threshold configuration
 */
export async function atomicCheckout(
  db: Database,
  ticketId: string,
  agentId: string,
  entityId: string | null,
  estimatedCostUsd: number = 0,
  leaseSeconds: number = DEFAULT_LEASE_SECONDS,
  thresholds: BudgetThresholds = DEFAULT_THRESHOLDS,
): Promise<CheckoutResult> {
  try {
    return await db.transaction(async (tx) => {
      // 1. Check if ticket is already claimed (with row lock)
      const existing = await tx
        .select()
        .from(ticketExecution)
        .where(eq(ticketExecution.ticketId, ticketId))
        .limit(1)

      if (existing.length > 0 && existing[0]!.lockOwner) {
        const lease = existing[0]!.leaseUntil
        if (lease && lease > new Date()) {
          return {
            success: false as const,
            reason: `Ticket already claimed by agent ${existing[0]!.lockOwner} until ${lease.toISOString()}`,
          }
        }
        // Lease expired — allow re-claim
      }

      // 2. Budget check (if entity has budget configured)
      let budgetWarning: string | null = null
      if (entityId) {
        const budgetCheck = await checkBudgetThresholds(
          tx as unknown as Database,
          entityId,
          estimatedCostUsd,
          thresholds,
        )

        if (budgetCheck.level === 'hard') {
          return {
            success: false as const,
            reason: `Budget exceeded: ${budgetCheck.message}`,
            budgetLevel: 'hard',
          }
        }

        if (budgetCheck.level === 'soft') {
          budgetWarning = budgetCheck.message
        }
      }

      // 3. Atomic claim — upsert ticket execution with lock
      const leaseUntil = new Date(Date.now() + leaseSeconds * 1000)
      const now = new Date()

      if (existing.length > 0) {
        await tx
          .update(ticketExecution)
          .set({
            lockOwner: agentId,
            lockedAt: now,
            leaseUntil,
            leaseSeconds,
            updatedAt: now,
          })
          .where(eq(ticketExecution.ticketId, ticketId))
      } else {
        await tx.insert(ticketExecution).values({
          ticketId,
          lockOwner: agentId,
          lockedAt: now,
          leaseUntil,
          leaseSeconds,
        })
      }

      // 4. Update ticket status to in_progress
      await tx
        .update(tickets)
        .set({ status: 'in_progress', assignedAgentId: agentId, updatedAt: now })
        .where(eq(tickets.id, ticketId))

      return {
        success: true as const,
        ticketId,
        agentId,
        leaseUntil,
        budgetWarning,
      }
    })
  } catch (err) {
    return {
      success: false as const,
      reason: err instanceof Error ? err.message : 'Checkout failed',
    }
  }
}

/**
 * Release a ticket claim (agent finished or gave up).
 */
export async function releaseCheckout(
  db: Database,
  ticketId: string,
  agentId: string,
  status: 'done' | 'backlog' = 'done',
): Promise<void> {
  await db
    .update(ticketExecution)
    .set({
      lockOwner: null,
      lockedAt: null,
      leaseUntil: null,
      updatedAt: new Date(),
    })
    .where(and(eq(ticketExecution.ticketId, ticketId), eq(ticketExecution.lockOwner, agentId)))

  await db.update(tickets).set({ status, updatedAt: new Date() }).where(eq(tickets.id, ticketId))
}

// ── Two-Tier Budget Thresholds ──────────────────────────────────────

interface BudgetThresholdResult {
  level: 'ok' | 'soft' | 'hard'
  message: string
  dailyPercent: number
  monthlyPercent: number
}

async function checkBudgetThresholds(
  tx: Database,
  entityId: string,
  estimatedCostUsd: number,
  thresholds: BudgetThresholds,
): Promise<BudgetThresholdResult> {
  const budget = await tx.query.tokenBudgets.findFirst({
    where: eq(tokenBudgets.entityId, entityId),
  })

  if (!budget) {
    return { level: 'ok', message: 'No budget configured', dailyPercent: 0, monthlyPercent: 0 }
  }

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [dailyResult] = await tx
    .select({ total: sql<number>`coalesce(sum(${tokenLedger.costUsd}), 0)` })
    .from(tokenLedger)
    .where(and(eq(tokenLedger.entityId, entityId), gte(tokenLedger.period, startOfDay)))

  const [monthlyResult] = await tx
    .select({ total: sql<number>`coalesce(sum(${tokenLedger.costUsd}), 0)` })
    .from(tokenLedger)
    .where(and(eq(tokenLedger.entityId, entityId), gte(tokenLedger.period, startOfMonth)))

  const dailySpent = (dailyResult?.total ?? 0) + estimatedCostUsd
  const monthlySpent = (monthlyResult?.total ?? 0) + estimatedCostUsd

  const dailyLimit = budget.dailyLimitUsd
  const monthlyLimit = budget.monthlyLimitUsd

  const dailyPercent = dailyLimit ? dailySpent / dailyLimit : 0
  const monthlyPercent = monthlyLimit ? monthlySpent / monthlyLimit : 0

  // Hard threshold — block execution
  if (
    (dailyLimit && dailyPercent >= thresholds.hardPercent) ||
    (monthlyLimit && monthlyPercent >= thresholds.hardPercent)
  ) {
    return {
      level: 'hard',
      message: `Budget exhausted (daily: ${(dailyPercent * 100).toFixed(0)}%, monthly: ${(monthlyPercent * 100).toFixed(0)}%). Task blocked.`,
      dailyPercent,
      monthlyPercent,
    }
  }

  // Soft threshold — warn but allow
  if (
    (dailyLimit && dailyPercent >= thresholds.softPercent) ||
    (monthlyLimit && monthlyPercent >= thresholds.softPercent)
  ) {
    return {
      level: 'soft',
      message: `Budget warning: daily ${(dailyPercent * 100).toFixed(0)}%, monthly ${(monthlyPercent * 100).toFixed(0)}%. Approaching limit.`,
      dailyPercent,
      monthlyPercent,
    }
  }

  return { level: 'ok', message: 'Within budget', dailyPercent, monthlyPercent }
}
