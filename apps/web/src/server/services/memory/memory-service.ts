/**
 * Memory Service
 *
 * Full memory lifecycle with vector search:
 * - Store memories with auto-embedding
 * - Vector similarity search via pgvector
 * - Tier management (core → recall → archival)
 * - Cognitive candidate promotion pipeline
 */

import type { Database } from '@solarc/db'
import { memories, memoryVectors, cognitiveCandidates } from '@solarc/db'
import { eq, and, desc, sql } from 'drizzle-orm'

export type MemoryTier = 'core' | 'recall' | 'archival'

export interface StoreMemoryInput {
  key: string
  content: string
  tier?: MemoryTier
  workspaceId?: string
  sourceAgentId?: string
  confidence?: number
}

export interface SearchResult {
  id: string
  key: string
  content: string
  tier: MemoryTier
  score: number
  createdAt: Date
}

/** Embedding function signature — injected to decouple from LLM provider */
export type EmbedFunction = (text: string) => Promise<number[]>

/** Tier promotion thresholds */
const PROMOTION_THRESHOLDS: Record<MemoryTier, { minConfidence: number; minAccesses: number }> = {
  archival: { minConfidence: 0.3, minAccesses: 1 },
  recall: { minConfidence: 0.6, minAccesses: 5 },
  core: { minConfidence: 0.85, minAccesses: 20 },
}

export class MemoryService {
  private embedFn: EmbedFunction | null = null

  constructor(private db: Database) {}

  /** Set the embedding function (injected from gateway) */
  setEmbedFunction(fn: EmbedFunction): void {
    this.embedFn = fn
  }

  /**
   * Store a memory and optionally embed it for vector search.
   */
  async store(input: StoreMemoryInput): Promise<typeof memories.$inferSelect> {
    const [mem] = await this.db
      .insert(memories)
      .values({
        key: input.key,
        content: input.content,
        tier: input.tier ?? 'recall',
        workspaceId: input.workspaceId,
        source: input.sourceAgentId,
        confidence: input.confidence,
      })
      .returning()

    // Auto-embed if embedding function available
    if (this.embedFn) {
      try {
        const embedding = await this.embedFn(input.content)
        await this.db.insert(memoryVectors).values({
          memoryId: mem!.id,
          embedding,
        })
      } catch (err) {
        console.error('[Memory] Embedding failed, stored without vector:', err)
      }
    }

    return mem!
  }

