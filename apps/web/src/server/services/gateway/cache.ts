/**
 * Semantic cache using pgvector: embed the prompt, search for similar
 * cached prompts (cosine > threshold), return cached response on hit.
 *
 * - Cache hit: zero cost, near-instant response
 * - Cache miss: call LLM, store response + embedding
 * - TTL: 24h default, configurable per agent
 * - Skip: streaming, tool-use prompts, volatile system prompts
 */

import type { Database } from '@solarc/db'
import { sql } from 'drizzle-orm'

/** Row shape returned by raw SQL cache lookups */
interface CacheRow {
  response: string
  model: string
  tokens_in: number
  tokens_out: number
  similarity?: number
}

export interface CacheEntry {
  promptHash: string
  model: string
  response: string
  tokensIn: number
  tokensOut: number
  embedding: number[]
  createdAt: Date
  ttlMs: number
}

export interface CacheHit {
  response: string
  model: string
  tokensIn: number
  tokensOut: number
  similarity: number
}

export interface CacheConfig {
  /** Cosine similarity threshold for cache hit (0-1) */
  similarityThreshold: number
  /** Default TTL in ms */
  defaultTtlMs: number
  /** Maximum cache entries */
  maxEntries: number
}

const DEFAULT_CONFIG: CacheConfig = {
  similarityThreshold: 0.95,
  defaultTtlMs: 24 * 60 * 60 * 1000, // 24 hours
  maxEntries: 10_000,
}

/**
 * Determines if a request should skip the cache.
 * Tool-use prompts and streaming are not cacheable.
 */
export function shouldSkipCache(params: {
  stream?: boolean
  tools?: unknown[]
  messages: Array<{ role: string; content: string }>
}): boolean {
  if (params.stream) return true
  if (params.tools && params.tools.length > 0) return true

  // Skip if system prompt has dynamic content markers
  const systemMsg = params.messages.find((m) => m.role === 'system')
  if (systemMsg?.content.includes('{{') || systemMsg?.content.includes('current_time')) {
    return true
  }

  return false
}

/**
 * Create a deterministic hash of the prompt for exact-match fast path.
 * Uses a simple FNV-1a-like hash for speed.
 */
function hashPrompt(model: string, messages: Array<{ role: string; content: string }>): string {
  const input = model + '|' + messages.map((m) => `${m.role}:${m.content}`).join('|')
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = (hash * 16777619) >>> 0
  }
  return hash.toString(36)
}

/**
 * Semantic cache backed by pgvector.
 *
 * Uses a dedicated `gateway_cache` table (created if not exists) with:
 * - prompt_hash: fast exact-match lookup
 * - embedding: pgvector cosine similarity for semantic matches
 * - response, model, tokens, ttl
 */
export class SemanticCache {
  private config: CacheConfig
  private initialized = false
  private initPromise: Promise<void> | null = null

