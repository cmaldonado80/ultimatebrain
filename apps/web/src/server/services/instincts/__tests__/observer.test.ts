import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FlushHandler, ObservationEvent } from '../observer'
import { InstinctObserver } from '../observer'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<ObservationEvent> = {}): ObservationEvent {
  return {
    entityId: 'dev-123',
    domain: 'universal',
    eventType: 'tool_call',
    payload: { tool: 'search_web', query: 'test' },
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('InstinctObserver', () => {
  let observer: InstinctObserver
  let flushHandler: FlushHandler

  beforeEach(() => {
    vi.useFakeTimers()
    flushHandler = vi.fn().mockResolvedValue(undefined)
    observer = new InstinctObserver({
      onFlush: flushHandler,
      bufferSizeThreshold: 5,
      flushIntervalMs: 60_000,
    })
  })

  afterEach(() => {
    observer.destroy()
    vi.useRealTimers()
  })

  // ── observe ───────────────────────────────────────────────────────────

  describe('observe', () => {
    it('should add an observation to the buffer', () => {
      const obs = observer.observe(makeEvent())

      expect(obs).toBeDefined()
      expect(obs.id).toBeDefined()
      expect(obs.eventType).toBe('tool_call')
      expect(observer.bufferSize).toBe(1)
    })

    it('should include _meta in observation payload', () => {
      const obs = observer.observe(makeEvent({ entityId: 'dev-456', domain: 'astrology' }))

      const meta = obs.payload._meta as Record<string, unknown>
      expect(meta.entityId).toBe('dev-456')
      expect(meta.domain).toBe('astrology')
      expect(meta.occurredAt).toBeDefined()
    })

    it('should generate unique IDs for each observation', () => {
      const obs1 = observer.observe(makeEvent())
      const obs2 = observer.observe(makeEvent())

      expect(obs1.id).not.toBe(obs2.id)
    })

    it('should auto-flush when buffer reaches threshold', () => {
      for (let i = 0; i < 5; i++) {
        observer.observe(makeEvent())
      }

      // flush is fire-and-forget from observe(), but handler should be called
      expect(flushHandler).toHaveBeenCalledTimes(1)
      expect(flushHandler).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ eventType: 'tool_call' })]),
      )
    })

    it('should not auto-flush when buffer is below threshold', () => {
      for (let i = 0; i < 4; i++) {
        observer.observe(makeEvent())
      }

      expect(flushHandler).not.toHaveBeenCalled()
      expect(observer.bufferSize).toBe(4)
    })

    it('should use provided occurredAt date', () => {
      const customDate = new Date('2025-01-01T00:00:00Z')
      const obs = observer.observe(makeEvent({ occurredAt: customDate }))

      expect(obs.createdAt).toEqual(customDate)
    })
  })

  // ── flush ─────────────────────────────────────────────────────────────

  describe('flush', () => {
    it('should send buffered observations to flush handler', async () => {
      observer.observe(makeEvent())
      observer.observe(makeEvent({ eventType: 'user_correction' }))

      await observer.flush()

      expect(flushHandler).toHaveBeenCalledTimes(1)
      expect(flushHandler).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ eventType: 'tool_call' }),
          expect.objectContaining({ eventType: 'user_correction' }),
        ]),
      )
      expect(observer.bufferSize).toBe(0)
    })

    it('should do nothing when buffer is empty', async () => {
      await observer.flush()

      expect(flushHandler).not.toHaveBeenCalled()
    })

    it('should restore buffer on flush failure', async () => {
      const failHandler = vi.fn().mockRejectedValue(new Error('Flush failed'))
      const failObserver = new InstinctObserver({
        onFlush: failHandler,
        bufferSizeThreshold: 100,
        flushIntervalMs: 600_000,
      })

      failObserver.observe(makeEvent())
      failObserver.observe(makeEvent())

      await expect(failObserver.flush()).rejects.toThrow('Flush failed')

      // Buffer should be restored
      expect(failObserver.bufferSize).toBe(2)

      failObserver.destroy()
    })
  })

  // ── getBuffer ─────────────────────────────────────────────────────────

  describe('getBuffer', () => {
    it('should return current buffer contents', () => {
      observer.observe(makeEvent())

      const buffer = observer.getBuffer()

      expect(buffer).toHaveLength(1)
      expect(buffer[0].eventType).toBe('tool_call')
    })

    it('should return empty array when buffer is empty', () => {
      expect(observer.getBuffer()).toHaveLength(0)
    })
  })

  // ── linkObservationToInstinct ─────────────────────────────────────────

  describe('linkObservationToInstinct', () => {
    it('should link an observation to an instinct', () => {
      const obs = observer.observe(makeEvent())

      const linked = observer.linkObservationToInstinct(obs.id, 'instinct-1')

      expect(linked).toBe(true)
      const buffer = observer.getBuffer()
      expect(buffer[0].instinctId).toBe('instinct-1')
    })

    it('should return false for non-existent observation', () => {
      const linked = observer.linkObservationToInstinct('nonexistent', 'instinct-1')

      expect(linked).toBe(false)
    })
  })

  // ── Timer-based flush ─────────────────────────────────────────────────

  describe('timer flush', () => {
    it('should flush on interval', async () => {
      observer.observe(makeEvent())

      vi.advanceTimersByTime(60_000)

      // Timer-based flush is fire-and-forget
      expect(flushHandler).toHaveBeenCalled()
    })
  })

  // ── destroy ───────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('should stop the flush timer', () => {
      observer.destroy()
      observer.observe(makeEvent())

      vi.advanceTimersByTime(120_000)

      // After destroy, timer-based flush should not fire
      expect(flushHandler).not.toHaveBeenCalled()
    })
  })
})
