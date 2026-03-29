/**
 * Memory Engine — store, search, retrieve
 *
 * Tiers match Brain's memory system: core / recall / archival
 */

import type { RetryPolicy } from '../transport/retry'

export type MemoryTier = 'core' | 'recall' | 'archival'

export interface StoreOptions {
  key: string
  content: string
  tier?: MemoryTier
  workspaceId?: string
}

export interface SearchOptions {
  query: string
  limit?: number
  tier?: MemoryTier
}

export interface MemoryResult {
  key: string
  content: string
  tier: string
  score: number
  createdAt: string
}

export class MemoryEngine {
  constructor(
    private fetch: (path: string, body: unknown) => Promise<unknown>,
    private retry: RetryPolicy,
  ) {}

  async store(options: StoreOptions): Promise<{ stored: boolean; id?: string }> {
    return this.retry.execute(async () => {
      return this.fetch('/memory/store', options) as Promise<{ stored: boolean; id?: string }>
    })
  }

  async search(options: SearchOptions): Promise<MemoryResult[]> {
    return this.retry.execute(async () => {
      const response = (await this.fetch('/memory/search', options)) as {
        results: MemoryResult[]
      }
      return response.results ?? []
    })
  }
}