  /**
   * Vector similarity search using pgvector cosine distance.
   */
  async search(
    query: string,
    options?: { tier?: MemoryTier; workspaceId?: string; limit?: number },
  ): Promise<SearchResult[]> {
    if (!this.embedFn) {
      // Fallback to keyword search
      return this.keywordSearch(query, options)
    }

    const queryEmbedding = await this.embedFn(query)
    const limit = options?.limit ?? 10

    // Build conditions
    const conditions = []
    if (options?.tier) conditions.push(eq(memories.tier, options.tier))
    if (options?.workspaceId) conditions.push(eq(memories.workspaceId, options.workspaceId))

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    // Cosine similarity search via pgvector
    const results = await this.db
      .select({
        id: memories.id,
        key: memories.key,
        content: memories.content,
        tier: memories.tier,
        createdAt: memories.createdAt,
        score: sql<number>`1 - (${memoryVectors.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`,
      })
      .from(memories)
      .innerJoin(memoryVectors, eq(memories.id, memoryVectors.memoryId))
      .where(whereClause)
      .orderBy(sql`${memoryVectors.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
      .limit(limit)

    const mapped = results.map((r) => ({
      id: r.id,
      key: r.key,
      content: r.content,
      tier: r.tier as MemoryTier,
      score: r.score,
      createdAt: r.createdAt,
    }))

    // Track access for returned results (fire-and-forget)
    if (mapped.length > 0) {
      this.trackAccess(mapped.map((m) => m.id)).catch(() => {})
    }

    return mapped
  }

  /**
   * Keyword-based fallback search when embeddings aren't available.
   */
  async keywordSearch(
    query: string,
    options?: { tier?: MemoryTier; workspaceId?: string; limit?: number },
  ): Promise<SearchResult[]> {
    const conditions = []
    if (options?.tier) conditions.push(eq(memories.tier, options.tier))
    if (options?.workspaceId) conditions.push(eq(memories.workspaceId, options.workspaceId))

    // Simple text matching
    const queryLower = query.toLowerCase()
    const tokens = queryLower.split(/\s+/).filter((t) => t.length > 2)

    const all = await this.db.query.memories.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: desc(memories.createdAt),
      limit: 200, // Pre-filter limit
    })

    // Score by token overlap
    const scored = all.map((mem) => {
      const contentLower = mem.content.toLowerCase()
      const keyLower = mem.key.toLowerCase()
      let score = 0
      for (const token of tokens) {
        if (contentLower.includes(token)) score += 0.3
        if (keyLower.includes(token)) score += 0.5
      }
      if (tokens.length > 0) score /= tokens.length
      return { ...mem, score }
    })

    return scored
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, options?.limit ?? 10)
      .map((m) => ({
        id: m.id,
        key: m.key,
        content: m.content,
        tier: m.tier as MemoryTier,
        score: m.score,
        createdAt: m.createdAt,
      }))
  }

  /**
   * Get a memory by ID.
   */
  async get(id: string) {
    return this.db.query.memories.findFirst({ where: eq(memories.id, id) })
  }

  /**
   * Update a memory's tier (promote or demote).
   */
  async updateTier(id: string, tier: MemoryTier): Promise<void> {
    await this.db.update(memories).set({ tier }).where(eq(memories.id, id))
  }

  /**
   * Update a memory's confidence score.
   */
  async updateConfidence(id: string, confidence: number): Promise<void> {
    await this.db
      .update(memories)
      .set({
        confidence: Math.max(0, Math.min(1, confidence)),
      })
      .where(eq(memories.id, id))
  }

  /**
   * Delete a memory and its vector.
   */
  async delete(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(memoryVectors).where(eq(memoryVectors.memoryId, id))
      await tx.delete(memories).where(eq(memories.id, id))
    })
  }

  /**
   * Track access for memories returned by search.
   * Increments access_count and updates last_accessed_at.
   */
  async trackAccess(memoryIds: string[]): Promise<void> {
    for (const id of memoryIds) {
      await this.db
        .update(memories)
        .set({
          accessCount: sql`${memories.accessCount} + 1`,
          lastAccessedAt: new Date(),
        })
        .where(eq(memories.id, id))
    }
  }

  /**
   * Temporal decay: reduce confidence for memories not accessed recently.
   * - 5% decay for memories not accessed in 30 days
   * - 15% decay for memories not accessed in 90 days
   * Call this periodically (e.g., from a cron job or healing autoHeal).
   */
  async decayConfidence(): Promise<{ decayed: number }> {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    // Heavy decay: not accessed in 90 days, lose 15%
    const heavy = await this.db
      .update(memories)
      .set({
        confidence: sql`GREATEST(0.05, COALESCE(${memories.confidence}, 0.5) * 0.85)`,
      })
      .where(
        and(
          sql`(${memories.lastAccessedAt} IS NULL OR ${memories.lastAccessedAt} < ${ninetyDaysAgo.toISOString()})`,
          sql`COALESCE(${memories.confidence}, 0.5) > 0.05`,
        ),
      )
      .returning()

    // Light decay: not accessed in 30 days (but within 90), lose 5%
    const light = await this.db
      .update(memories)
      .set({
        confidence: sql`GREATEST(0.05, COALESCE(${memories.confidence}, 0.5) * 0.95)`,
      })
      .where(
        and(
          sql`${memories.lastAccessedAt} IS NOT NULL`,
          sql`${memories.lastAccessedAt} < ${thirtyDaysAgo.toISOString()}`,
          sql`${memories.lastAccessedAt} >= ${ninetyDaysAgo.toISOString()}`,
          sql`COALESCE(${memories.confidence}, 0.5) > 0.05`,
        ),
      )
      .returning()

    return { decayed: heavy.length + light.length }
  }

  /**
   * Nominate a memory for tier promotion.
   */
  async nominateForPromotion(memoryId: string): Promise<void> {
    await this.db.insert(cognitiveCandidates).values({
      memoryId,
      status: 'pending',
    })
  }

  /**
   * Process pending cognitive candidates: auto-promote based on confidence thresholds.
   */
  async processPromotions(): Promise<{ promoted: number; rejected: number }> {
    const pending = await this.db.query.cognitiveCandidates.findMany({
      where: eq(cognitiveCandidates.status, 'pending'),
    })

    let promoted = 0
    let rejected = 0

    for (const candidate of pending) {
      if (!candidate.memoryId) {
        await this.db
          .update(cognitiveCandidates)
          .set({ status: 'rejected' })
          .where(eq(cognitiveCandidates.id, candidate.id))
        rejected++
        continue
      }

      const mem = await this.get(candidate.memoryId)
      if (!mem) {
        await this.db
          .update(cognitiveCandidates)
          .set({ status: 'rejected' })
          .where(eq(cognitiveCandidates.id, candidate.id))
        rejected++
        continue
      }

      const currentTier = mem.tier as MemoryTier
      const nextTier = getNextTier(currentTier)
      if (!nextTier) {
        // Already at highest tier
        await this.db
          .update(cognitiveCandidates)
          .set({ status: 'rejected' })
          .where(eq(cognitiveCandidates.id, candidate.id))
        rejected++
        continue
      }

      const threshold = PROMOTION_THRESHOLDS[nextTier]
      if ((mem.confidence ?? 0) >= threshold.minConfidence) {
        await this.updateTier(mem.id, nextTier)
        await this.db
          .update(cognitiveCandidates)
          .set({ status: 'promoted' })
          .where(eq(cognitiveCandidates.id, candidate.id))
        promoted++
      } else {
        await this.db
          .update(cognitiveCandidates)
          .set({ status: 'rejected' })
          .where(eq(cognitiveCandidates.id, candidate.id))
        rejected++
      }
    }

    return { promoted, rejected }
  }

  /**
   * Get tier statistics.
   */
  async tierStats() {
    const stats = await this.db
      .select({
        tier: memories.tier,
        count: sql<number>`count(*)`,
        avgConfidence: sql<number>`avg(${memories.confidence})`,
      })
      .from(memories)
      .groupBy(memories.tier)

    return stats
  }
}

// === Helpers ===

function getNextTier(current: MemoryTier): MemoryTier | null {
  switch (current) {
    case 'archival':
      return 'recall'
    case 'recall':
      return 'core'
    case 'core':
      return null
  }
}
