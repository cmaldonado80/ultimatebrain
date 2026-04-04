import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RateLimiter } from '../rate-limiter'

describe('RateLimiter', () => {
  let limiter: RateLimiter

  beforeEach(() => {
    vi.useFakeTimers()
    limiter = new RateLimiter()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // 1. Allows requests when under limit
  it('allows requests when under limit', () => {
    const result = limiter.tryConsume({ agentId: 'a1', estimatedTokens: 1_000 })
    expect(result.allowed).toBe(true)
    expect(result.retryAfterMs).toBeUndefined()
  })

  // 2. Blocks requests when tokens exhausted, returns retryAfterMs
  it('blocks requests when tokens exhausted and returns retryAfterMs', () => {
    // Consume all 100K default agent tokens
    limiter.tryConsume({ agentId: 'a1', estimatedTokens: 100_000 })

    const result = limiter.tryConsume({ agentId: 'a1', estimatedTokens: 10_000 })
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBeGreaterThan(0)
    // 10_000 deficit / 5_000 per sec = 2 seconds = 2000ms
    expect(result.retryAfterMs).toBe(2_000)
  })

  // 3. Tokens refill over time
  it('tokens refill over time', () => {
    // Consume 90K of 100K
    limiter.tryConsume({ agentId: 'a1', estimatedTokens: 90_000 })
    // 10K remaining; need 40K more -> deficit of 30K

    // Advance 10 seconds -> refills 50K tokens (5000/sec * 10s)
    // Available: 10K + 50K = 60K, enough for 40K
    vi.advanceTimersByTime(10_000)
    const result = limiter.tryConsume({ agentId: 'a1', estimatedTokens: 40_000 })
    expect(result.allowed).toBe(true)
  })

  // 4. Priority 'high' bypasses rate limits entirely
  it('high priority bypasses rate limits entirely', () => {
    // Exhaust all agent tokens
    limiter.tryConsume({ agentId: 'a1', estimatedTokens: 100_000 })

    // Normal request fails
    const normalResult = limiter.tryConsume({ agentId: 'a1', estimatedTokens: 50_000 })
    expect(normalResult.allowed).toBe(false)

    // High-priority request succeeds
    const highResult = limiter.tryConsume({
      agentId: 'a1',
      estimatedTokens: 50_000,
      priority: 'high',
    })
    expect(highResult.allowed).toBe(true)
    expect(highResult.retryAfterMs).toBeUndefined()
  })

  // 5. Agent-level limiting independent of workspace
  it('enforces agent-level limits independent of workspace', () => {
    // Agent a1 exhausts its own limit
    limiter.tryConsume({ agentId: 'a1', estimatedTokens: 100_000 })

    // Agent a2 is unaffected — separate bucket
    const result = limiter.tryConsume({ agentId: 'a2', estimatedTokens: 50_000 })
    expect(result.allowed).toBe(true)

    // Agent a1 is still blocked
    const blocked = limiter.tryConsume({ agentId: 'a1', estimatedTokens: 1_000 })
    expect(blocked.allowed).toBe(false)
  })

  // 6. Workspace-level limiting refunds agent tokens on workspace exhaustion
  it('refunds agent tokens when workspace limit is exceeded', () => {
    // Give agent a large limit so it doesn't block first
    limiter.setAgentLimit('a1', { maxTokens: 600_000, refillRatePerSecond: 5_000 })

    // Consume 400K — agent has 200K left, workspace has 100K left
    limiter.tryConsume({ agentId: 'a1', workspaceId: 'w1', estimatedTokens: 400_000 })

    // Try 200K more — workspace only has 100K, should fail
    const result = limiter.tryConsume({
      agentId: 'a1',
      workspaceId: 'w1',
      estimatedTokens: 200_000,
    })
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBeGreaterThan(0)

    // Agent tokens should have been refunded — agent capacity should be ~200K still
    const agentCap = limiter.getAgentCapacity('a1')
    expect(agentCap.remaining).toBeGreaterThanOrEqual(199_000)
  })

  // 7. setAgentLimit() changes the config for an agent
  it('setAgentLimit() changes the config for an agent', () => {
    limiter.setAgentLimit('a1', { maxTokens: 50, refillRatePerSecond: 1 })

    const allowed = limiter.tryConsume({ agentId: 'a1', estimatedTokens: 50 })
    expect(allowed.allowed).toBe(true)

    const blocked = limiter.tryConsume({ agentId: 'a1', estimatedTokens: 10 })
    expect(blocked.allowed).toBe(false)

    // Verify capacity reflects custom config
    const cap = limiter.getAgentCapacity('a1')
    expect(cap.max).toBe(50)
  })

  // 8. setWorkspaceLimit() changes workspace config
  it('setWorkspaceLimit() changes workspace config', () => {
    limiter.setWorkspaceLimit('w1', { maxTokens: 200, refillRatePerSecond: 10 })

    const allowed = limiter.tryConsume({ workspaceId: 'w1', estimatedTokens: 200 })
    expect(allowed.allowed).toBe(true)

    const blocked = limiter.tryConsume({ workspaceId: 'w1', estimatedTokens: 50 })
    expect(blocked.allowed).toBe(false)

    // Verify capacity reflects custom config
    const cap = limiter.getWorkspaceCapacity('w1')
    expect(cap.max).toBe(200)
  })

  // 9. getAgentCapacity() returns remaining/max/percentUsed
  it('getAgentCapacity() returns remaining, max, and percentUsed', () => {
    limiter.tryConsume({ agentId: 'a1', estimatedTokens: 30_000 })

    const capacity = limiter.getAgentCapacity('a1')
    expect(capacity.remaining).toBe(70_000)
    expect(capacity.max).toBe(100_000)
    expect(capacity.percentUsed).toBe(30)
  })

  // 10. getWorkspaceCapacity() returns remaining/max/percentUsed
  it('getWorkspaceCapacity() returns remaining, max, and percentUsed', () => {
    limiter.tryConsume({ workspaceId: 'w1', estimatedTokens: 100_000 })

    const capacity = limiter.getWorkspaceCapacity('w1')
    expect(capacity.remaining).toBe(400_000)
    expect(capacity.max).toBe(500_000)
    expect(capacity.percentUsed).toBe(20)
  })
})
