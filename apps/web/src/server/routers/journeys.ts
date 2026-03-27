/**
 * Journeys Router — expose JourneyEngine for declarative agent state machines.
 */
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { JourneyEngine } from '../services/agents/journey-engine'

let _engine: JourneyEngine | null = null
function getEngine() {
  return (_engine ??= new JourneyEngine())
}

export const journeysRouter = router({
  /** List all active journey executions */
  list: protectedProcedure.query(() => {
    return getEngine().listActive()
  }),

  /** Get a single execution by ID */
  get: protectedProcedure.input(z.object({ executionId: z.string() })).query(({ input }) => {
    return getEngine().getExecution(input.executionId) ?? null
  }),

  /** Pause a running journey */
  pause: protectedProcedure.input(z.object({ executionId: z.string() })).mutation(({ input }) => {
    getEngine().pause(input.executionId)
    return { success: true }
  }),

  /** Resume a paused journey */
  resume: protectedProcedure.input(z.object({ executionId: z.string() })).mutation(({ input }) => {
    getEngine().resume(input.executionId)
    return { success: true }
  }),

  /** Fail a journey */
  fail: protectedProcedure.input(z.object({ executionId: z.string() })).mutation(({ input }) => {
    getEngine().fail(input.executionId)
    return { success: true }
  }),
})
