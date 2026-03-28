/**
 * Playbooks Router — workflow recording, distillation, and replay.
 *
 * Records agent execution traces into reusable playbooks, distills them into
 * optimized step sequences, and replays them for automated workflow execution.
 */
import type { Database } from '@solarc/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { PlaybookDistiller, PlaybookExecutor, PlaybookRecorder } from '../services/playbooks'
import { protectedProcedure, router } from '../trpc'

let _recorder: PlaybookRecorder | null = null
let _distiller: PlaybookDistiller | null = null
let _executor: PlaybookExecutor | null = null

function getRecorder(db: Database) {
  return (_recorder ??= new PlaybookRecorder(db))
}
function getDistiller() {
  return (_distiller ??= new PlaybookDistiller())
}
function getExecutor(db: Database) {
  return (_executor ??= new PlaybookExecutor(db))
}

const playbookStepSchema = z.object({
  index: z.number().int().min(0),
  name: z.string(),
  type: z.enum([
    'click',
    'decision',
    'transformation',
    'navigation',
    'form_submit',
    'api_call',
    'custom',
  ]),
  description: z.string(),
  parameters: z.record(z.unknown()),
  expectedOutcome: z.string().optional(),
  requiresApproval: z.boolean().optional(),
})

export const playbooksRouter = router({
  // ── Playbook CRUD ─────────────────────────────────────────────────────

  list: protectedProcedure.query(async ({ ctx }) => {
    const recorder = getRecorder(ctx.db)
    return recorder.list()
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const recorder = getRecorder(ctx.db)
      const pb = await recorder.get(input.id)
      if (!pb) throw new TRPCError({ code: 'NOT_FOUND', message: 'Playbook not found' })
      return pb
    }),

  save: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        steps: z.array(playbookStepSchema),
        description: z.string().optional(),
        createdBy: z.string().optional(),
        triggerConditions: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const recorder = getRecorder(ctx.db)
      return recorder.save(input.name, input.steps, {
        description: input.description,
        createdBy: input.createdBy,
        triggerConditions: input.triggerConditions,
      })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const recorder = getRecorder(ctx.db)
      await recorder.delete(input.id)
      return { success: true }
    }),

  // ── Recording Session ─────────────────────────────────────────────────

  /** Start a recording session */
  startRecording: protectedProcedure
    .input(z.object({ context: z.record(z.unknown()).optional() }))
    .mutation(async ({ ctx, input }) => {
      const recorder = getRecorder(ctx.db)
      const sessionId = recorder.startRecording(input.context)
      return { sessionId }
    }),

  /** Record an event into an active session */
  recordEvent: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        type: z.enum([
          'click',
          'decision',
          'transformation',
          'navigation',
          'form_submit',
          'api_call',
          'custom',
        ]),
        component: z.string().optional(),
        action: z.string().optional(),
        parameters: z.record(z.unknown()).optional(),
        decision: z
          .object({
            option: z.string(),
            reason: z.string().optional(),
            alternatives: z.array(z.string()).optional(),
          })
          .optional(),
        transformation: z
          .object({
            input: z.unknown(),
            output: z.unknown(),
            description: z.string().optional(),
          })
          .optional(),
        navigation: z.object({ from: z.string(), to: z.string() }).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const recorder = getRecorder(ctx.db)
      const { sessionId, ...event } = input
      recorder.record(
        sessionId,
        event as Omit<import('../services/playbooks/recorder').RecordedEvent, 'timestamp'>,
      )
      return { success: true }
    }),

  /** End recording and get raw steps */
  endRecording: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const recorder = getRecorder(ctx.db)
      return recorder.endRecording(input.sessionId)
    }),

  // ── Distillation ──────────────────────────────────────────────────────

  /** Distill raw steps into a parameterized playbook */
  distill: protectedProcedure
    .input(
      z.object({
        steps: z.array(playbookStepSchema),
        suggestedName: z.string().optional(),
        context: z.string().optional(),
        aggressiveParameterization: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const distiller = getDistiller()
      return distiller.distill(input.steps, {
        suggestedName: input.suggestedName,
        context: input.context,
        aggressiveParameterization: input.aggressiveParameterization,
      })
    }),

  /** Generate SKILL.md doc for a saved playbook */
  generateSkillDoc: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const recorder = getRecorder(ctx.db)
      const pb = await recorder.get(input.id)
      if (!pb) throw new TRPCError({ code: 'NOT_FOUND', message: 'Playbook not found' })
      const distiller = getDistiller()
      const doc = distiller.generateSkillDocForPlaybook(pb)
      return { doc }
    }),

  // ── Execution ─────────────────────────────────────────────────────────

  /** Run a playbook with parameter values */
  run: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        parameterValues: z.record(z.unknown()).optional(),
        hitlMode: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const recorder = getRecorder(ctx.db)
      const pb = await recorder.get(input.id)
      if (!pb) throw new TRPCError({ code: 'NOT_FOUND', message: 'Playbook not found' })
      const executor = getExecutor(ctx.db)
      return executor.execute(pb, {
        parameterValues: input.parameterValues,
        hitlMode: input.hitlMode,
      })
    }),

  /** Get a run result by ID */
  getRun: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const executor = getExecutor(ctx.db)
      const run = executor.getRun(input.runId)
      if (!run) throw new TRPCError({ code: 'NOT_FOUND', message: 'Run not found' })
      return run
    }),

  /** A/B test two playbooks */
  abTest: protectedProcedure
    .input(
      z.object({
        originalId: z.string().uuid(),
        modifiedId: z.string().uuid(),
        parameterValues: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const recorder = getRecorder(ctx.db)
      const [original, modified] = await Promise.all([
        recorder.get(input.originalId),
        recorder.get(input.modifiedId),
      ])
      if (!original)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Original playbook not found' })
      if (!modified)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Modified playbook not found' })
      const executor = getExecutor(ctx.db)
      return executor.abTest(original, modified, input.parameterValues)
    }),
})
