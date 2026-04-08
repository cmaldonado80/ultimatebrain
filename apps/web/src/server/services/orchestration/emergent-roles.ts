/**
 * Emergent Role Creator
 *
 * Detects repeated work patterns that don't fit existing roles and proposes
 * new specialist roles. If 5 agents keep doing "API integration" work but
 * no "Integration Specialist" role exists, the system proposes creating one.
 *
 * Detection loop:
 *   OBSERVE  → track tool usage patterns, task categories, skill gaps
 *   CLUSTER  → group similar patterns into candidate roles
 *   EVALUATE → check if pattern is sustained (not one-off)
 *   PROPOSE  → suggest new role with required skills and department placement
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface WorkPattern {
  agentId: string
  agentName: string
  tools: string[]
  taskKeywords: string[]
  timestamp: number
}

export interface RoleProposal {
  id: string
  roleName: string
  description: string
  suggestedSkills: string[]
  suggestedDepartment: string
  evidenceCount: number // how many observations support this
  confidence: number // 0-1
  status: 'proposed' | 'approved' | 'rejected' | 'implemented'
  proposedAt: number
  supportingAgents: string[] // agents whose work informed this
}

export interface EmergentRoleStats {
  totalPatterns: number
  totalProposals: number
  implementedRoles: number
  topPatterns: Array<{ pattern: string; count: number }>
}

// ── Configuration ────────────────────────────────────────────────────────

const MIN_PATTERN_COUNT = 5 // minimum observations before proposing
const MIN_AGENTS_INVOLVED = 2 // at least 2 agents doing this work
const PATTERN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7-day window
const MAX_PATTERNS = 500
const MAX_PROPOSALS = 50

// ── Emergent Role Creator ────────────────────────────────────────────────

export class EmergentRoleCreator {
  private patterns: WorkPattern[] = []
  private proposals: RoleProposal[] = []

  /**
   * Record a work pattern from an agent's task execution.
   */
  recordPattern(pattern: WorkPattern) {
    this.patterns.push(pattern)
    while (this.patterns.length > MAX_PATTERNS) this.patterns.shift()
  }

  /**
   * Analyze patterns and generate role proposals.
   */
  analyze(): RoleProposal[] {
    const now = Date.now()
    const recent = this.patterns.filter((p) => now - p.timestamp < PATTERN_WINDOW_MS)

    // Cluster by tool combination
    const clusters = new Map<
      string,
      { agents: Set<string>; agentNames: Set<string>; keywords: Set<string>; count: number }
    >()

    for (const pattern of recent) {
      // Create a fingerprint from sorted tools
      const toolFingerprint = pattern.tools.sort().join('+')
      if (!toolFingerprint) continue

      const cluster = clusters.get(toolFingerprint) ?? {
        agents: new Set(),
        agentNames: new Set(),
        keywords: new Set(),
        count: 0,
      }
      cluster.agents.add(pattern.agentId)
      cluster.agentNames.add(pattern.agentName)
      for (const kw of pattern.taskKeywords) cluster.keywords.add(kw)
      cluster.count++
      clusters.set(toolFingerprint, cluster)
    }

    // Evaluate clusters for role proposals
    const newProposals: RoleProposal[] = []

    for (const [fingerprint, cluster] of clusters) {
      // Must meet thresholds
      if (cluster.count < MIN_PATTERN_COUNT) continue
      if (cluster.agents.size < MIN_AGENTS_INVOLVED) continue

      // Check if we already proposed this
      const existingProposal = this.proposals.find(
        (p) => [...p.suggestedSkills].sort().join('+') === fingerprint,
      )
      if (existingProposal) {
        // Update evidence count
        existingProposal.evidenceCount = cluster.count
        existingProposal.confidence = Math.min(1, cluster.count / (MIN_PATTERN_COUNT * 3))
        continue
      }

      // Generate role name from tools and keywords
      const tools = fingerprint.split('+')
      const roleName = this.generateRoleName(tools, Array.from(cluster.keywords))
      const department = this.suggestDepartment(tools)

      const proposal: RoleProposal = {
        id: `role_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        roleName,
        description: `Specialist role emerged from ${cluster.count} work patterns across ${cluster.agents.size} agents. Primary tools: ${tools.join(', ')}. Common tasks: ${Array.from(cluster.keywords).slice(0, 5).join(', ')}.`,
        suggestedSkills: tools,
        suggestedDepartment: department,
        evidenceCount: cluster.count,
        confidence: Math.min(1, cluster.count / (MIN_PATTERN_COUNT * 3)),
        status: 'proposed',
        proposedAt: now,
        supportingAgents: Array.from(cluster.agentNames),
      }

      newProposals.push(proposal)
      this.proposals.push(proposal)
    }

    while (this.proposals.length > MAX_PROPOSALS) this.proposals.shift()
    return newProposals
  }

  /**
   * Approve a role proposal (marks it for implementation).
   */
  approveProposal(proposalId: string): RoleProposal | null {
    const proposal = this.proposals.find((p) => p.id === proposalId)
    if (proposal) proposal.status = 'approved'
    return proposal ?? null
  }

  /**
   * Reject a role proposal.
   */
  rejectProposal(proposalId: string): RoleProposal | null {
    const proposal = this.proposals.find((p) => p.id === proposalId)
    if (proposal) proposal.status = 'rejected'
    return proposal ?? null
  }

  /**
   * Mark a proposal as implemented.
   */
  markImplemented(proposalId: string): RoleProposal | null {
    const proposal = this.proposals.find((p) => p.id === proposalId)
    if (proposal) proposal.status = 'implemented'
    return proposal ?? null
  }

  getProposals(): RoleProposal[] {
    return [...this.proposals]
  }

  getStats(): EmergentRoleStats {
    const patternCounts = new Map<string, number>()
    for (const p of this.patterns) {
      const key = p.tools.sort().join('+')
      patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1)
    }

    return {
      totalPatterns: this.patterns.length,
      totalProposals: this.proposals.length,
      implementedRoles: this.proposals.filter((p) => p.status === 'implemented').length,
      topPatterns: Array.from(patternCounts.entries())
        .map(([pattern, count]) => ({ pattern, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    }
  }

  private generateRoleName(tools: string[], keywords: string[]): string {
    // Heuristic: pick the most descriptive keyword or tool
    const domainKeywords = keywords.filter((k) => k.length > 4).slice(0, 2)
    if (domainKeywords.length > 0) {
      return `${domainKeywords.map((k) => k.charAt(0).toUpperCase() + k.slice(1)).join(' ')} Specialist`
    }

    // Fallback: derive from tools
    const primaryTool = tools[0] ?? 'general'
    const toolName = primaryTool.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    return `${toolName} Specialist`
  }

  private suggestDepartment(tools: string[]): string {
    const toolStr = tools.join(' ')
    if (toolStr.includes('web_') || toolStr.includes('api_')) return 'engineering'
    if (toolStr.includes('db_') || toolStr.includes('sql')) return 'engineering'
    if (toolStr.includes('vision') || toolStr.includes('render')) return 'design'
    if (toolStr.includes('slack') || toolStr.includes('notion')) return 'marketing'
    if (toolStr.includes('docker') || toolStr.includes('shell')) return 'soc-ops'
    return 'engineering' // default
  }
}
