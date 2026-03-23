/**
 * Checkpoint Manager
 *
 * Auto-checkpoints entity state at key lifecycle events:
 * - Ticket status changes
 * - LLM call completions
 * - Tool invocations
 * - Approval decisions
 * - DAG step transitions
 *
 * Granularity is configurable per workspace: 'all' | 'milestones' | 'none'
 * Retention default: 30 days (pruned by cron)
 */

import type { Database } from '@solarc/db'
import { checkpoints } from '@solarc/db'
import { eq, and, lt } from 'drizzle-orm'

export type CheckpointTrigger =
  | 'status_change'
  | 'llm_call'
  | 'tool_invocation'
  | 'approval_decision'
  | 'dag_step'
  | 'receipt_action'
  | 'manual'

export type CheckpointGranularity = 'all' | 'milestones' | 'none'

export interface CheckpointMetadata {
  trigger: CheckpointTrigger
  agentId?: string
  traceId?: string
  label?: string
  [key: string]: unknown
}

export interface CreateCheckpointInput {
  entityType: string
  entityId: string
  stepIndex: number
  state: Record<string, unknown>
  metadata: CheckpointMetadata
  granularity?: CheckpointGranularity
}

export interface CheckpointRecord {
  id: string
  entityType: string
  entityId: string
  stepIndex: number
  state: Record<string, unknown>
  metadata: CheckpointMetadata
  createdAt: Date
}

/** Triggers that count as milestones (used when granularity = 'milestones') */
const MILESTONE_TRIGGERS: CheckpointTrigger[] = [
  'status_change',
  'approval_decision',
  'receipt_action',
  'manual',
]

export class CheckpointManager {
  constructor(private db: Database) {}

  /**
   * Save a checkpoint. Respects workspace granularity setting.
   */
  async save(input: CreateCheckpointInput): Promise<string | null> {
    const granularity = input.granularity ?? 'all'

    if (granularity === 'none') return null
    if (granularity === 'milestones' && !MILESTONE_TRIGGERS.includes(input.metadata.trigger)) {
      return null
    }

    const [checkpoint] = await this.db
      .insert(checkpoints)
      .values({
        entityType: input.entityType,
        entityId: input.entityId,
        stepIndex: input.stepIndex,
        state: input.state,
        metadata: input.metadata as Record<string, unknown>,
      })
      .returning({ id: checkpoints.id })

    return checkpoint.id
  }

  /**
   * List all checkpoints for an entity, ordered by step index.
   */
  async list(entityType: string, entityId: string): Promise<CheckpointRecord[]> {
    const rows = await this.db.query.checkpoints.findMany({
      where: and(
        eq(checkpoints.entityType, entityType),
        eq(checkpoints.entityId, entityId)
      ),
      orderBy: (cp, { asc }) => [asc(cp.stepIndex), asc(cp.createdAt)],
    })

    return rows.map(this.toRecord)
  }

  /**
   * Get a single checkpoint by ID.
   */
  async get(checkpointId: string): Promise<CheckpointRecord | null> {
    const row = await this.db.query.checkpoints.findFirst({
      where: eq(checkpoints.id, checkpointId),
    })
    return row ? this.toRecord(row) : null
  }

  /**
   * Get latest checkpoint for an entity.
   */
  async getLatest(entityType: string, entityId: string): Promise<CheckpointRecord | null> {
    const row = await this.db.query.checkpoints.findFirst({
      where: and(
        eq(checkpoints.entityType, entityType),
        eq(checkpoints.entityId, entityId)
      ),
      orderBy: (cp, { desc }) => [desc(cp.stepIndex), desc(cp.createdAt)],
    })
    return row ? this.toRecord(row) : null
  }

  /**
   * Prune checkpoints older than retentionDays. Intended for cron job.
   */
  async prune(retentionDays = 30): Promise<number> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - retentionDays)

    const deleted = await this.db
      .delete(checkpoints)
      .where(lt(checkpoints.createdAt, cutoff))
      .returning({ id: checkpoints.id })

    return deleted.length
  }

  /**
   * Count checkpoints for an entity.
   */
  async count(entityType: string, entityId: string): Promise<number> {
    const rows = await this.db.query.checkpoints.findMany({
      where: and(
        eq(checkpoints.entityType, entityType),
        eq(checkpoints.entityId, entityId)
      ),
      columns: { id: true },
    })
    return rows.length
  }

  private toRecord(row: typeof checkpoints.$inferSelect): CheckpointRecord {
    return {
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      stepIndex: row.stepIndex,
      state: row.state as Record<string, unknown>,
      metadata: row.metadata as CheckpointMetadata,
      createdAt: row.createdAt,
    }
  }
}
