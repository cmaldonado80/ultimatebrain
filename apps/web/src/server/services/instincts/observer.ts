/**
 * ECC Instinct System — Observer
 *
 * Runs as a background process (modeled after a lightweight Haiku-style agent)
 * that watches agent activity and records raw behavioral events.
 *
 * Observed event types:
 *   tool_call         — "Agent called search_web 4 times in one session before responding"
 *   user_correction   — "User replaced plain text response with structured JSON"
 *   error_resolution  — "Build failed with 'type mismatch'; agent ran tsc, then committed"
 *   agent_output      — "Agent produced a markdown table; user accepted without edits"
 *
 * Observations are buffered locally, then flushed on an interval to the
 * PatternDetector for clustering. The observer itself never writes instincts —
 * it only records raw signals.
 */

import { randomUUID } from 'crypto'

import type { InstinctObservation, ObservationType } from './types'

// ---------------------------------------------------------------------------
// Types specific to the observer layer
// ---------------------------------------------------------------------------

export interface ObservationEvent {
  /** Which Development / entity produced this event. */
  entityId: string
  /** Domain context at the time of the event. e.g. 'astrology', 'hospitality', 'universal' */
  domain: string
  eventType: ObservationType
  /**
   * Structured event payload.
   * Examples:
   *   { tool: 'search_web', query: 'lunar calendar', sessionId: 'abc123' }
   *   { original: 'The booking is confirmed', corrected: '{"status":"confirmed"}', field: 'format' }
   *   { error: "Cannot find module 'lodash'", resolution: 'npm install lodash', success: true }
   *   { outputType: 'markdown_table', userAccepted: true, editDistance: 0 }
   */
  payload: Record<string, unknown>
  /** ISO timestamp of the event. Defaults to now if omitted. */
  occurredAt?: Date
}

// ---------------------------------------------------------------------------
// Flush handler — implement to connect observer to the pattern detector
// ---------------------------------------------------------------------------

export type FlushHandler = (observations: InstinctObservation[]) => Promise<void>

// ---------------------------------------------------------------------------
// Observer configuration
// ---------------------------------------------------------------------------

export interface ObserverConfig {
  /** How many observations to accumulate before auto-flushing. Default: 20 */
  bufferSizeThreshold: number
  /** How often (ms) to flush even if buffer threshold is not met. Default: 60_000 (1 min) */
  flushIntervalMs: number
  /** Called when the buffer is flushed. Wire up to PatternDetector.detectPatterns(). */
  onFlush: FlushHandler
}

const DEFAULT_CONFIG: Omit<ObserverConfig, 'onFlush'> = {
  bufferSizeThreshold: 20,
  flushIntervalMs: 60_000,
}

// ---------------------------------------------------------------------------
// InstinctObserver
// ---------------------------------------------------------------------------

export class InstinctObserver {
  private buffer: InstinctObservation[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private config: ObserverConfig

  constructor(config: Partial<ObserverConfig> & { onFlush: FlushHandler }) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.startFlushTimer()
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Record a raw behavioral observation.
   *
   * Call this from any agent hook, tool wrapper, or middleware layer:
   *   observer.observe({
   *     entityId: 'dev-123',
   *     domain: 'astrology',
   *     eventType: 'user_correction',
   *     payload: { original: 'Mars is in Aries', corrected: '{"planet":"Mars","sign":"Aries"}' },
   *   })
   *
   * After 3+ similar observations the PatternDetector will form a candidate instinct:
   *   trigger: "when user asks about planetary positions"
   *   action:  "respond with structured JSON containing planet and sign fields"
   */
  observe(event: ObservationEvent): InstinctObservation {
    const observation: InstinctObservation = {
      id: randomUUID(),
      eventType: event.eventType,
      payload: {
        ...event.payload,
        _meta: {
          entityId: event.entityId,
          domain: event.domain,
          occurredAt: (event.occurredAt ?? new Date()).toISOString(),
        },
      },
      createdAt: event.occurredAt ?? new Date(),
    }

    this.buffer.push(observation)

    // Auto-flush if buffer exceeds size threshold
    if (this.buffer.length >= this.config.bufferSizeThreshold) {
      // Fire-and-forget — do not await in the synchronous observe() call
      void this.flush()
    }

    return observation
  }

  /**
   * Link an existing observation to a known instinct ID.
   * Called by the PatternDetector after it identifies which instinct
   * a given observation supports.
   */
  linkObservationToInstinct(observationId: string, instinctId: string): boolean {
    const obs = this.buffer.find((o) => o.id === observationId)
    if (!obs) return false
    obs.instinctId = instinctId
    return true
  }

  /**
   * Manually trigger a flush of the current buffer.
   * Useful at agent shutdown or between task boundaries.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return

    const batch = this.buffer.splice(0, this.buffer.length)

    try {
      await this.config.onFlush(batch)
    } catch (err) {
      // On flush failure, put observations back so they are not lost
      this.buffer.unshift(...batch)
      throw err
    }
  }

  /**
   * Returns a snapshot of the current unflushed buffer (for debugging / testing).
   */
  getBuffer(): ReadonlyArray<InstinctObservation> {
    return this.buffer
  }

  /**
   * Returns how many observations are currently buffered.
   */
  get bufferSize(): number {
    return this.buffer.length
  }

  /**
   * Stop the background flush timer. Call when shutting down the process.
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      void this.flush()
    }, this.config.flushIntervalMs)

    // Allow Node.js to exit even if this timer is running
    if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      ;(this.flushTimer as NodeJS.Timeout).unref()
    }
  }
}
