/**
 * DB-Backed Tracer — writes spans to the `traces` table.
 *
 * Activates the existing traces infrastructure:
 * - `traces` table (schema ready, indexed)
 * - Traces tRPC API (5 query procedures)
 * - Traces UI (/ops/traces)
 *
 * The Gateway router already has span creation code throughout chat() —
 * this tracer makes it real by implementing the Tracer/Span interface.
 *
 * Telemetry failures never break requests (fire-and-forget).
 */

import type { Database } from '@solarc/db'
import { traces } from '@solarc/db'

// Re-export the same interface the Gateway router expects
export interface Span {
  traceId: string
  spanId: string
  setAttribute(key: string, value: unknown): void
  setStatus(status: string): void
  recordError(err: unknown): void
  end(): Promise<void>
}

export interface Tracer {
  start(name: string, options?: Record<string, unknown>): Span | undefined
}

/**
 * Create a tracer that writes spans directly to the `traces` table.
 * No external OTEL exporter needed — the traces tRPC API and UI
 * already know how to read this data.
 */
export function createDbTracer(db: Database, service: string): Tracer {
  return {
    start(operation: string, options?: Record<string, unknown>): Span {
      const traceId = (options?.traceId as string) ?? crypto.randomUUID()
      const spanId = crypto.randomUUID()
      const parentSpanId = (options?.parentSpanId as string) ?? null
      const agentId = (options?.agentId as string) ?? null
      const startTime = Date.now()
      const attributes: Record<string, unknown> = {}
      let status = 'ok'

      // Copy non-internal options as initial attributes
      if (options) {
        for (const [k, v] of Object.entries(options)) {
          if (!['traceId', 'parentSpanId', 'agentId'].includes(k)) {
            attributes[k] = v
          }
        }
      }

      return {
        traceId,
        spanId,
        setAttribute(key: string, value: unknown) {
          attributes[key] = value
        },
        setStatus(s: string) {
          status = s
        },
        recordError(err: unknown) {
          status = 'error'
          attributes['error.message'] = err instanceof Error ? err.message : String(err)
        },
        async end() {
          const durationMs = Date.now() - startTime
          try {
            await db.insert(traces).values({
              traceId,
              spanId,
              parentSpanId,
              operation,
              service,
              agentId,
              durationMs,
              status,
              attributes,
            })
          } catch {
            // Telemetry failures must never break requests
          }
        },
      }
    },
  }
}
