/**
 * Token-bucket rate limiter for LLM calls.
 * Per-agent and per-workspace limits with priority lanes.
 */

interface Bucket {
  tokens: number
  lastRefill: number
  maxTokens: number
  refillRate: number // tokens per second
}

export interface RateLimitConfig {
  /** Max tokens in bucket */
  maxTokens: number
  /** Tokens added per second */
  refillRatePerSecond: number
}

const DEFAULT_AGENT_LIMIT: RateLimitConfig = {
  maxTokens: 100_000,
  refillRatePerSecond: 5_000, // ~300K tokens/minute
}

const DEFAULT_WORKSPACE_LIMIT: RateLimitConfig = {
  maxTokens: 500_000,
  refillRatePerSecond: 20_000,
}

export class RateLimiter {
  private agentBuckets = new Map<string, Bucket>()
  private workspaceBuckets = new Map<string, Bucket>()
  private agentConfigs = new Map<string, RateLimitConfig>()
  private workspaceConfigs = new Map<string, RateLimitConfig>()

  /** Set custom rate limit for an agent */
  setAgentLimit(agentId: string, config: Partial<RateLimitConfig>): void {
    this.agentConfigs.set(agentId, { ...DEFAULT_AGENT_LIMIT, ...config })
    // Reset bucket with new config
    this.agentBuckets.delete(agentId)
  }

  /** Set custom rate limit for a workspace */
  setWorkspaceLimit(workspaceId: string, config: Partial<RateLimitConfig>): void {
    this.workspaceConfigs.set(workspaceId, { ...DEFAULT_WORKSPACE_LIMIT, ...config })
    this.workspaceBuckets.delete(workspaceId)
  }

  private getBucket(
    buckets: Map<string, Bucket>,
    id: string,
    config: RateLimitConfig,
  ): Bucket {
    let bucket = buckets.get(id)
    if (!bucket) {
      bucket = {
        tokens: config.maxTokens,
        lastRefill: Date.now(),
        maxTokens: config.maxTokens,
        refillRate: config.refillRatePerSecond,
      }
      buckets.set(id, bucket)
    }
    return bucket
  }

  private refill(bucket: Bucket): void {
    const now = Date.now()
    const elapsed = (now - bucket.lastRefill) / 1000
    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + elapsed * bucket.refillRate)
    bucket.lastRefill = now
  }

  /**
   * Try to consume tokens. Returns { allowed, retryAfterMs }.
   * Checks agent limit first, then workspace limit if provided.
   */
  tryConsume(params: {
    agentId?: string
    workspaceId?: string
    estimatedTokens: number
    priority?: 'normal' | 'high'
  }): { allowed: boolean; retryAfterMs?: number } {
    const { agentId, workspaceId, estimatedTokens, priority = 'normal' } = params

    // High-priority requests (approval-gated tickets) bypass rate limits
    if (priority === 'high') {
      return { allowed: true }
    }

    // Check agent-level limit
    if (agentId) {
      const config = this.agentConfigs.get(agentId) ?? DEFAULT_AGENT_LIMIT
      const bucket = this.getBucket(this.agentBuckets, agentId, config)
      this.refill(bucket)

      if (bucket.tokens < estimatedTokens) {
        const deficit = estimatedTokens - bucket.tokens
        const retryAfterMs = Math.ceil((deficit / bucket.refillRate) * 1000)
        return { allowed: false, retryAfterMs }
      }
      bucket.tokens -= estimatedTokens
    }

    // Check workspace-level aggregate limit
    if (workspaceId) {
      const config = this.workspaceConfigs.get(workspaceId) ?? DEFAULT_WORKSPACE_LIMIT
      const bucket = this.getBucket(this.workspaceBuckets, workspaceId, config)
      this.refill(bucket)

      if (bucket.tokens < estimatedTokens) {
        // Refund agent tokens if workspace is rate limited
        if (agentId) {
          const agentConfig = this.agentConfigs.get(agentId) ?? DEFAULT_AGENT_LIMIT
          const agentBucket = this.getBucket(this.agentBuckets, agentId, agentConfig)
          agentBucket.tokens = Math.min(agentBucket.maxTokens, agentBucket.tokens + estimatedTokens)
        }
        const deficit = estimatedTokens - bucket.tokens
        const retryAfterMs = Math.ceil((deficit / bucket.refillRate) * 1000)
        return { allowed: false, retryAfterMs }
      }
      bucket.tokens -= estimatedTokens
    }

    return { allowed: true }
  }

  /** Get remaining capacity for an agent (for dashboard display) */
  getAgentCapacity(agentId: string): { remaining: number; max: number; percentUsed: number } {
    const config = this.agentConfigs.get(agentId) ?? DEFAULT_AGENT_LIMIT
    const bucket = this.getBucket(this.agentBuckets, agentId, config)
    this.refill(bucket)
    return {
      remaining: Math.floor(bucket.tokens),
      max: bucket.maxTokens,
      percentUsed: Math.round(((bucket.maxTokens - bucket.tokens) / bucket.maxTokens) * 100),
    }
  }
}
