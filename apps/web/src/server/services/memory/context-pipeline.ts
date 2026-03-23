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
import { MemoryService } from './memory-service'
import { RecallFlow, type RecallQuery } from './recall-flow'
import type { EmbedFunction } from './memory-service'

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
    const rawSources = await this.gather(query)

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

  private async gather(query: string): Promise<ContextSource[]> {
    // Run all retrievals in parallel
    const [ragResults, memoryResults, toolResults] = await Promise.all([
      this.gatherFromRAG(query),
      this.gatherFromMemory(query),
      this.gatherFromTools(query),
    ])

    return [...ragResults, ...memoryResults, ...toolResults]
  }

  private async gatherFromRAG(query: string): Promise<ContextSource[]> {
    // Use MemoryService vector search for document context
    try {
      if (this.memoryService) {
        const results = await this.memoryService.search(query, { tier: 'core', limit: 5 })
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

  private async gatherFromMemory(query: string): Promise<ContextSource[]> {
    // Stub — real impl: tiered memory search (working → episodic → archival)
    return [
      {
        name: 'memory-recall',
        type: 'memory',
        content: `Memory recall for: "${query.slice(0, 50)}"`,
        rawScore: 0.92,
      },
    ]
  }

  private async gatherFromTools(query: string): Promise<ContextSource[]> {
    // Stub — real impl: tool output cache, recent tool results
    return [
      {
        name: 'tool-output',
        type: 'tools',
        content: `Recent tool output relevant to: "${query.slice(0, 50)}"`,
        rawScore: 0.71,
      },
    ]
  }

  // ── Stage 2: Evaluate ─────────────────────────────────────────────────

  private async evaluate(
    query: string,
    sources: ContextSource[],
    threshold: number
  ): Promise<EvaluatedSource[]> {
    // Stub — real impl: send each source + query to fast LLM (Haiku)
    // Prompt: "Rate the relevance of this source to the query on a scale of 0-1"
    return sources.map((source) => {
      // Simulate relevance scoring based on raw score
      const relevanceScore = source.rawScore ?? Math.random() * 0.5 + 0.3
      return {
        ...source,
        relevanceScore,
        included: relevanceScore >= threshold,
      }
    })
  }

  // ── Stage 3: Fallback ─────────────────────────────────────────────────

  private async webSearchFallback(query: string): Promise<ContextSource[]> {
    // Stub — real impl: Brave Search or DuckDuckGo via MCP
    return [
      {
        name: 'web-search',
        type: 'web',
        content: `Web search results for: "${query.slice(0, 50)}"`,
        rawScore: 0.6,
      },
    ]
  }

  // ── Stage 4: Synthesize ───────────────────────────────────────────────

  private synthesize(query: string, sources: EvaluatedSource[]): string {
    if (sources.length === 0) return ''

    const parts = sources.map(
      (s) => `[${s.type}/${s.name}, relevance: ${s.relevanceScore.toFixed(2)}]\n${s.content}`
    )

    return `Context for: "${query}"\n\n${parts.join('\n\n---\n\n')}`
  }
}
