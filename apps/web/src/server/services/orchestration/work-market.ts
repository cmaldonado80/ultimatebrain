/**
 * Autonomous Work Market
 *
 * Agents bid on tickets based on skills, current load, past success rate,
 * and cost efficiency. Replaces top-down round-robin assignment with a
 * talent marketplace where the best-fit agent wins the work.
 *
 * Flow:
 *   1. Ticket enters the market with required skills + budget
 *   2. Qualified agents evaluate and submit bids
 *   3. Best bid wins (composite score of skill match + success rate + load)
 *   4. Winner gets assigned via atomic checkout
 *   5. Outcome feeds back into agent reputation
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface MarketListing {
  ticketId: string
  title: string
  requiredSkills: string[]
  priority: string
  complexity: 'easy' | 'medium' | 'hard'
  listedAt: number
  expiresAt: number // auto-assign after this
  bids: AgentBid[]
  winnerId?: string
  status: 'open' | 'awarded' | 'expired'
}

export interface AgentBid {
  agentId: string
  agentName: string
  score: number // composite fitness score (0-1)
  skillMatch: number // how well skills overlap (0-1)
  successRate: number // historical success rate (0-1)
  currentLoad: number // inverse of busyness (1 = idle, 0 = maxed)
  costEfficiency: number // lower cost per task = higher score
  bidAt: number
}

export interface AgentReputation {
  agentId: string
  agentName: string
  totalBids: number
  totalWins: number
  totalCompletions: number
  totalFailures: number
  winRate: number
  successRate: number
  avgCompletionMs: number
  skills: string[]
}

export interface MarketStats {
  totalListings: number
  openListings: number
  awardedListings: number
  avgBidsPerListing: number
  topAgents: AgentReputation[]
}

// ── Configuration ────────────────────────────────────────────────────────

const BID_WINDOW_MS = 30 * 1000 // 30 seconds for agents to bid
const MAX_LISTINGS = 200

// Scoring weights
const WEIGHTS = {
  skillMatch: 0.35,
  successRate: 0.3,
  currentLoad: 0.2,
  costEfficiency: 0.15,
}

// ── Work Market ──────────────────────────────────────────────────────────

export class WorkMarket {
  private listings = new Map<string, MarketListing>()
  private reputations = new Map<string, AgentReputation>()

  /**
   * List a ticket on the market for bidding.
   */
  list(ticket: {
    ticketId: string
    title: string
    requiredSkills: string[]
    priority: string
    complexity?: 'easy' | 'medium' | 'hard'
  }): MarketListing {
    const listing: MarketListing = {
      ticketId: ticket.ticketId,
      title: ticket.title,
      requiredSkills: ticket.requiredSkills,
      priority: ticket.priority,
      complexity: ticket.complexity ?? 'medium',
      listedAt: Date.now(),
      expiresAt: Date.now() + BID_WINDOW_MS,
      bids: [],
      status: 'open',
    }

    this.listings.set(ticket.ticketId, listing)
    this.enforceMaxListings()
    return listing
  }

  /**
   * Submit a bid for a listing.
   */
  bid(
    ticketId: string,
    agent: {
      agentId: string
      agentName: string
      skills: string[]
      currentTaskCount: number
      maxConcurrency: number
    },
  ): AgentBid | null {
    const listing = this.listings.get(ticketId)
    if (!listing || listing.status !== 'open') return null

    // Already bid?
    if (listing.bids.some((b) => b.agentId === agent.agentId)) return null

    const reputation = this.reputations.get(agent.agentId)

    // Calculate scores
    const skillMatch = this.calculateSkillMatch(listing.requiredSkills, agent.skills)
    const successRate = reputation?.successRate ?? 0.5 // default 50% for new agents
    const currentLoad =
      agent.maxConcurrency > 0 ? Math.max(0, 1 - agent.currentTaskCount / agent.maxConcurrency) : 0
    const completions = reputation?.totalCompletions ?? 0
    const failures = reputation?.totalFailures ?? 0
    const costEfficiency = completions + failures > 0 ? completions / (completions + failures) : 0.5

    // Composite score
    const score =
      WEIGHTS.skillMatch * skillMatch +
      WEIGHTS.successRate * successRate +
      WEIGHTS.currentLoad * currentLoad +
      WEIGHTS.costEfficiency * costEfficiency

    const bid: AgentBid = {
      agentId: agent.agentId,
      agentName: agent.agentName,
      score,
      skillMatch,
      successRate,
      currentLoad,
      costEfficiency,
      bidAt: Date.now(),
    }

    listing.bids.push(bid)

    // Update reputation
    this.getOrCreateReputation(agent.agentId, agent.agentName, agent.skills).totalBids++

    return bid
  }

  /**
   * Award a listing to the highest-scoring bidder.
   */
  award(ticketId: string): AgentBid | null {
    const listing = this.listings.get(ticketId)
    if (!listing || listing.status !== 'open' || listing.bids.length === 0) return null

    // Sort bids by score descending
    listing.bids.sort((a, b) => b.score - a.score)
    const winner = listing.bids[0]!

    listing.winnerId = winner.agentId
    listing.status = 'awarded'

    // Update reputation
    const rep = this.reputations.get(winner.agentId)
    if (rep) rep.totalWins++

    return winner
  }

  /**
   * Process expired listings (auto-award to best bidder or expire).
   */
  processExpired(): Array<{ ticketId: string; winnerId?: string }> {
    const results: Array<{ ticketId: string; winnerId?: string }> = []
    const now = Date.now()

    for (const [ticketId, listing] of this.listings) {
      if (listing.status !== 'open') continue
      if (now < listing.expiresAt) continue

      if (listing.bids.length > 0) {
        const winner = this.award(ticketId)
        results.push({ ticketId, winnerId: winner?.agentId })
      } else {
        listing.status = 'expired'
        results.push({ ticketId })
      }
    }

    return results
  }

  /**
   * Record task completion for reputation tracking.
   */
  recordCompletion(agentId: string, success: boolean, durationMs: number) {
    const rep = this.reputations.get(agentId)
    if (!rep) return

    if (success) {
      rep.totalCompletions++
    } else {
      rep.totalFailures++
    }

    const total = rep.totalCompletions + rep.totalFailures
    rep.successRate = total > 0 ? rep.totalCompletions / total : 0
    rep.winRate = rep.totalBids > 0 ? rep.totalWins / rep.totalBids : 0

    // Rolling average completion time
    rep.avgCompletionMs =
      rep.avgCompletionMs === 0 ? durationMs : rep.avgCompletionMs * 0.9 + durationMs * 0.1
  }

  /**
   * Get market statistics.
   */
  getStats(): MarketStats {
    const listings = Array.from(this.listings.values())
    const open = listings.filter((l) => l.status === 'open')
    const awarded = listings.filter((l) => l.status === 'awarded')
    const totalBids = listings.reduce((a, l) => a + l.bids.length, 0)

    return {
      totalListings: listings.length,
      openListings: open.length,
      awardedListings: awarded.length,
      avgBidsPerListing: listings.length > 0 ? totalBids / listings.length : 0,
      topAgents: Array.from(this.reputations.values())
        .sort((a, b) => b.successRate * b.totalWins - a.successRate * a.totalWins)
        .slice(0, 10),
    }
  }

  /**
   * Get open listings for an agent to bid on.
   */
  getOpenListings(agentSkills: string[]): MarketListing[] {
    return Array.from(this.listings.values())
      .filter((l) => l.status === 'open')
      .filter((l) => this.calculateSkillMatch(l.requiredSkills, agentSkills) > 0.2)
      .sort((a, b) => {
        // Priority ordering
        const pOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
        return (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2)
      })
  }

  getReputation(agentId: string): AgentReputation | undefined {
    return this.reputations.get(agentId)
  }

  getAllReputations(): AgentReputation[] {
    return Array.from(this.reputations.values())
  }

  private calculateSkillMatch(required: string[], agentSkills: string[]): number {
    if (required.length === 0) return 1 // no requirements = anyone can do it
    const agentSet = new Set(agentSkills.map((s) => s.toLowerCase()))
    const matched = required.filter((r) => agentSet.has(r.toLowerCase())).length
    return matched / required.length
  }

  private getOrCreateReputation(
    agentId: string,
    agentName: string,
    skills: string[],
  ): AgentReputation {
    let rep = this.reputations.get(agentId)
    if (!rep) {
      rep = {
        agentId,
        agentName,
        totalBids: 0,
        totalWins: 0,
        totalCompletions: 0,
        totalFailures: 0,
        winRate: 0,
        successRate: 0.5,
        avgCompletionMs: 0,
        skills,
      }
      this.reputations.set(agentId, rep)
    }
    return rep
  }

  private enforceMaxListings() {
    if (this.listings.size <= MAX_LISTINGS) return
    // Remove oldest expired/awarded first
    const sorted = Array.from(this.listings.entries())
      .filter(([, l]) => l.status !== 'open')
      .sort(([, a], [, b]) => a.listedAt - b.listedAt)
    for (const [id] of sorted) {
      this.listings.delete(id)
      if (this.listings.size <= MAX_LISTINGS) break
    }
  }
}
