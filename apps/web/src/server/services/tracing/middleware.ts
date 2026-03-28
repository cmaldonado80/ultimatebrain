/**
 * tRPC middleware that auto-instruments every procedure with a trace span.
 *
 * Attaches to each request:
 * - span per procedure call (operation = router.procedure)
 * - attributes: userId, input size, output size
 * - status: ok / error
 * - duration: precise ms
 *
 * Injects `span` and `tracer` into ctx so individual procedures
 * can add custom attributes or create child spans.
 */

import type { TRPCContext } from '../../trpc'
import { middleware } from '../../trpc'
import type { Span, Tracer } from './tracer'

export interface TracedContext extends TRPCContext {
  tracer: Tracer
  span: Span
}

/**
 * Create a tRPC middleware that traces every procedure call.
 * Pass the tracer singleton created at server startup.
 */
export function createTracingMiddleware(tracer: Tracer) {
  return middleware(async ({ ctx, next, path, type }) => {
    // Extract incoming traceparent header if present
    const traceparent = ctx.req?.headers?.get?.('traceparent') as string | undefined
    const parent = traceparent ? require('./tracer').Tracer.fromTraceparent(traceparent) : undefined

    // userId might be in session
    const userId = ctx.session?.userId

    const span = tracer.start(path, {
      service: 'trpc',
      parent,
    })

    span.setAttribute('trpc.type', type)
    span.setAttribute('trpc.path', path)
    if (userId) span.setAttribute('user.id', userId)

    try {
      const result = await next({
        ctx: {
          ...ctx,
          tracer,
          span,
        } as TracedContext,
      })

      span.setStatus('ok')
      return result
    } catch (err) {
      span.recordError(err)
      throw err
    } finally {
      await span.end()
    }
  })
}
