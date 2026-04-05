/**
 * Knowledge Mesh — Peer-to-peer knowledge queries between agents.
 *
 * Before starting work, an agent can ask: "Has anyone in this department
 * (or the whole org) solved a similar problem?" and get relevant findings
 * from peers — like asking the team in Slack before coding.
 *
 * Knowledge flows:
 *   QUERY   → agent asks a question with context
 *   MATCH   → find agents with relevant experience (via memories + instincts)
 *   RESPOND → return ranked findings from peers
 *   LEARN   → track which findings were useful (feedback loop)
 */

import type { Database } from '@solarc/db'
import { knowledgeExchanges } from '@solarc/db'
import { desc, eq, sql } from 'drizzle-orm'

import { logger } from '../../../lib/logger'

// ── Types ────────────────────────────────────────────────────────────────

export interface KnowledgeQuery {
  askingAgentId: string
  question: string
  context: string
  scope: 'department' | 'organization'
  departmentDomain?: string
  maxResults?: number
}

export interface KnowledgeFinding {
  sourceAgentId: string
  sourceAgentName: string
  content: string
  relevanceScore: number
  source: 'memory' | 'instinct' | 'decision' | 'finding'
  timestamp: number
}

export interface KnowledgeExchange {
  id?: string
  query: KnowledgeQuery
  findings: KnowledgeFinding[]
  queriedAt: number
  feedbackGiven?: 'helpful' | 'not_helpful'
}

export interface MeshStats {
  totalQueries: number
  totalFindings: number
  helpfulRate: number
  topContributors: Array<{ agentId: string; agentName: string; contributions: number }>
}

// ── Knowledge Mesh ───────────────────────────────────────────────────────

const MAX_EXCHANGE_HISTORY = 200

export class KnowledgeMesh {
  private db: Database | null
  private exchanges: KnowledgeExchange[] = []
  private contributionCounts = new Map<string, { name: string; count: number }>()

  constructor(db?: Database) {
    this.db = db ?? null
  }

  /**
   * Query the knowledge mesh for relevant findings from peer agents.
   *
   * @param query - What the agent wants to know
   * @param agentStates - All agent states (from AgentStateManager)
   * @param memorySearch - Memory search function (from MemoryService)
   */
  async query(
    query: KnowledgeQuery,
    agentStates: Array<{
      agentId: string
      agentName: string
      workspaceId: string
      context: {
        decisions: Array<{ id: string; decision: string; reason: string; timestamp: number }>
        findings: Array<{ topic: string; insight: string; timestamp: number }>
        recentFiles: string[]
      }
      completedTasks: Array<{ title: string; summary?: string }>
    }>,
    memorySearch?: (
      query: string,
      workspaceId?: string,
    ) => Promise<Array<{ content: string; score: number; source?: string }>>,
  ): Promise<KnowledgeFinding[]> {
    // 0. Check DB for similar past exchanges with helpful feedback
    if (this.db) {
      try {
        const dbFindings = await this.lookupSimilarExchanges(query.question, query.maxResults ?? 10)
        if (dbFindings.length > 0) {
          // Persist this exchange too (for stats)
          await this.persistExchange(query, dbFindings)
          return dbFindings
        }
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          'knowledge-mesh: DB lookup failed, continuing with in-memory search',
        )
      }
    }

    const findings: KnowledgeFinding[] = []
    const queryWords = query.question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // strip punctuation
      .split(/\s+/)
      .filter((w) => w.length > 3)

    // 1. Search peer agent states for relevant decisions and findings
    for (const agent of agentStates) {
      if (agent.agentId === query.askingAgentId) continue // don't query self

      // Scope filtering
      if (
        query.scope === 'department' &&
        query.departmentDomain &&
        agent.workspaceId !== query.departmentDomain
      ) {
        continue
      }

      // Score decisions by keyword overlap
      for (const decision of agent.context.decisions) {
        const text = `${decision.decision} ${decision.reason}`.toLowerCase()
        const matchCount = queryWords.filter((w) => text.includes(w)).length
        if (matchCount > 0) {
          findings.push({
            sourceAgentId: agent.agentId,
            sourceAgentName: agent.agentName,
            content: `Decision: ${decision.decision} — Reason: ${decision.reason}`,
            relevanceScore: matchCount / queryWords.length,
            source: 'decision',
            timestamp: decision.timestamp,
          })
        }
      }

      // Score findings by keyword overlap
      for (const finding of agent.context.findings) {
        const text = `${finding.topic} ${finding.insight}`.toLowerCase()
        const matchCount = queryWords.filter((w) => text.includes(w)).length
        if (matchCount > 0) {
          findings.push({
            sourceAgentId: agent.agentId,
            sourceAgentName: agent.agentName,
            content: `${finding.topic}: ${finding.insight}`,
            relevanceScore: matchCount / queryWords.length,
            source: 'finding',
            timestamp: finding.timestamp,
          })
        }
      }

      // Score completed tasks by keyword overlap
      for (const task of agent.completedTasks) {
        if (!task.summary) continue
        const text = `${task.title} ${task.summary}`.toLowerCase()
        const matchCount = queryWords.filter((w) => text.includes(w)).length
        if (matchCount > 0 && matchCount / queryWords.length > 0.3) {
          findings.push({
            sourceAgentId: agent.agentId,
            sourceAgentName: agent.agentName,
            content: `Completed: ${task.title} — ${task.summary}`,
            relevanceScore: (matchCount / queryWords.length) * 0.8, // slightly lower weight for task summaries
            source: 'finding',
            timestamp: Date.now(),
          })
        }
      }
    }