  constructor(
    private db: Database,
    config?: Partial<CacheConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /** Ensure the cache table exists (run once at startup) */
  async initialize(): Promise<void> {
    if (this.initialized) return
    // Use a promise-based lock to prevent concurrent initialization
    if (this.initPromise) return this.initPromise
    this.initPromise = this._doInitialize()
    return this.initPromise
  }

  private async _doInitialize(): Promise<void> {
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS gateway_cache (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          prompt_hash text NOT NULL,
          model text NOT NULL,
          response text NOT NULL,
          tokens_in integer NOT NULL DEFAULT 0,
          tokens_out integer NOT NULL DEFAULT 0,
          embedding vector(1536),
          ttl_ms integer NOT NULL DEFAULT 86400000,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      // Index for exact hash lookup
      await this.db.execute(sql`
        CREATE INDEX IF NOT EXISTS gateway_cache_hash_idx ON gateway_cache (prompt_hash)
      `)
      // HNSW index for vector similarity search
      await this.db.execute(sql`
        CREATE INDEX IF NOT EXISTS gateway_cache_embedding_idx
        ON gateway_cache USING hnsw (embedding vector_cosine_ops)
      `)
      this.initialized = true
    } catch (err) {
      this.initPromise = null
      throw err
    }
  }

  /**
   * Look up a cached response.
   * 1. Try exact hash match (fast path)
   * 2. Try semantic similarity via pgvector (slow path)
   */
  async lookup(
    model: string,
    messages: Array<{ role: string; content: string }>,
    embedding?: number[],
  ): Promise<CacheHit | null> {
    await this.initialize()
    const hash = hashPrompt(model, messages)

    // Fast path: exact hash match
    const exactRows = await this.db.execute(sql`
      SELECT response, model, tokens_in, tokens_out, created_at, ttl_ms
      FROM gateway_cache
      WHERE prompt_hash = ${hash}
        AND model = ${model}
        AND created_at + (ttl_ms || ' milliseconds')::interval > now()
      ORDER BY created_at DESC
      LIMIT 1
    `)
    const exactMatch = (exactRows as unknown as { rows: CacheRow[] }).rows?.[0]
    if (exactMatch) {
      return {
        response: exactMatch.response,
        model: exactMatch.model,
        tokensIn: exactMatch.tokens_in,
        tokensOut: exactMatch.tokens_out,
        similarity: 1.0,
      }
    }

    // Slow path: semantic similarity via embedding
    if (!embedding || embedding.length === 0) return null

    const vectorStr = `[${embedding.join(',')}]`
    const threshold = this.config.similarityThreshold

    const semanticRows = await this.db.execute(sql`
      SELECT response, model, tokens_in, tokens_out,
             1 - (embedding <=> ${vectorStr}::vector) as similarity
      FROM gateway_cache
      WHERE model = ${model}
        AND embedding IS NOT NULL
        AND created_at + (ttl_ms || ' milliseconds')::interval > now()
        AND 1 - (embedding <=> ${vectorStr}::vector) > ${threshold}
      ORDER BY embedding <=> ${vectorStr}::vector ASC
      LIMIT 1
    `)
    const semanticMatch = (semanticRows as unknown as { rows: CacheRow[] }).rows?.[0]
    if (semanticMatch) {
      return {
        response: semanticMatch.response,
        model: semanticMatch.model,
        tokensIn: semanticMatch.tokens_in,
        tokensOut: semanticMatch.tokens_out,
        similarity: Number(semanticMatch.similarity),
      }
    }

    return null
  }

  /** Store a response in the cache */
  async store(
    model: string,
    messages: Array<{ role: string; content: string }>,
    response: string,
    tokensIn: number,
    tokensOut: number,
    embedding?: number[],
    ttlMs?: number,
  ): Promise<void> {
    await this.initialize()
    const hash = hashPrompt(model, messages)
    const ttl = ttlMs ?? this.config.defaultTtlMs

    if (embedding && embedding.length > 0) {
      const vectorStr = `[${embedding.join(',')}]`
      await this.db.execute(sql`
        INSERT INTO gateway_cache (prompt_hash, model, response, tokens_in, tokens_out, embedding, ttl_ms)
        VALUES (${hash}, ${model}, ${response}, ${tokensIn}, ${tokensOut}, ${vectorStr}::vector, ${ttl})
      `)
    } else {
      await this.db.execute(sql`
        INSERT INTO gateway_cache (prompt_hash, model, response, tokens_in, tokens_out, ttl_ms)
        VALUES (${hash}, ${model}, ${response}, ${tokensIn}, ${tokensOut}, ${ttl})
      `)
    }
  }

  /** Prune expired entries */
  async prune(): Promise<number> {
    const result = await this.db.execute(sql`
      DELETE FROM gateway_cache
      WHERE created_at + (ttl_ms || ' milliseconds')::interval <= now()
    `)
    return (result as { rowCount: number }).rowCount ?? 0
  }

  /** Clear all cache entries */
  async clear(): Promise<void> {
    await this.db.execute(sql`TRUNCATE gateway_cache`)
  }
}
