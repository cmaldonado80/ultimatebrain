/**
 * Receipt / Transaction Manager
 *
 * Tracks execution as a sequence of actions with:
 * - Receipt creation tied to agent/ticket/project
 * - Ordered action recording with pre-state snapshots
 * - Rollback capability for eligible actions (reverse order)
 * - Anomaly detection and recording
 */

import type { Database } from '@solarc/db'
import { receipts, receiptActions, receiptAnomalies } from '@solarc/db'
import { eq, and, desc, asc, sql } from 'drizzle-orm'

export type ReceiptStatus = 'running' | 'completed' | 'failed' | 'rolled_back'

export interface StartReceiptInput {
  agentId?: string
  ticketId?: string
  projectId?: string
  workspaceId?: string
  trigger?: string
}

export interface RecordActionInput {
  receiptId: string
  type: string
  target?: string
  summary?: string
  preState?: unknown
  result?: unknown
  isRollbackEligible?: boolean
  durationMs?: number
}

export class ReceiptManager {
  constructor(private db: Database) {}

  /**
   * Start a new execution receipt.
   */
  async start(input: StartReceiptInput) {
    const [receipt] = await this.db.insert(receipts).values({
      agentId: input.agentId,
      ticketId: input.ticketId,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      trigger: input.trigger,
      status: 'running',
      rollbackAvailable: false,
    }).returning()
    return receipt!
  }

  /**
   * Record an action within a receipt.
   * Actions are ordered by sequence number (auto-incremented).
   */
  async recordAction(input: RecordActionInput) {
    // Atomically compute next sequence number via subquery to prevent race conditions
    const [seqResult] = await this.db
      .select({ nextSeq: sql<number>`coalesce(max(${receiptActions.sequence}), 0) + 1` })
      .from(receiptActions)
      .where(eq(receiptActions.receiptId, input.receiptId))

    const nextSeq = seqResult?.nextSeq ?? 1

    const [action] = await this.db.insert(receiptActions).values({
      receiptId: input.receiptId,
      sequence: nextSeq,
      type: input.type,
      target: input.target,
      summary: input.summary,
      status: 'completed',
      preState: input.preState,
      result: input.result,
      isRollbackEligible: input.isRollbackEligible ?? false,
      durationMs: input.durationMs,
    }).returning()

    // Update rollbackAvailable on receipt if this action is rollback-eligible
    if (input.isRollbackEligible) {
      await this.db.update(receipts).set({ rollbackAvailable: true })
        .where(eq(receipts.id, input.receiptId))
    }

    return action!
  }

  /**
   * Complete a receipt successfully.
   */
  async complete(receiptId: string): Promise<void> {
    const startedAt = await this.db.query.receipts.findFirst({
      where: eq(receipts.id, receiptId),
    })

    const durationMs = startedAt
      ? Date.now() - startedAt.startedAt.getTime()
      : undefined

    await this.db.update(receipts).set({
      status: 'completed',
      completedAt: new Date(),
      durationMs,
    }).where(eq(receipts.id, receiptId))
  }

  /**
   * Mark a receipt as failed.
   */
  async fail(receiptId: string, reason?: string): Promise<void> {
    const startedAt = await this.db.query.receipts.findFirst({
      where: eq(receipts.id, receiptId),
    })

    await this.db.update(receipts).set({
      status: 'failed',
      completedAt: new Date(),
      durationMs: startedAt ? Date.now() - startedAt.startedAt.getTime() : undefined,
    }).where(eq(receipts.id, receiptId))

    if (reason) {
      await this.recordAnomaly(receiptId, reason, 'high')
    }
  }

  /**
   * Rollback a receipt: replay rollback-eligible actions in reverse order.
   * Returns the actions that were rolled back.
   */
  async rollback(receiptId: string): Promise<Array<typeof receiptActions.$inferSelect>> {
    const receipt = await this.db.query.receipts.findFirst({
      where: eq(receipts.id, receiptId),
    })
    if (!receipt) throw new Error(`Receipt ${receiptId} not found`)
    if (!receipt.rollbackAvailable) throw new Error('No rollback-eligible actions')

    // Get rollback-eligible actions in reverse order
    const actions = await this.db
      .select()
      .from(receiptActions)
      .where(and(
        eq(receiptActions.receiptId, receiptId),
        eq(receiptActions.isRollbackEligible, true),
      ))
      .orderBy(desc(receiptActions.sequence))

    // Batch mark all eligible actions as rolled back
    await this.db.update(receiptActions).set({
      status: 'rolled_back',
    }).where(and(
      eq(receiptActions.receiptId, receiptId),
      eq(receiptActions.isRollbackEligible, true),
    ))

    // Update receipt status
    await this.db.update(receipts).set({
      status: 'rolled_back',
      completedAt: new Date(),
      rollbackAvailable: false,
    }).where(eq(receipts.id, receiptId))

    return actions
  }

  /**
   * Record an anomaly on a receipt.
   */
  async recordAnomaly(
    receiptId: string,
    description: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
  ) {
    const [anomaly] = await this.db.insert(receiptAnomalies).values({
      receiptId,
      description,
      severity,
    }).returning()
    return anomaly!
  }

  /**
   * Get a full receipt with all actions and anomalies.
   */
  async getFull(receiptId: string) {
    const receipt = await this.db.query.receipts.findFirst({
      where: eq(receipts.id, receiptId),
    })
    if (!receipt) return null

    const [actions, anomalies] = await Promise.all([
      this.db.select().from(receiptActions)
        .where(eq(receiptActions.receiptId, receiptId))
        .orderBy(asc(receiptActions.sequence)),
      this.db.select().from(receiptAnomalies)
        .where(eq(receiptAnomalies.receiptId, receiptId))
        .orderBy(asc(receiptAnomalies.createdAt)),
    ])

    return { receipt, actions, anomalies }
  }

  /**
   * List receipts for a given agent or ticket.
   */
  async list(filters?: { agentId?: string; ticketId?: string; status?: ReceiptStatus; limit?: number }) {
    const conditions = []
    if (filters?.agentId) conditions.push(eq(receipts.agentId, filters.agentId))
    if (filters?.ticketId) conditions.push(eq(receipts.ticketId, filters.ticketId))
    if (filters?.status) conditions.push(eq(receipts.status, filters.status))

    return this.db
      .select()
      .from(receipts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(receipts.startedAt))
      .limit(filters?.limit ?? 50)
  }
}