    // 2. Search memory store for relevant memories from any agent
    if (memorySearch) {
      try {
        const memories = await memorySearch(query.question)
        for (const mem of memories) {
          findings.push({
            sourceAgentId: mem.source ?? 'system',
            sourceAgentName: 'Memory Store',
            content: mem.content,
            relevanceScore: mem.score,
            source: 'memory',
            timestamp: Date.now(),
          })
        }
      } catch {
        // Memory search unavailable — use state-only results
      }
    }

    // 3. Sort by relevance and limit
    findings.sort((a, b) => b.relevanceScore - a.relevanceScore)
    const limited = findings.slice(0, query.maxResults ?? 10)

    // 4. Track contributions
    for (const f of limited) {
      const existing = this.contributionCounts.get(f.sourceAgentId)
      if (existing) {
        existing.count++
      } else {
        this.contributionCounts.set(f.sourceAgentId, { name: f.sourceAgentName, count: 1 })
      }
    }

    // 5. Record exchange (in-memory + DB)
    const exchange: KnowledgeExchange = {
      query,
      findings: limited,
      queriedAt: Date.now(),
    }
    this.exchanges.push(exchange)
    while (this.exchanges.length > MAX_EXCHANGE_HISTORY) this.exchanges.shift()

    // Persist to DB
    await this.persistExchange(query, limited)

    return limited
  }

  /**
   * Record feedback on whether findings were helpful.
   */
  async recordFeedback(
    queryIndexOrId: number | string,
    feedback: 'helpful' | 'not_helpful',
  ): Promise<void> {
    // In-memory update
    if (typeof queryIndexOrId === 'number') {
      const exchange = this.exchanges[queryIndexOrId]
      if (exchange) exchange.feedbackGiven = feedback
    }

    // DB update
    if (this.db && typeof queryIndexOrId === 'string') {
      try {
        await this.db
          .update(knowledgeExchanges)
          .set({ feedback })
          .where(eq(knowledgeExchanges.id, queryIndexOrId))
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          'knowledge-mesh: DB feedback update failed',
        )
      }
    }
  }

  /**
   * Get mesh statistics.
   */
  getStats(): MeshStats {
    const helpful = this.exchanges.filter((e) => e.feedbackGiven === 'helpful').length
    const rated = this.exchanges.filter((e) => e.feedbackGiven).length

    return {
      totalQueries: this.exchanges.length,
      totalFindings: this.exchanges.reduce((a, e) => a + e.findings.length, 0),
      helpfulRate: rated > 0 ? helpful / rated : 0,
      topContributors: Array.from(this.contributionCounts.entries())
        .map(([agentId, { name, count }]) => ({ agentId, agentName: name, contributions: count }))
        .sort((a, b) => b.contributions - a.contributions)
        .slice(0, 10),
    }
  }

  getRecentExchanges(limit = 10): KnowledgeExchange[] {
    return this.exchanges.slice(-limit)
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Look up similar past exchanges in DB that had helpful feedback.
   */
  private async lookupSimilarExchanges(
    question: string,
    maxResults: number,
  ): Promise<KnowledgeFinding[]> {
    if (!this.db) return []

    // Extract significant words for ILIKE matching
    const words = question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5) // limit to top 5 significant words

    if (words.length === 0) return []

    // Build ILIKE conditions for each word
    const likePattern = `%${words.join('%')}%`

    const rows = await this.db
      .select()
      .from(knowledgeExchanges)
      .where(
        sql`${knowledgeExchanges.feedback} = 'helpful' AND lower(${knowledgeExchanges.question}) LIKE ${likePattern}`,
      )
      .orderBy(desc(knowledgeExchanges.createdAt))
      .limit(maxResults)

    if (rows.length === 0) return []

    // Flatten findings from matched exchanges
    const findings: KnowledgeFinding[] = []
    for (const row of rows) {
      const rowFindings = (row.findings ?? []) as KnowledgeFinding[]
      findings.push(...rowFindings)
    }

    return findings.slice(0, maxResults)
  }

  /**
   * Persist an exchange to the DB.
   * Accepts either a full KnowledgeQuery + findings, or a simplified delegation-style input.
   */
  async persistExchange(
    queryOrInput:
      | KnowledgeQuery
      | {
          askingAgentId: string
          question: string
          scope: 'department' | 'organization'
          findings: Array<{
            sourceAgentId: string
            content: string
            relevanceScore: number
            source: string
          }>
        },
    findingsArg?: KnowledgeFinding[],
  ): Promise<void> {
    // Normalize: two-arg form (query, findings) or single-arg form with embedded findings
    const askingAgentId = queryOrInput.askingAgentId
    const question = queryOrInput.question
    const scope = queryOrInput.scope
    const findings: Array<Record<string, unknown>> = findingsArg
      ? (findingsArg as unknown as Array<Record<string, unknown>>)
      : (('findings' in queryOrInput ? queryOrInput.findings : []) as Array<
          Record<string, unknown>
        >)
    if (!this.db) return

    try {
      await this.db.insert(knowledgeExchanges).values({
        askingAgentId,
        question,
        scope,
        findings: findings as Record<string, unknown>[],
      })
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err : undefined },
        'knowledge-mesh: DB persist failed',
      )
    }
  }
}
