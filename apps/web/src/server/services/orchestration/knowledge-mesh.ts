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
  private exchanges: KnowledgeExchange[] = []
  private contributionCounts = new Map<string, { name: string; count: number }>()

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
    const findings: KnowledgeFinding[] = []
    const queryWords = query.question
      .toLowerCase()
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

    // 5. Record exchange
    const exchange: KnowledgeExchange = {
      query,
      findings: limited,
      queriedAt: Date.now(),
    }
    this.exchanges.push(exchange)
    while (this.exchanges.length > MAX_EXCHANGE_HISTORY) this.exchanges.shift()

    return limited
  }

  /**
   * Record feedback on whether findings were helpful.
   */
  recordFeedback(queryIndex: number, feedback: 'helpful' | 'not_helpful') {
    const exchange = this.exchanges[queryIndex]
    if (exchange) exchange.feedbackGiven = feedback
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
}
