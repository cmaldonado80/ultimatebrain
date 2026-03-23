import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure, protectedProcedure } from '../trpc'
import { CheckpointManager } from '../services/checkpointing/checkpoint-manager'
import { TimeTravelEngine } from '../services/checkpointing/time-travel'

let _checkpointMgr: CheckpointManager | null = null
let _timeTravelEngine: TimeTravelEngine | null = null

function getCheckpointManager(db: any) { return _checkpointMgr ??= new CheckpointManager(db) }
function getTimeTravelEngine(db: any) { return _timeTravelEngine ??= new TimeTravelEngine(db) }

export const checkpointingRouter = router({
  // ── Checkpoint CRUD ──────────────────────────────────────────────────────

  /** Save a checkpoint manually */
  save: protectedProcedure
    .input(
      z.object({
        entityType: z.string(),
        entityId: z.string().uuid(),
        stepIndex: z.number().int().min(0),
        state: z.record(z.unknown()),
        metadata: z.object({
          trigger: z.enum([
            'status_change',
            'llm_call',
            'tool_invocation',
            'approval_decision',
            'dag_step',
            'receipt_action',
            'manual',
          ]),
          agentId: z.string().uuid().optional(),
          traceId: z.string().optional(),
          label: z.string().optional(),
        }),
        granularity: z.enum(['all', 'milestones', 'none']).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const manager = getCheckpointManager(ctx.db)
      const id = await manager.save(input)
      return { id, saved: id !== null }
    }),

  /** List all checkpoints for an entity */
  list: publicProcedure
    .input(
      z.object({
        entityType: z.string(),
        entityId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const manager = getCheckpointManager(ctx.db)
      return manager.list(input.entityType, input.entityId)
    }),

  /** Get a single checkpoint by ID */
  get: publicProcedure
    .input(z.object({ checkpointId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const manager = getCheckpointManager(ctx.db)
      const checkpoint = await manager.get(input.checkpointId)
      if (!checkpoint) throw new TRPCError({ code: 'NOT_FOUND', message: 'Checkpoint not found' })
      return checkpoint
    }),

  /** Get the latest checkpoint for an entity */
  getLatest: publicProcedure
    .input(
      z.object({
        entityType: z.string(),
        entityId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const manager = getCheckpointManager(ctx.db)
      return manager.getLatest(input.entityType, input.entityId)
    }),

  /** Count checkpoints for an entity */
  count: publicProcedure
    .input(
      z.object({
        entityType: z.string(),
        entityId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const manager = getCheckpointManager(ctx.db)
      const total = await manager.count(input.entityType, input.entityId)
      return { total }
    }),

  /** Prune checkpoints older than N days (admin/cron use) */
  prune: protectedProcedure
    .input(z.object({ retentionDays: z.number().int().min(1).default(30) }))
    .mutation(async ({ ctx, input }) => {
      const manager = getCheckpointManager(ctx.db)
      const deleted = await manager.prune(input.retentionDays)
      return { deleted }
    }),

  // ── Time Travel ───────────────────────────────────────────────────────────

  /** Get a visual timeline for an entity */
  getTimeline: publicProcedure
    .input(
      z.object({
        entityType: z.string(),
        entityId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const engine = getTimeTravelEngine(ctx.db)
      return engine.getTimeline(input.entityType, input.entityId)
    }),

  /** Diff two specific checkpoints */
  diff: publicProcedure
    .input(
      z.object({
        checkpointAId: z.string().uuid(),
        checkpointBId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const engine = getTimeTravelEngine(ctx.db)
      return engine.diffCheckpoints(input.checkpointAId, input.checkpointBId)
    }),

  /** Diff the latest two checkpoints for an entity */
  diffLatest: publicProcedure
    .input(
      z.object({
        entityType: z.string(),
        entityId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const engine = getTimeTravelEngine(ctx.db)
      return engine.diffLatest(input.entityType, input.entityId)
    }),

  /** Replay from a checkpoint, optionally with param overrides */
  replay: protectedProcedure
    .input(
      z.object({
        checkpointId: z.string().uuid(),
        paramOverrides: z.record(z.unknown()).optional(),
        branchLabel: z.string().optional(),
        agentId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const engine = getTimeTravelEngine(ctx.db)
      return engine.replayFrom(input.checkpointId, {
        paramOverrides: input.paramOverrides,
        branchLabel: input.branchLabel,
        agentId: input.agentId,
      })
    }),
})
