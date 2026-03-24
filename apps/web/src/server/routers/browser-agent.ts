/**
 * Browser Agent Router — live browser session streaming.
 */
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { BrowserAgentStream } from '../services/browser-agent/stream'

let _stream: BrowserAgentStream | null = null
function getStream() {
  return (_stream ??= new BrowserAgentStream())
}

export const browserAgentRouter = router({
  /** List active browser sessions */
  activeSessions: protectedProcedure.query(() => {
    return getStream().listActiveSessions()
  }),

  /** Get a single session */
  session: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
    return getStream().getSession(input.id)
  }),

  /** Get events for a session */
  sessionEvents: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
    return getStream().getSessionEvents(input.id)
  }),

  /** Start a new browser session */
  start: protectedProcedure
    .input(
      z.object({ agentId: z.string(), agentName: z.string(), initialUrl: z.string().optional() }),
    )
    .mutation(({ input }) => {
      const sessionId = getStream().startSession(input.agentId, input.agentName, input.initialUrl)
      return { sessionId }
    }),

  /** Pause a session */
  pause: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    getStream().pauseSession(input.id)
    return { paused: true }
  }),

  /** Resume a session */
  resume: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    getStream().resumeSession(input.id)
    return { resumed: true }
  }),

  /** Take over a session (human control) */
  takeover: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    getStream().takeoverSession(input.id)
    return { takenOver: true }
  }),

  /** Stop a session */
  stop: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    getStream().stopSession(input.id)
    return { stopped: true }
  }),
})
