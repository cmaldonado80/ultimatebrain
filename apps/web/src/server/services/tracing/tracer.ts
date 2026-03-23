/**
 * Distributed tracer: W3C TraceContext-compatible span management.
 *
 * Writes spans to the `traces` table (Drizzle). Designed to be
 * lightweight — no OTEL SDK dependency, same wire format.
 *
 * Trace lifecycle:
 *   const span = tracer.start('operation', { service: 'gateway', agentId })
 *   try { ... span.setAttribute('key', val) ... }
 *   finally { span.end() }
 *
 * Or use the convenience wrapper:
 *   const result = await tracer.trace('operation', opts, async (span) => { ... })
 */

import { randomBytes } from 'node:crypto'
import type { Database } from '@solarc/db'
import { traces } from '@solarc/db'

// === ID generation ===

function hex(bytes: number): string {
  return randomBytes(bytes).toString('hex')
}

function newTraceId(): string {
  return hex(16) // 32 hex chars
}

function newSpanId(): string {
  return hex(8) // 16 hex chars
}

// === Span status ===

export type SpanStatus = 'ok' | 'error' | 'unset'

// === Span interface ===

export interface Span {
  traceId: string
  spanId: string
  parentSpanId: string | undefined
  operation: string
  service: string | undefined
  /** Set an attribute (key-value) on this span */
  setAttribute(key: string, value: unknown): void
  /** Set the span status */
  setStatus(status: SpanStatus): void
  /** Record an error on this span */
  recordError(err: unknown): void
  /** Finish the span and persist to DB */
  end(): Promise<void>
  /** Whether end() has been called */
  readonly ended: boolean
}

// === Context propagation ===

export interface TraceContext {
  traceId: string
  parentSpanId: string
}

// Node AsyncLocalStorage for implicit context propagation
let _als: import('node:async_hooks').AsyncLocalStorage<TraceContext> | null = null

function getALS() {
  if (!_als) {
    // Lazy import — avoids issues in edge runtimes
    const { AsyncLocalStorage } = require('node:async_hooks')
    _als = new AsyncLocalStorage<TraceContext>()
  }
  return _als
}

// === Span implementation ===

class SpanImpl implements Span {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId: string | undefined
  readonly operation: string
  readonly service: string | undefined
  private attributes: Record<string, unknown> = {}
  private status: SpanStatus = 'unset'
  private startedAt: number
  private _ended = false
  private agentId?: string
  private ticketId?: string

  constructor(
    private db: Database,
    params: {
      traceId: string
      spanId: string
      parentSpanId?: string
      operation: string
      service?: string
      agentId?: string
      ticketId?: string
    },
  ) {
    this.traceId = params.traceId
    this.spanId = params.spanId
    this.parentSpanId = params.parentSpanId
    this.operation = params.operation
    this.service = params.service
    this.agentId = params.agentId
    this.ticketId = params.ticketId
    this.startedAt = Date.now()
  }

  setAttribute(key: string, value: unknown): void {
    this.attributes[key] = value
  }

  setStatus(status: SpanStatus): void {
    this.status = status
  }

  recordError(err: unknown): void {
    this.status = 'error'
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    this.attributes['error.message'] = message
    if (stack) this.attributes['error.stack'] = stack
    this.attributes['error.type'] = err instanceof Error ? err.constructor.name : 'unknown'
  }

  get ended(): boolean {
    return this._ended
  }

  async end(): Promise<void> {
    if (this._ended) return
    this._ended = true

    const durationMs = Date.now() - this.startedAt

    // Fire-and-forget — span failure must never affect the caller
    await this.db
      .insert(traces)
      .values({
        traceId: this.traceId,
        spanId: this.spanId,
        parentSpanId: this.parentSpanId,
        operation: this.operation,
        service: this.service,
        agentId: this.agentId ?? null,
        ticketId: this.ticketId ?? null,
        durationMs,
        status: this.status === 'unset' ? 'ok' : this.status,
        attributes: Object.keys(this.attributes).length > 0 ? this.attributes : null,
      })
      .catch((err) => {
        console.error('[Tracer] Failed to persist span:', err)
      })
  }
}

// === Tracer ===

export interface StartSpanOptions {
  service?: string
  agentId?: string
  ticketId?: string
  /** Explicit parent context (overrides AsyncLocalStorage) */
  parent?: TraceContext
}

export class Tracer {
  constructor(private db: Database) {}

  /**
   * Start a new span. The span is a child of the current ALS context
   * (or `options.parent` if provided). If no context exists, starts a root span.
   */
  start(operation: string, options?: StartSpanOptions): Span {
    const als = getALS()
    const ambient = als.getStore()
    const parent = options?.parent ?? (ambient ? { traceId: ambient.traceId, parentSpanId: ambient.parentSpanId } : undefined)

    const traceId = parent?.traceId ?? newTraceId()
    const spanId = newSpanId()
    const parentSpanId = parent?.parentSpanId

    return new SpanImpl(this.db, {
      traceId,
      spanId,
      parentSpanId,
      operation,
      service: options?.service,
      agentId: options?.agentId,
      ticketId: options?.ticketId,
    })
  }

  /**
   * Convenience: run `fn` within a span, auto-ending on completion.
   * Propagates trace context via AsyncLocalStorage so child spans nest correctly.
   */
  async trace<T>(
    operation: string,
    options: StartSpanOptions,
    fn: (span: Span) => Promise<T>,
  ): Promise<T> {
    const span = this.start(operation, options)
    const als = getALS()

    const context: TraceContext = { traceId: span.traceId, parentSpanId: span.spanId }

    try {
      const result = await als.run(context, () => fn(span))
      span.setStatus('ok')
      return result
    } catch (err) {
      span.recordError(err)
      throw err
    } finally {
      await span.end()
    }
  }

  /**
   * Extract a W3C traceparent header value for outbound HTTP calls.
   * Format: 00-<traceId>-<spanId>-01
   */
  static toTraceparent(span: Span): string {
    return `00-${span.traceId}-${span.spanId}-01`
  }

  /**
   * Parse an inbound W3C traceparent header into a TraceContext.
   */
  static fromTraceparent(header: string): TraceContext | null {
    const parts = header.split('-')
    if (parts.length < 3 || parts[0] !== '00') return null
    return { traceId: parts[1], parentSpanId: parts[2] }
  }
}
