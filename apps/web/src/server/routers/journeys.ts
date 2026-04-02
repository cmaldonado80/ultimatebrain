/**
 * Journeys Router — expose JourneyEngine for declarative agent state machines.
 * DB-backed via journey_executions table for persistence across restarts.
 */
import { z } from 'zod'

import { JourneyEngine } from '../services/agents/journey-engine'
import { protectedProcedure, router } from '../trpc'

let _engine: JourneyEngine | null = null
function getEngine(db?: unknown) {
  if (!_engine) _engine = new JourneyEngine(db)
  return _engine
}

export const journeysRouter = router({
  /** List all active journey executions */
  list: protectedProcedure.query(({ ctx }) => {
    return getEngine(ctx.db).listActive()
  }),

  /** Get a single execution by ID */
  get: protectedProcedure.input(z.object({ executionId: z.string() })).query(({ ctx, input }) => {
    return getEngine(ctx.db).getExecution(input.executionId) ?? null
  }),

  /** Pause a running journey */
  pause: protectedProcedure
    .input(z.object({ executionId: z.string() }))
    .mutation(({ ctx, input }) => {
      getEngine(ctx.db).pause(input.executionId)
      return { success: true }
    }),

  /** Resume a paused journey */
  resume: protectedProcedure
    .input(z.object({ executionId: z.string() }))
    .mutation(({ ctx, input }) => {
      getEngine(ctx.db).resume(input.executionId)
      return { success: true }
    }),

  /** Fail a journey */
  fail: protectedProcedure
    .input(z.object({ executionId: z.string() }))
    .mutation(({ ctx, input }) => {
      getEngine(ctx.db).fail(input.executionId)
      return { success: true }
    }),
})
