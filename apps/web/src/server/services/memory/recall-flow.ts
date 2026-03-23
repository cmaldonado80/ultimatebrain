/**
 * Recall Flow — Tiered Memory Search
 *
 * Parallel search across all three memory tiers (core, recall, archival).
 * Confidence-based early exit: if core memory answers with confidence > 0.9,
 * skip recall and archival entirely.
 *
 * Results are merged, deduplicated, re-ranked, and injected into agent context.
 */

import type { Database } from '@solarc/db'
import { MemoryService, type SearchResult, type EmbedFunction } from './memory-service'

export interface RecallQuery {
  query: string
  agentId?: string
  workspaceId?: string
  /** Max results to inject into context */
  topK?: number
  /** Confidence threshold to skip lower tiers (default: 0.9) */
  coreConfidenceThreshold?: number
  /** Include archival tier (slower, default: true) */
  includeArchival?: boolean
}

export interface TieredSearchResult {
  results: SearchResult[]
  tiersSearched: ('core' | 'recall' | 'archival')[]
  earlyExitAt: 'core' | 'recall' | null
  totalCandidates: number
  deduplicated: number
  injectedTopK: number
  durationMs: number
}

export interface ContextInjection {
  contextBlock: string
  memoryIds: string[]
  tiersUsed: string[]
}

const DEFAULT_TOP_K = 5
const DEFAULT_CORE_THRESHOLD = 0.9

export class RecallFlow {
  private memoryService: MemoryService

  constructor(
    _db: Database,
    _embed: EmbedFunction
  ) {
    this.memoryService = new MemoryService(_db)
    this.memoryService.setEmbedFunction(_embed)
  }

  /**
   * Main entry point — parallel tiered search with confidence-based routing.
   */
  async search(query: RecallQuery): Promise<TieredSearchResult> {
    const start = Date.now()
    const topK = query.topK ?? DEFAULT_TOP_K
    const coreThreshold = query.coreConfidenceThreshold ?? DEFAULT_CORE_THRESHOLD
    const includeArchival = query.includeArchival ?? true

    const tiersSearched: ('core' | 'recall' | 'archival')[] = []
    let earlyExitAt: 'core' | 'recall' | null = null
    let allResults: SearchResult[] = []

    // Step 1: Search core memory first (fastest, highest quality)
    const coreResults = await this.memoryService.search(query.query, {
      tier: 'core',
      workspaceId: query.workspaceId,
      limit: topK * 2, // over-fetch for dedup
    })
    tiersSearched.push('core')

    // Confidence-based early exit: core answered well enough
    const topCoreScore = coreResults[0]?.score ?? 0
    if (topCoreScore >= coreThreshold) {
      earlyExitAt = 'core'
      allResults = coreResults
    } else {
      // Step 2: Fan-out to recall + archival in parallel
      const parallelSearches: Promise<SearchResult[]>[] = [
        this.memoryService.search(query.query, {
          tier: 'recall',
          workspaceId: query.workspaceId,
          limit: topK * 2,
        }),
      ]

      if (includeArchival) {
        parallelSearches.push(
          this.memoryService.search(query.query, {
            tier: 'archival',
            workspaceId: query.workspaceId,
            limit: topK * 2,
          })
        )
      }

      const [recallResults, archivalResults] = await Promise.all(parallelSearches)

      tiersSearched.push('recall')
      if (includeArchival) tiersSearched.push('archival')

      // Check if recall answered well enough (skip archival next time)
      const topRecallScore = recallResults[0]?.score ?? 0
      if (topRecallScore >= coreThreshold && !includeArchival) {
        earlyExitAt = 'recall'
      }

      allResults = [...coreResults, ...recallResults, ...(archivalResults ?? [])]
    }

    const totalCandidates = allResults.length

    // Step 3: Deduplicate by content similarity (same key = same memory)
    const deduped = this.deduplicate(allResults)
    const deduplicated = totalCandidates - deduped.length

    // Step 4: Re-rank by score and take top-k
    const ranked = deduped.sort((a, b) => b.score - a.score).slice(0, topK)

    return {
      results: ranked,
      tiersSearched,
      earlyExitAt,
      totalCandidates,
      deduplicated,
      injectedTopK: ranked.length,
      durationMs: Date.now() - start,
    }
  }

  /**
   * Search and format results as a context block for injection into agent prompts.
   */
  async searchAndInject(query: RecallQuery): Promise<ContextInjection> {
    const result = await this.search(query)

    if (result.results.length === 0) {
      return {
        contextBlock: '',
        memoryIds: [],
        tiersUsed: result.tiersSearched,
      }
    }

    const lines = result.results.map((r, i) => {
      const tierTag = `[${r.tier.toUpperCase()}]`
      const scoreTag = `(${(r.score * 100).toFixed(0)}%)`
      return `${i + 1}. ${tierTag} ${scoreTag} ${r.content}`
    })

    const contextBlock = [
      `<memory_context tiers="${result.tiersSearched.join(',')}" results="${result.results.length}">`,
      ...lines,
      '</memory_context>',
    ].join('\n')

    return {
      contextBlock,
      memoryIds: result.results.map((r) => r.id),
      tiersUsed: result.tiersSearched,
    }
  }

  /**
   * Promote recalled memories that were useful (accessed in context injection).
   * Call this after the agent has completed its turn.
   */
  async promoteUsedMemories(memoryIds: string[]): Promise<void> {
    for (const id of memoryIds) {
      try {
        await this.memoryService.nominateForPromotion(id)
      } catch (err) {
        console.warn(`[RecallFlow] Best-effort promotion failed for memory ${id}:`, err)
      }
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private deduplicate(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>()
    return results.filter((r) => {
      const key = r.key
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
}
