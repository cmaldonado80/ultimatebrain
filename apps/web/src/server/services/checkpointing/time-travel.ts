/**
 * Time Travel Engine
 *
 * Provides diff, replay, and branch capabilities over checkpoint history.
 * Replay always creates a NEW execution branch — history is never overwritten.
 */

import type { Database } from '@solarc/db'
import { CheckpointManager, type CheckpointRecord } from './checkpoint-manager'

export interface FieldDiff {
  field: string
  before: unknown
  after: unknown
  type: 'added' | 'removed' | 'changed'
}

export interface CheckpointDiff {
  checkpointAId: string
  checkpointBId: string
  stepDelta: number
  timeDeltaMs: number
  changes: FieldDiff[]
  summary: string
}

export interface ReplayOptions {
  /** Override specific state fields before replaying */
  paramOverrides?: Record<string, unknown>
  /** Label for the new execution branch */
  branchLabel?: string
  /** Agent to assign replay to */
  agentId?: string
}

export interface ReplayResult {
  branchId: string
  originalCheckpointId: string
  restoredState: Record<string, unknown>
  appliedOverrides: Record<string, unknown>
  createdAt: Date
}

export interface CheckpointTimeline {
  entityType: string
  entityId: string
  checkpoints: CheckpointTimelineEntry[]
  totalCheckpoints: number
  firstAt: Date | null
  lastAt: Date | null
}

export interface CheckpointTimelineEntry {
  id: string
  stepIndex: number
  trigger: string
  label?: string
  agentId?: string
  traceId?: string
  dotColor: 'green' | 'blue' | 'orange' | 'red' | 'gray'
  createdAt: Date
}

export class TimeTravelEngine {
  private manager: CheckpointManager

  constructor(private db: Database) {
    this.manager = new CheckpointManager(db)
  }

  /**
   * List all checkpoints for an entity as a timeline.
   */
  async getTimeline(entityType: string, entityId: string): Promise<CheckpointTimeline> {
    const checkpoints = await this.manager.list(entityType, entityId)

    const entries: CheckpointTimelineEntry[] = checkpoints.map((cp) => ({
      id: cp.id,
      stepIndex: cp.stepIndex,
      trigger: cp.metadata.trigger,
      label: cp.metadata.label,
      agentId: cp.metadata.agentId,
      traceId: cp.metadata.traceId,
      dotColor: this.triggerToColor(cp.metadata.trigger),
      createdAt: cp.createdAt,
    }))

    return {
      entityType,
      entityId,
      checkpoints: entries,
      totalCheckpoints: entries.length,
      firstAt: entries.length > 0 ? entries[0].createdAt : null,
      lastAt: entries.length > 0 ? entries[entries.length - 1].createdAt : null,
    }
  }

  /**
   * Get a single checkpoint's full state.
   */
  async getCheckpoint(checkpointId: string): Promise<CheckpointRecord | null> {
    return this.manager.get(checkpointId)
  }

  /**
   * Compute a diff between two checkpoints.
   * checkpointA is the "before", checkpointB is the "after".
   */
  async diffCheckpoints(checkpointAId: string, checkpointBId: string): Promise<CheckpointDiff> {
    const [a, b] = await Promise.all([
      this.manager.get(checkpointAId),
      this.manager.get(checkpointBId),
    ])

    if (!a) throw new Error(`Checkpoint ${checkpointAId} not found`)
    if (!b) throw new Error(`Checkpoint ${checkpointBId} not found`)

    const changes = this.diffObjects(a.state, b.state)
    const timeDeltaMs = b.createdAt.getTime() - a.createdAt.getTime()
    const stepDelta = b.stepIndex - a.stepIndex

    const added = changes.filter((c) => c.type === 'added').length
    const removed = changes.filter((c) => c.type === 'removed').length
    const changed = changes.filter((c) => c.type === 'changed').length

    const summary = [
      added > 0 ? `+${added} field${added !== 1 ? 's' : ''}` : '',
      removed > 0 ? `-${removed} field${removed !== 1 ? 's' : ''}` : '',
      changed > 0 ? `~${changed} changed` : '',
    ]
      .filter(Boolean)
      .join(', ') || 'No changes'

    return {
      checkpointAId,
      checkpointBId,
      stepDelta,
      timeDeltaMs,
      changes,
      summary,
    }
  }

  /**
   * Diff an entity's latest two checkpoints (convenience).
   */
  async diffLatest(entityType: string, entityId: string): Promise<CheckpointDiff | null> {
    const checkpoints = await this.manager.list(entityType, entityId)
    if (checkpoints.length < 2) return null

    const a = checkpoints[checkpoints.length - 2]
    const b = checkpoints[checkpoints.length - 1]
    return this.diffCheckpoints(a.id, b.id)
  }

  /**
   * Replay from a checkpoint — restores state and optionally applies param overrides.
   * Creates a NEW execution branch (never overwrites history).
   */
  async replayFrom(checkpointId: string, options: ReplayOptions = {}): Promise<ReplayResult> {
    const checkpoint = await this.manager.get(checkpointId)
    if (!checkpoint) throw new Error(`Checkpoint ${checkpointId} not found`)

    const restoredState = { ...checkpoint.state }
    const appliedOverrides = options.paramOverrides ?? {}

    // Apply overrides on top of restored state
    const finalState = { ...restoredState, ...appliedOverrides }

    // Create a branch checkpoint — a new entity instance forked from this point
    const branchId = crypto.randomUUID()
    const branchLabel = options.branchLabel ?? `replay-from-step-${checkpoint.stepIndex}`

    await this.manager.save({
      entityType: checkpoint.entityType,
      entityId: branchId,
      stepIndex: 0,
      state: finalState,
      metadata: {
        trigger: 'manual',
        label: branchLabel,
        agentId: options.agentId,
        replayedFrom: checkpointId,
        originalEntityId: checkpoint.entityId,
        originalStepIndex: checkpoint.stepIndex,
      },
    })

    return {
      branchId,
      originalCheckpointId: checkpointId,
      restoredState: finalState,
      appliedOverrides,
      createdAt: new Date(),
    }
  }

  /**
   * Recursively diff two plain objects, returning field-level changes.
   * Handles nested objects with dot-notation paths.
   */
  private diffObjects(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    prefix = ''
  ): FieldDiff[] {
    const changes: FieldDiff[] = []

    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])

    for (const key of allKeys) {
      const field = prefix ? `${prefix}.${key}` : key
      const bVal = before[key]
      const aVal = after[key]

      if (!(key in before)) {
        changes.push({ field, before: undefined, after: aVal, type: 'added' })
      } else if (!(key in after)) {
        changes.push({ field, before: bVal, after: undefined, type: 'removed' })
      } else if (
        bVal !== null &&
        aVal !== null &&
        typeof bVal === 'object' &&
        typeof aVal === 'object' &&
        !Array.isArray(bVal) &&
        !Array.isArray(aVal)
      ) {
        // Recurse into nested objects
        const nested = this.diffObjects(
          bVal as Record<string, unknown>,
          aVal as Record<string, unknown>,
          field
        )
        changes.push(...nested)
      } else if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
        changes.push({ field, before: bVal, after: aVal, type: 'changed' })
      }
    }

    return changes
  }

  private triggerToColor(trigger: string): CheckpointTimelineEntry['dotColor'] {
    switch (trigger) {
      case 'status_change':
      case 'approval_decision':
        return 'green'
      case 'llm_call':
        return 'blue'
      case 'tool_invocation':
      case 'dag_step':
        return 'orange'
      case 'receipt_action':
        return 'red'
      default:
        return 'gray'
    }
  }
}
