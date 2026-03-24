/**
 * Visual QA Router — recording and LLM-powered review of browser sessions.
 */
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { VisualQARecorder } from '../services/visual-qa/recorder'
import { VisualQAReviewer } from '../services/visual-qa/reviewer'
import type { Database } from '@solarc/db'

let _recorder: VisualQARecorder | null = null
let _reviewer: VisualQAReviewer | null = null

function getRecorder() {
  return (_recorder ??= new VisualQARecorder())
}
function getReviewer(db: Database) {
  return (_reviewer ??= new VisualQAReviewer({ db }))
}

export const visualQaRouter = router({
  /** List all recordings */
  recordings: protectedProcedure.query(() => {
    return getRecorder().listRecordings()
  }),

  /** Get a single recording */
  recording: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
    return getRecorder().getRecording(input.id)
  }),

  /** Start recording a browser session */
  startRecording: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        agentId: z.string(),
        agentName: z.string(),
        ticketId: z.string().optional(),
      }),
    )
    .mutation(({ input }) => {
      return getRecorder().startRecording(input.sessionId, input.agentId, input.agentName, {
        ticketId: input.ticketId,
      })
    }),

  /** Stop a recording */
  stopRecording: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return getRecorder().stopRecording(input.id)
    }),

  /** Review a recording with LLM */
  review: protectedProcedure
    .input(
      z.object({
        recordingId: z.string(),
        expectedState: z.string(),
        checkpoints: z
          .array(
            z.object({
              name: z.string(),
              description: z.string(),
              selector: z.string().optional(),
              expectedText: z.string().optional(),
            }),
          )
          .optional(),
        tolerance: z.number().min(0).max(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const recording = getRecorder().getRecording(input.recordingId)
      if (!recording) return { error: 'Recording not found' }
      return getReviewer(ctx.db).review(recording, {
        expectedState: input.expectedState,
        checkpoints: input.checkpoints ?? [],
        tolerance: input.tolerance,
      })
    }),

  /** Quick pass/fail review */
  quickReview: protectedProcedure
    .input(z.object({ recordingId: z.string(), expectedState: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const recording = getRecorder().getRecording(input.recordingId)
      if (!recording) return { error: 'Recording not found' }
      return getReviewer(ctx.db).quickReview(recording, input.expectedState)
    }),
})
