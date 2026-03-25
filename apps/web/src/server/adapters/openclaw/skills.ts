/**
 * OpenClaw Skills Adapter — Live skill discovery and invocation.
 *
 * Replaces hardcoded skill lists with dynamic discovery from the OpenClaw daemon.
 * Skills are cached locally and refreshed on reconnect + every 5 minutes.
 */
import type { OpenClawClient } from './client'

// ── Types ────────────────────────────────────────────────────────────

export interface OpenClawSkill {
  name: string
  description: string
  params?: Record<string, { type: string; required?: boolean; description?: string }>
  permissions?: string[]
  category?: string
}

export interface SkillInvocationResult {
  status: 'completed' | 'failed'
  output?: unknown
  error?: string
  durationMs?: number
}

// ── Adapter ──────────────────────────────────────────────────────────

export class OpenClawSkills {
  private cache: OpenClawSkill[] = []
  private lastRefresh: Date | null = null
  private readonly CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

  constructor(private client: OpenClawClient) {}

  /**
   * Discover all available skills from the OpenClaw daemon.
   * Returns cached results if within TTL, otherwise queries the daemon.
   */
  async discoverSkills(forceRefresh = false): Promise<OpenClawSkill[]> {
    if (
      !forceRefresh &&
      this.cache.length > 0 &&
      this.lastRefresh &&
      Date.now() - this.lastRefresh.getTime() < this.CACHE_TTL_MS
    ) {
      return this.cache
    }

    if (!this.client.isConnected()) {
      return this.cache // return stale cache when disconnected
    }

    return new Promise((resolve) => {
      const requestId = crypto.randomUUID()
      const timeout = setTimeout(() => {
        this.client.removeAllListeners(`response:${requestId}`)
        console.warn('[OpenClaw Skills] Discovery timed out, returning cached')
        resolve(this.cache)
      }, 15_000)

      this.client.once(`response:${requestId}`, (data: { skills: OpenClawSkill[] }) => {
        clearTimeout(timeout)
        this.cache = data.skills
        this.lastRefresh = new Date()
        resolve(this.cache)
      })

      this.client.once(`error:${requestId}`, () => {
        clearTimeout(timeout)
        resolve(this.cache)
      })

      try {
        this.client.send({ type: 'skills.list', requestId })
      } catch {
        clearTimeout(timeout)
        resolve(this.cache)
      }
    })
  }

  /**
   * Invoke a skill on the OpenClaw daemon.
   */
  async invokeSkill(
    skill: string,
    params: Record<string, unknown>,
  ): Promise<SkillInvocationResult> {
    if (!this.client.isConnected()) {
      throw new Error('OpenClaw daemon not connected')
    }

    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID()
      const timeout = setTimeout(() => {
        this.client.removeAllListeners(`response:${requestId}`)
        reject(new Error(`Skill invocation timed out after 120s: ${skill}`))
      }, 120_000)

      this.client.once(`response:${requestId}`, (data: SkillInvocationResult) => {
        clearTimeout(timeout)
        resolve(data)
      })

      this.client.once(`error:${requestId}`, (err: { message: string }) => {
        clearTimeout(timeout)
        reject(new Error(`Skill invocation failed: ${err.message}`))
      })

      this.client.send({
        type: 'skills.invoke',
        requestId,
        skill,
        params,
      })
    })
  }

  /** Get the cached skill catalog (no network call). */
  getCachedSkills(): OpenClawSkill[] {
    return this.cache
  }

  /** Get the last refresh timestamp. */
  getLastRefresh(): Date | null {
    return this.lastRefresh
  }
}
