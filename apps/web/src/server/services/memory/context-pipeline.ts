/**
 * Context Engineering Pipeline
 *
 * Multi-source gather → evaluate relevance → filter → synthesize.
 * The key innovation: evaluator-as-quality-gate between retrieval and generation.
 *
 * Quick mode: skips evaluation (raw retrieval).
 * Autonomous/Deep Work: full pipeline with relevance scoring and fallback.
 */

import type { Database } from '@solarc/db'

import { GatewayRouter } from '../gateway'
import type { EmbedFunction } from './memory-service'
import { MemoryService } from './memory-service'
import { RecallFlow } from './recall-flow'

export interface ContextSource {
  name: string
  type: 'rag' | 'memory' | 'web' | 'tools'
  content: string
  /** Raw relevance before evaluation */
  rawScore?: number
}

export interface EvaluatedSource extends ContextSource {
  /** LLM-scored relevance (0-1) */
  relevanceScore: number
  /** Whether it passed the threshold */
  included: boolean
}

export interface PipelineResult {
  query: string
  sources: EvaluatedSource[]
  includedSources: EvaluatedSource[]
  droppedSources: EvaluatedSource[]
  synthesizedContext: string
  /** Whether fallback (web search) was used */
  usedFallback: boolean
  pipelineMs: number
}

export interface PipelineOptions {
  /** Minimum relevance score to include (default: 0.5) */
  threshold?: number
  /** Whether to run full evaluation or skip (quick mode) */
  evaluate?: boolean
  /** Whether to fall back to web search if results are poor */
  enableFallback?: boolean
  /** Max sources to include */
  maxSources?: number
  /** Scope memory searches to a specific workspace */
  workspaceId?: string
}

export class ContextPipeline {
  private defaultThreshold = 0.5
  private gateway: GatewayRouter | null = null
  private memoryService: MemoryService | null = null
  private recallFlow: RecallFlow | null = null

  constructor(opts?: { db?: Database; embedFn?: EmbedFunction }) {
    if (opts?.db) {
      this.gateway = new GatewayRouter(opts.db)
      this.memoryService = new MemoryService(opts.db)
      if (opts.embedFn) {
        this.memoryService.setEmbedFunction(opts.embedFn)
        this.recallFlow = new RecallFlow(opts.db, opts.embedFn)
      }
    }
  }

  /**
   * Run the full context pipeline for a query.
   */
  async run(query: string, options: PipelineOptions = {}): Promise<PipelineResult> {
    const start = Date.now()
    const {
      threshold = this.defaultThreshold,
      evaluate = true,
      enableFallback = true,
      maxSources = 5,
    } = options

    // Step 1: GATHER — parallel multi-source retrieval
    const rawSources = await this.gather(query, options.workspaceId)

    // Step 2: EVALUATE — LLM scores each source for relevance
    let evaluated: EvaluatedSource[]
    if (evaluate) {
      evaluated = await this.evaluate(query, rawSources, threshold)
    } else {
      // Quick mode: accept all sources with default score
      evaluated = rawSources.map((s) => ({
        ...s,
        relevanceScore: 0.7,
        included: true,
      }))
    }

    const included = evaluated.filter((s) => s.included)
    const dropped = evaluated.filter((s) => !s.included)

    // Step 3: FALLBACK — if too few quality sources, try web search
    let usedFallback = false
    if (enableFallback && included.length < 2 && evaluate) {
      const webResults = await this.webSearchFallback(query)
      const evaluatedWeb = await this.evaluate(query, webResults, threshold)
      const goodWeb = evaluatedWeb.filter((s) => s.included)

      if (goodWeb.length > 0) {
        included.push(...goodWeb)
        usedFallback = true
      }
    }

    // Step 4: SYNTHESIZE — combine high-quality sources into context
    const topSources = included
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxSources)

    const synthesizedContext = this.synthesize(query, topSources)

