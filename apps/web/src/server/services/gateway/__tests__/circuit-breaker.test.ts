import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CircuitBreakerRegistry } from '../circuit-breaker'

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry

  beforeEach(() => {
    vi.useFakeTimers()
    registry = new CircuitBreakerRegistry({
      threshold: 3,
      windowMs: 10_000,
      cooldownMs: 5_000,
      successThreshold: 2,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in CLOSED state', () => {
    expect(registry.getState('anthropic').state).toBe('CLOSED')
  })

  it('allows requests in CLOSED state', () => {
    expect(registry.canRequest('anthropic')).toBe(true)
  })

  it('stays CLOSED if failures are below threshold', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    expect(registry.canRequest('anthropic')).toBe(true)
    expect(registry.getState('anthropic').state).toBe('CLOSED')
  })

  it('transitions to OPEN after threshold failures within window', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    expect(registry.getState('anthropic').state).toBe('OPEN')
    expect(registry.canRequest('anthropic')).toBe(false)
  })

  it('does not trip OPEN if failures are outside the window', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    vi.advanceTimersByTime(11_000) // exceed windowMs
    registry.recordFailure('anthropic')
    expect(registry.getState('anthropic').state).toBe('CLOSED')
  })

  it('transitions OPEN -> HALF_OPEN after cooldown', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    expect(registry.canRequest('anthropic')).toBe(false)

    vi.advanceTimersByTime(5_000) // cooldownMs
    expect(registry.canRequest('anthropic')).toBe(true)
    expect(registry.getState('anthropic').state).toBe('HALF_OPEN')
  })

  it('transitions HALF_OPEN -> CLOSED after consecutive successes', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    vi.advanceTimersByTime(5_000)
    registry.canRequest('anthropic') // trigger HALF_OPEN

    registry.recordSuccess('anthropic')
    expect(registry.getState('anthropic').state).toBe('HALF_OPEN')
    registry.recordSuccess('anthropic')
    expect(registry.getState('anthropic').state).toBe('CLOSED')
  })

  it('transitions HALF_OPEN -> OPEN on failure', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    vi.advanceTimersByTime(5_000)
    registry.canRequest('anthropic') // trigger HALF_OPEN

    registry.recordFailure('anthropic')
    expect(registry.getState('anthropic').state).toBe('OPEN')
  })

  it('tracks separate circuits per provider', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    expect(registry.getState('anthropic').state).toBe('OPEN')
    expect(registry.getState('openai').state).toBe('CLOSED')
  })

  it('reset clears circuit state', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    registry.reset('anthropic')
    expect(registry.getState('anthropic').state).toBe('CLOSED')
  })

  it('getAllStates returns all tracked providers', () => {
    registry.recordFailure('anthropic')
    registry.recordSuccess('openai')
    const states = registry.getAllStates()
    expect(states.size).toBe(2)
    expect(states.get('anthropic')?.failures).toBe(1)
  })
})
