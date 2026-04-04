/**
 * API Route Instrumentation Wrapper
 *
 * Wraps Next.js API route handlers with:
 * 1. Request ID generation (crypto.randomUUID())
 * 2. Request/response structured logging
 * 3. Duration tracking with performance threshold warnings
 * 4. Consistent error response shape (never leaks internals)
 * 5. Request context injection via AsyncLocalStorage
 *
 * Usage:
 *   export const GET = withInstrumentation(async (req) => {
 *     return NextResponse.json({ data: '...' })
 *   })
 */

import { NextRequest, NextResponse } from 'next/server'

import { logger, withRequestContext } from './logger'

interface InstrumentationOptions {
  /** Skip logging for health checks or high-frequency endpoints */
  silent?: boolean
}

export function withInstrumentation(
  handler: (
    req: NextRequest,
    ctx: { params: Promise<Record<string, string>> },
  ) => Promise<Response>,
  options?: InstrumentationOptions,
) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    const requestId = crypto.randomUUID()
    const start = Date.now()
    const path = new URL(req.url).pathname
    const method = req.method

    return withRequestContext({ requestId, path }, async () => {
      try {
        const response = await handler(req, ctx)
        const duration_ms = Date.now() - start
        const status = response.status

        if (!options?.silent) {
          // Performance threshold logging
          if (duration_ms > 3000) {
            logger.error({ method, path, status, duration_ms }, 'critical response time')
          } else if (duration_ms > 1000) {
            logger.warn({ method, path, status, duration_ms }, 'slow response')
          } else if (duration_ms > 500) {
            logger.info({ method, path, status, duration_ms }, 'request completed')
          }
          // < 500ms: no log (fast enough)
        }

        // Inject request ID header for client-side correlation
        response.headers.set('X-Request-ID', requestId)
        return response
      } catch (err) {
        const duration_ms = Date.now() - start

        logger.error(
          { err: err instanceof Error ? err : new Error(String(err)), method, path, duration_ms },
          'unhandled route error',
        )

        // Never expose internal error details to clients
        return NextResponse.json(
          {
            error: 'Internal server error',
            requestId,
          },
          { status: 500 },
        )
      }
    })
  }
}
