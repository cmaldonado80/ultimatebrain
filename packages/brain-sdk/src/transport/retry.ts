/**
 * Auto-retry with exponential backoff.
 */

export interface RetryOptions {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  /** Jitter factor (0-1) */
  jitter: number
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  jitter: 0.1,
}

export class RetryPolicy {
  private options: RetryOptions

  constructor(options: Partial<RetryOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < this.options.maxRetries && this.isRetryable(lastError)) {
          await this.delay(attempt)
        }
      }
    }
    throw lastError!
  }

  private isRetryable(error: Error): boolean {
    const msg = error.message.toLowerCase()
    // Retry on network/transient errors, not on auth/validation
    if (msg.includes('401') || msg.includes('403') || msg.includes('400')) return false
    return true
  }

  private delay(attempt: number): Promise<void> {
    const base = Math.min(
      this.options.baseDelayMs * Math.pow(2, attempt),
      this.options.maxDelayMs
    )
    const jitter = base * this.options.jitter * Math.random()
    return new Promise((r) => setTimeout(r, base + jitter))
  }
}
