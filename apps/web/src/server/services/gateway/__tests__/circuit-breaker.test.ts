import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

  // 1. Starts in CLOSED state for new providers
  it('starts in CLOSED state for new providers', () => {
    expect(registry.getState('anthropic').state).toBe('CLOSED')
    expect(registry.getState('anthropic').failures).toBe(0)
    expect(registry.getState('openai').state).toBe('CLOSED')
  })

  // 2. CLOSED -> OPEN after threshold failures within window
  it('transitions CLOSED -> OPEN after threshold failures within window', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    expect(registry.getState('anthropic').state).toBe('CLOSED')

    registry.recordFailure('anthropic')
    expect(registry.getState('anthropic').state).toBe('OPEN')
    expect(registry.getState('anthropic').failures).toBe(3)
  })

  // 3. OPEN: canRequest() returns false
  it('returns false from canRequest() when circuit is OPEN', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    expect(registry.getState('anthropic').state).toBe('OPEN')

    expect(registry.canRequest('anthropic')).toBe(false)
  })

  // 4. OPEN -> HALF_OPEN after cooldown period elapsed
  it('transitions OPEN -> HALF_OPEN after cooldown period elapsed', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    expect(registry.canRequest('anthropic')).toBe(false)

    // Advance just under cooldown — still OPEN
    vi.advanceTimersByTime(4_999)
    expect(registry.canRequest('anthropic')).toBe(false)

    // Advance past cooldown
    vi.advanceTimersByTime(1)
    expect(registry.canRequest('anthropic')).toBe(true)
    expect(registry.getState('anthropic').state).toBe('HALF_OPEN')
  })

  // 5. HALF_OPEN allows probe request (canRequest returns true)
  it('allows probe request in HALF_OPEN state', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')

    vi.advanceTimersByTime(5_000)
    // First call transitions to HALF_OPEN and returns true
    expect(registry.canRequest('anthropic')).toBe(true)
    // Subsequent calls in HALF_OPEN also return true
    expect(registry.canRequest('anthropic')).toBe(true)
  })

  // 6. HALF_OPEN -> CLOSED after successThreshold consecutive successes
  it('transitions HALF_OPEN -> CLOSED after successThreshold consecutive successes', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    vi.advanceTimersByTime(5_000)
    registry.canRequest('anthropic') // trigger HALF_OPEN

    registry.recordSuccess('anthropic')
    expect(registry.getState('anthropic').state).toBe('HALF_OPEN')

    registry.recordSuccess('anthropic')
    expect(registry.getState('anthropic').state).toBe('CLOSED')
    expect(registry.getState('anthropic').failures).toBe(0)
    expect(registry.canRequest('anthropic')).toBe(true)
  })

  // 7. HALF_OPEN -> OPEN on probe failure (immediate)
  it('transitions HALF_OPEN -> OPEN immediately on probe failure', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    vi.advanceTimersByTime(5_000)
    registry.canRequest('anthropic') // trigger HALF_OPEN
    expect(registry.getState('anthropic').state).toBe('HALF_OPEN')

    registry.recordFailure('anthropic')
    expect(registry.getState('anthropic').state).toBe('OPEN')
    expect(registry.canRequest('anthropic')).toBe(false)
  })

  // 8. recordSuccess() in CLOSED state: no state change
  it('recordSuccess() in CLOSED state does not change state', () => {
    registry.recordSuccess('anthropic')
    registry.recordSuccess('anthropic')
    registry.recordSuccess('anthropic')
    expect(registry.getState('anthropic').state).toBe('CLOSED')
    expect(registry.canRequest('anthropic')).toBe(true)
  })

  // 9. getAllStates() returns map of all provider states
  it('getAllStates() returns map of all tracked provider states', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    registry.recordSuccess('openai')
    registry.recordFailure('google')

    const states = registry.getAllStates()
    expect(states.size).toBe(3)
    expect(states.get('anthropic')).toEqual({ state: 'OPEN', failures: 3 })
    expect(states.get('openai')).toEqual({ state: 'CLOSED', failures: 0 })
    expect(states.get('google')).toEqual({ state: 'CLOSED', failures: 1 })
  })

  // 10. reset() clears provider state back to CLOSED
  it('reset() clears provider state back to CLOSED', () => {
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    registry.recordFailure('anthropic')
    expect(registry.getState('anthropic').state).toBe('OPEN')

    registry.reset('anthropic')
    expect(registry.getState('anthropic').state).toBe('CLOSED')
    expect(registry.getState('anthropic').failures).toBe(0)
    expect(registry.canRequest('anthropic')).toBe(true)

    // Other providers unaffected
    registry.recordFailure('openai')
    registry.reset('anthropic')
    expect(registry.getState('openai').failures).toBe(1)
  })
})
