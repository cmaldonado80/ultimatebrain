/**
 * Memory Engine — store, search, retrieve
 */

import type { RetryPolicy } from '../transport/retry'

export interface StoreOptions {
  key: string
  content: string
  tier: 'working' | 'episodic' | 'archival'
  metadata?: Record<string, unknown>
  ttl?: number
}

export interface SearchOptions {
  query: string
  limit?: number
  tier?: 'working' | 'episodic' | 'archival'
  filters?: Record<string, unknown>
}

export interface MemoryResult {
  key: string
  content: string
  tier: string
  score: number
  metadata?: Record<string, unknown>
  createdAt: string
}

export class MemoryEngine {
  constructor(
    private fetch: (path: string, body: unknown) => Promise<unknown>,
    private retry: RetryPolicy
  ) {}

  async store(options: StoreOptions): Promise<{ key: string; stored: boolean }> {
    return this.retry.execute(async () => {
      return this.fetch('/memory/store', options) as Promise<{ key: string; stored: boolean }>
    })
  }

  async search(options: SearchOptions): Promise<MemoryResult[]> {
    return this.retry.execute(async () => {
      return this.fetch('/memory/search', options) as Promise<MemoryResult[]>
    })
  }

  async get(key: string): Promise<MemoryResult | null> {
    return this.retry.execute(async () => {
      return this.fetch('/memory/get', { key }) as Promise<MemoryResult | null>
    })
  }

  async delete(key: string): Promise<void> {
    await this.retry.execute(async () => {
      await this.fetch('/memory/delete', { key })
    })
  }
}
