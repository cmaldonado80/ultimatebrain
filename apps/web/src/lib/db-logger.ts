/**
 * Drizzle ORM Query Logger — structured slow-query detection.
 *
 * Tracks query duration and logs warnings when queries exceed thresholds.
 * Never logs query parameters (security: no user data in logs).
 *
 * Usage: Pass to createDb() when instrumentation is desired.
 *   import { dbLogger } from '@/lib/db-logger'
 *   // In your DB wrapper:
 *   drizzle(pool, { schema, logger: dbLogger })
 */

import { logger } from './logger'

const SLOW_QUERY_MS = Number(process.env.DB_SLOW_QUERY_THRESHOLD ?? 500)
const CRITICAL_QUERY_MS = 2000

/** Drizzle-compatible logger that tracks query timing. */
export const dbLogger = {
  logQuery(query: string, params: unknown[]): void {
    // Extract the operation type (SELECT, INSERT, UPDATE, DELETE)
    const op = query.split(/\s+/)[0]?.toUpperCase() ?? 'UNKNOWN'
    // Extract the first table name (after FROM, INTO, UPDATE, etc.)
    const tableMatch = query.match(/(?:FROM|INTO|UPDATE|JOIN)\s+"?(\w+)"?/i)
    const table = tableMatch?.[1] ?? 'unknown'

    // We only have the query text at this point — Drizzle's logger interface
    // doesn't provide timing. Use a proxy-based approach for timing.
    // This log is useful for debugging which queries are being run.
    if (process.env.NODE_ENV !== 'production') {
      logger.debug({ op, table, paramCount: params.length }, 'db query')
    }
  },
}

/**
 * Wrap an async DB operation to measure its duration.
 *
 * Usage:
 *   const users = await trackQuery('getActiveAgents', () =>
 *     db.query.agents.findMany({ where: eq(agents.status, 'active') })
 *   )
 */
export async function trackQuery<T>(queryName: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    const duration_ms = Date.now() - start

    if (duration_ms >= CRITICAL_QUERY_MS) {
      logger.error({ queryName, duration_ms }, 'critical slow query')
    } else if (duration_ms >= SLOW_QUERY_MS) {
      logger.warn({ queryName, duration_ms }, 'slow query')
    }

    return result
  } catch (err) {
    const duration_ms = Date.now() - start
    logger.error(
      { err: err instanceof Error ? err : new Error(String(err)), queryName, duration_ms },
      'query failed',
    )
    throw err
  }
}