    return {
      query,
      sources: evaluated,
      includedSources: topSources,
      droppedSources: dropped,
      synthesizedContext,
      usedFallback,
      pipelineMs: Date.now() - start,
    }
  }

  // ── Stage 1: Gather ───────────────────────────────────────────────────

  private async gather(query: string, workspaceId?: string): Promise<ContextSource[]> {
    // Run all retrievals in parallel
    const [ragResults, memoryResults, toolResults] = await Promise.all([
      this.gatherFromRAG(query, workspaceId),
      this.gatherFromMemory(query, workspaceId),
      this.gatherFromTools(query),
    ])

    return [...ragResults, ...memoryResults, ...toolResults]
  }

  private async gatherFromRAG(query: string, workspaceId?: string): Promise<ContextSource[]> {
    // Use MemoryService vector search for document context
    try {
      if (this.memoryService) {
        const results = await this.memoryService.search(query, {
          tier: 'core',
          limit: 5,
          ...(workspaceId ? { workspaceId } : {}),
        })
        return results.map((r) => ({
          name: `rag-${r.id}`,
          type: 'rag' as const,
          content: r.content,
          rawScore: r.score,
        }))
      }
    } catch (err) {
      console.error('[ContextPipeline] RAG search failed, returning empty:', err)
    }
    return []
  }

  private async gatherFromMemory(query: string, workspaceId?: string): Promise<ContextSource[]> {
    // Tiered memory search via RecallFlow (core → recall → archival)
    try {
      if (this.recallFlow) {
        const tieredResult = await this.recallFlow.search({
          query,
          ...(workspaceId ? { workspaceId } : {}),
        })
        return tieredResult.results.map((r) => ({
          name: `memory-${r.id}`,
          type: 'memory' as const,
          content: r.content,
          rawScore: r.score,
        }))
      }
    } catch (err) {
      console.error('[ContextPipeline] Memory recall failed, returning empty:', err)
    }
    return []
  }

  private async gatherFromTools(_query: string): Promise<ContextSource[]> {
    // Tool context is populated by the caller (e.g., the agent orchestration layer)
    // at the gather() level or injected into the pipeline result after the fact.
    // This method intentionally returns empty — tool outputs are not stored in a
    // searchable index but are instead passed directly from the tool execution cache.
    return []
  }

  // ── Stage 2: Evaluate ─────────────────────────────────────────────────

  private async evaluate(
    query: string,
    sources: ContextSource[],
    threshold: number,
  ): Promise<EvaluatedSource[]> {
    // Try LLM-based reranking if gateway is available
    if (this.gateway && sources.length > 0) {
      try {
        const sourceSummaries = sources
          .map((s, i) => `[${i}] (${s.type}/${s.name}) ${s.content.slice(0, 200)}`)
          .join('\n')

        const result = await this.gateway.chat({
          model: 'claude-haiku-4-5',
          messages: [
            {
              role: 'system',
              content:
                'You are a relevance evaluator. Rate each source for relevance to the query. ' +
                'Respond with one line per source in the format: INDEX SCORE (0.0-1.0). Nothing else.',
            },
            {
              role: 'user',
              content: `Query: "${query}"\n\nSources:\n${sourceSummaries}`,
            },
          ],
        })

        const lines = result.content.trim().split('\n')
        return sources.map((source, i) => {
          const line = lines[i]
          const scoreMatch = line?.match(/(\d+)\s+([\d.]+)/)
          const relevanceScore = scoreMatch ? parseFloat(scoreMatch[2]) : (source.rawScore ?? 0.5)
          return {
            ...source,
            relevanceScore,
            included: relevanceScore >= threshold,
          }
        })
      } catch (err) {
        console.error(
          '[ContextPipeline] LLM reranking failed, falling back to keyword scoring:',
          err,
        )
      }
    }

    // Fallback: keyword overlap scoring (similar to memory-service.keywordSearch)
    const queryTokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)

    return sources.map((source) => {
      if (queryTokens.length === 0) {
        const fallbackScore = source.rawScore ?? 0.5
        return { ...source, relevanceScore: fallbackScore, included: fallbackScore >= threshold }
      }

      const contentLower = source.content.toLowerCase()
      const matchCount = queryTokens.filter((token) => contentLower.includes(token)).length
      const keywordScore = matchCount / queryTokens.length
      // Blend keyword score with raw score if available
      const relevanceScore =
        source.rawScore != null ? source.rawScore * 0.6 + keywordScore * 0.4 : keywordScore

      return {
        ...source,
        relevanceScore,
        included: relevanceScore >= threshold,
      }
    })
  }

  // ── Stage 3: Fallback ─────────────────────────────────────────────────

  private async webSearchFallback(_query: string): Promise<ContextSource[]> {
    // Web search requires MCP integration (e.g., Brave Search or DuckDuckGo MCP server).
    // This cannot be implemented as a direct gateway call — it needs an MCP tool invocation.
    // Wire this when MCP tool execution is available in the pipeline.
    console.warn(
      '[ContextPipeline] Web search fallback requires MCP integration — returning empty results',
    )
    return []
  }

  // ── Stage 4: Synthesize ───────────────────────────────────────────────

  private synthesize(query: string, sources: EvaluatedSource[]): string {
    if (sources.length === 0) return ''

    const parts = sources.map(
      (s) => `[${s.type}/${s.name}, relevance: ${s.relevanceScore.toFixed(2)}]\n${s.content}`,
    )

    return `Context for: "${query}"\n\n${parts.join('\n\n---\n\n')}`
  }
}
