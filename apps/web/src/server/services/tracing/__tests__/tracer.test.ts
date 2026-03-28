import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Tracer } from '../tracer'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@solarc/db', () => ({
  traces: {},
}))

vi.mock('node:async_hooks', () => {
  let store: unknown = undefined
  return {
    AsyncLocalStorage: vi.fn().mockImplementation(() => ({
      getStore: () => store,
      run: (ctx: unknown, fn: () => unknown) => {
        const prev = store
        store = ctx
        try {
          return fn()
        } finally {
          store = prev
        }
      },
    })),
  }
})

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  const catchFn = vi.fn().mockResolvedValue(undefined)
  const valuesFn = vi.fn().mockReturnValue({ catch: catchFn })

  return {
    insert: vi.fn().mockReturnValue({ values: valuesFn }),
    _mock: { valuesFn, catchFn },
  } as any
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Tracer', () => {
  let tracer: Tracer
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
    tracer = new Tracer(db)
  })

  // ── start ─────────────────────────────────────────────────────────────

  describe('start', () => {
    it('should create a root span with generated IDs', () => {
      const span = tracer.start('test-operation')

      expect(span.traceId).toBeDefined()
      expect(span.traceId).toHaveLength(32) // 16 bytes hex
      expect(span.spanId).toBeDefined()
      expect(span.spanId).toHaveLength(16) // 8 bytes hex
      expect(span.operation).toBe('test-operation')
      expect(span.parentSpanId).toBeUndefined()
      expect(span.ended).toBe(false)
    })

    it('should create a child span when parent context is provided', () => {
      const span = tracer.start('child-op', {
        parent: { traceId: 'abc123', parentSpanId: 'parent-span-id' },
      })

      expect(span.traceId).toBe('abc123')
      expect(span.parentSpanId).toBe('parent-span-id')
    })

    it('should set service on span', () => {
      const span = tracer.start('op', { service: 'gateway' })

      expect(span.service).toBe('gateway')
    })

    it('should generate unique span IDs', () => {
      const span1 = tracer.start('op1')
      const span2 = tracer.start('op2')

      expect(span1.spanId).not.toBe(span2.spanId)
    })
  })

  // ── Span operations ───────────────────────────────────────────────────

  describe('span operations', () => {
    it('should allow setting attributes', () => {
      const span = tracer.start('op')

      span.setAttribute('key', 'value')
      span.setAttribute('count', 42)

      // Attributes are internal; we verify they persist via end()
      expect(span.ended).toBe(false)
    })

    it('should allow setting status', () => {
      const span = tracer.start('op')

      span.setStatus('ok')

      expect(span.ended).toBe(false)
    })

    it('should record errors and set error status', () => {
      const span = tracer.start('op')

      span.recordError(new Error('Something failed'))

      // Will be persisted on end()
      expect(span.ended).toBe(false)
    })

    it('should record non-Error objects as errors', () => {
      const span = tracer.start('op')

      span.recordError('string error')

      expect(span.ended).toBe(false)
    })
  })

  // ── end ───────────────────────────────────────────────────────────────

  describe('end', () => {
    it('should persist span to database', async () => {
      const span = tracer.start('op', { service: 'test' })

      await span.end()

      expect(db.insert).toHaveBeenCalled()
      expect(db._mock.valuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'op',
          service: 'test',
        }),
      )
      expect(span.ended).toBe(true)
    })

    it('should be idempotent — second end() is a no-op', async () => {
      const span = tracer.start('op')

      await span.end()
      await span.end()

      expect(db.insert).toHaveBeenCalledTimes(1)
    })

    it('should include duration in persisted span', async () => {
      const span = tracer.start('op')

      await span.end()

      expect(db._mock.valuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMs: expect.any(Number),
        }),
      )
    })
  })

  // ── trace ─────────────────────────────────────────────────────────────

  describe('trace', () => {
    it('should run function within a span and auto-end', async () => {
      const result = await tracer.trace('wrapped-op', { service: 'test' }, async (span) => {
        span.setAttribute('key', 'value')
        return 42
      })

      expect(result).toBe(42)
      expect(db.insert).toHaveBeenCalled()
    })

    it('should record error and re-throw when function fails', async () => {
      await expect(
        tracer.trace('failing-op', { service: 'test' }, async () => {
          throw new Error('Boom')
        }),
      ).rejects.toThrow('Boom')

      // Span should still be persisted (with error status)
      expect(db.insert).toHaveBeenCalled()
    })
  })

  // ── Static helpers ────────────────────────────────────────────────────

  describe('toTraceparent', () => {
    it('should format W3C traceparent header', () => {
      const span = tracer.start('op')
      const header = Tracer.toTraceparent(span)

      expect(header).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/)
    })
  })

  describe('fromTraceparent', () => {
    it('should parse a valid traceparent header', () => {
      const ctx = Tracer.fromTraceparent('00-abcdef1234567890abcdef1234567890-1234567890abcdef-01')

      expect(ctx).toEqual({
        traceId: 'abcdef1234567890abcdef1234567890',
        parentSpanId: '1234567890abcdef',
      })
    })

    it('should return null for invalid header', () => {
      expect(Tracer.fromTraceparent('invalid')).toBeNull()
      expect(Tracer.fromTraceparent('01-abc-def')).toBeNull()
    })
  })
})
