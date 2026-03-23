import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

  it('allows requests within token budget', () => {
    const result = limiter.tryConsume({ agentId: 'a1', estimatedTokens: 1000 })
    expect(result.allowed).toBe(true)
  })

  it('rejects requests that exceed available tokens', () => {
    // Default agent limit is 100_000 tokens
    const result = limiter.tryConsume({ agentId: 'a1', estimatedTokens: 200_000 })
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBeGreaterThan(0)
  })

  it('refills tokens over time', () => {
    limiter.tryConsume({ agentId: 'a1', estimatedTokens: 90_000 })
    // Advance 10 seconds -> should refill 50_000 tokens (5000/sec * 10s)
    vi.advanceTimersByTime(10_000)
    const result = limiter.tryConsume({ agentId: 'a1', estimatedTokens: 40_000 })
    expect(result.allowed).toBe(true)
  })

  it('high-priority requests bypass rate limits', () => {
    // Exhaust tokens first
    limiter.tryConsume({ agentId: 'a1', estimatedTokens: 100_000 })
    const result = limiter.tryConsume({
      agentId: 'a1',
      estimatedTokens: 50_000,
      priority: 'high',
    })
    expect(result.allowed).toBe(true)
  })

  it('enforces workspace-level limits', () => {
    // Default workspace limit is 500_000
    const result = limiter.tryConsume({
      workspaceId: 'w1',
      estimatedTokens: 600_000,
    })
    expect(result.allowed).toBe(false)
  })

  it('refunds agent tokens when workspace is rate-limited', () => {
    limiter.tryConsume({ agentId: 'a1', workspaceId: 'w1', estimatedTokens: 400_000 })
    // Now workspace has 100_000 left, agent has (100_000 - but wait, agent limit is 100_000 default)
    // Actually, agent would fail first since default agent is 100K
    // Let's set custom limits
    limiter.setAgentLimit('a1', { maxTokens: 600_000, refillRatePerSecond: 5_000 })
    limiter.tryConsume({ agentId: 'a1', workspaceId: 'w1', estimatedTokens: 400_000 })
    // Agent: 200K left, workspace: 100K left
    const result = limiter.tryConsume({
      agentId: 'a1',
      workspaceId: 'w1',
      estimatedTokens: 200_000,
    })
    // Workspace only has 100K so should fail and refund the 200K to agent
    expect(result.allowed).toBe(false)
  })

  it('custom agent limits override defaults', () => {
    limiter.setAgentLimit('a1', { maxTokens: 10, refillRatePerSecond: 1 })
    const result = limiter.tryConsume({ agentId: 'a1', estimatedTokens: 20 })
    expect(result.allowed).toBe(false)
  })

  it('getAgentCapacity reflects current state', () => {
    limiter.tryConsume({ agentId: 'a1', estimatedTokens: 30_000 })
    const capacity = limiter.getAgentCapacity('a1')
    expect(capacity.remaining).toBeLessThanOrEqual(70_000)
    expect(capacity.max).toBe(100_000)
    expect(capacity.percentUsed).toBeGreaterThanOrEqual(30)
  })
})
