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

import type { Database } from '@solarc/db'
import { agentReputations, marketListings } from '@solarc/db'
import { and, eq, lte, sql } from 'drizzle-orm'

import { logger } from '../../../lib/logger'

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
const REPUTATION_CACHE_TTL_MS = 60 * 1000 // 60 second cache for reputation lookups

// Scoring weights
const WEIGHTS = {
  skillMatch: 0.35,
  successRate: 0.3,
  currentLoad: 0.2,
  costEfficiency: 0.15,
}

// ── Work Market ──────────────────────────────────────────────────────────

export class WorkMarket {
  private db: Database | null
  // In-memory fallback when no DB is provided
  private listings = new Map<string, MarketListing>()
  private reputations = new Map<string, AgentReputation>()
  // Reputation cache for DB-backed mode
  private reputationCache = new Map<string, { rep: AgentReputation; cachedAt: number }>()

  constructor(db?: Database) {
    this.db = db ?? null
  }

  /**
   * List a ticket on the market for bidding.
   */
  async list(ticket: {
    ticketId: string
    title: string
    requiredSkills: string[]
    priority: string
    complexity?: 'easy' | 'medium' | 'hard'
  }): Promise<MarketListing> {
    const now = Date.now()
    const expiresAt = now + BID_WINDOW_MS

    const listing: MarketListing = {
      ticketId: ticket.ticketId,
      title: ticket.title,
      requiredSkills: ticket.requiredSkills,
      priority: ticket.priority,
      complexity: ticket.complexity ?? 'medium',
      listedAt: now,
      expiresAt,
      bids: [],
      status: 'open',
    }

    if (this.db) {
      try {
        await this.db.insert(marketListings).values({
          ticketId: ticket.ticketId,
          status: 'open',
          bids: [],
          expiresAt: new Date(expiresAt),
        })
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          'work-market: DB insert failed, falling back to in-memory',
        )
        this.listings.set(ticket.ticketId, listing)
        this.enforceMaxListings()
      }
    } else {
      this.listings.set(ticket.ticketId, listing)
      this.enforceMaxListings()
    }

    return listing
  }

  /**
   * Submit a bid for a listing.
   */
  async bid(
    ticketId: string,
    agent: {
      agentId: string
      agentName: string
      skills: string[]
      currentLoad?: number
      currentTaskCount?: number
      maxConcurrency?: number
      avgCompletionMs?: number
    },
  ): Promise<AgentBid | null> {
    // Get reputation for scoring
    const reputation = await this.getReputation(agent.agentId)

    // Calculate scores
    const requiredSkills = await this.getRequiredSkills(ticketId)
    const skillMatch = this.calculateSkillMatch(requiredSkills, agent.skills)
    const successRate = reputation?.successRate ?? 0.5 // default 50% for new agents

    let currentLoad: number
    if (agent.currentLoad !== undefined) {
      currentLoad = Math.max(0, 1 - agent.currentLoad)
    } else {
      const taskCount = agent.currentTaskCount ?? 0
      const maxConc = agent.maxConcurrency ?? 1
      currentLoad = maxConc > 0 ? Math.max(0, 1 - taskCount / maxConc) : 0
    }

    // Cost efficiency: faster agents score higher (inverse of avg completion time)
    const avgMs = agent.avgCompletionMs ?? reputation?.avgCompletionMs ?? 30000
    const costEfficiency = Math.min(1, 10000 / Math.max(1, avgMs)) // 10s = 1.0, 30s = 0.33

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

    if (this.db) {
      try {
        // Append bid to the listing's bids jsonb array
        await this.db
          .update(marketListings)
          .set({
            bids: sql`${marketListings.bids} || ${JSON.stringify([bid])}::jsonb`,
          })
          .where(and(eq(marketListings.ticketId, ticketId), eq(marketListings.status, 'open')))

        // Upsert reputation: increment totalBids
        await this.upsertReputationBid(agent.agentId, agent.skills)
        return bid
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          'work-market: DB bid update failed, falling back to in-memory',
        )
      }
    }

    // In-memory fallback
    const listing = this.listings.get(ticketId)
    if (!listing || listing.status !== 'open') return null
    if (listing.bids.some((b) => b.agentId === agent.agentId)) return null

    listing.bids.push(bid)
    this.getOrCreateReputation(agent.agentId, agent.agentName, agent.skills).totalBids++
    return bid
  }

  /**
   * Award a listing to the highest-scoring bidder.
   */
  async award(ticketId: string): Promise<AgentBid | null> {
    if (this.db) {
      try {
        // Fetch listing from DB
        const [row] = await this.db
          .select()
          .from(marketListings)
          .where(and(eq(marketListings.ticketId, ticketId), eq(marketListings.status, 'open')))
          .limit(1)

        if (!row) return null
        const bids = (row.bids ?? []) as AgentBid[]
        if (bids.length === 0) return null

        // Sort by score descending
        bids.sort((a, b) => b.score - a.score)
        const winner = bids[0]!

        // Update listing status and winnerId
        await this.db
          .update(marketListings)
          .set({
            status: 'awarded',
            winnerId: winner.agentId,
          })
          .where(eq(marketListings.ticketId, ticketId))

        // Increment winner's totalWins
        await this.db
          .update(agentReputations)
          .set({
            totalWins: sql`${agentReputations.totalWins} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(agentReputations.agentId, winner.agentId))

        return winner
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          'work-market: DB award failed, falling back to in-memory',
        )
      }
    }

    // In-memory fallback
    const listing = this.listings.get(ticketId)
    if (!listing || listing.status !== 'open' || listing.bids.length === 0) return null

    listing.bids.sort((a, b) => b.score - a.score)
    const winner = listing.bids[0]!

    listing.winnerId = winner.agentId
    listing.status = 'awarded'

    const rep = this.reputations.get(winner.agentId)
    if (rep) rep.totalWins++

    return winner
  }

  /**
   * Process expired listings (auto-award to best bidder or expire).
   */
  async processExpired(): Promise<Array<{ ticketId: string; winnerId?: string }>> {
    const results: Array<{ ticketId: string; winnerId?: string }> = []

    if (this.db) {
      try {
        const now = new Date()

        // Find expired open listings
        const expiredRows = await this.db
          .select()
          .from(marketListings)
          .where(and(eq(marketListings.status, 'open'), lte(marketListings.expiresAt, now)))

        for (const row of expiredRows) {
          const bids = (row.bids ?? []) as AgentBid[]

          if (bids.length > 0) {
            // Award to highest bidder
            const winner = await this.award(row.ticketId)
            results.push({ ticketId: row.ticketId, winnerId: winner?.agentId })
          } else {
            // No bids — expire
            await this.db
              .update(marketListings)
              .set({ status: 'expired' })
              .where(eq(marketListings.ticketId, row.ticketId))
            results.push({ ticketId: row.ticketId })
          }
        }
        return results
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          'work-market: DB processExpired failed, falling back to in-memory',
        )
      }
    }

    // In-memory fallback
    const now = Date.now()
    for (const [ticketId, listing] of this.listings) {
      if (listing.status !== 'open') continue
      if (now < listing.expiresAt) continue

      if (listing.bids.length > 0) {
        const winner = await this.award(ticketId)
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
  async recordCompletion(agentId: string, success: boolean, durationMs: number): Promise<void> {
    if (this.db) {
      try {
        if (success) {
          await this.db
            .update(agentReputations)
            .set({
              totalCompletions: sql`${agentReputations.totalCompletions} + 1`,
              successRate: sql`CASE WHEN (${agentReputations.totalCompletions} + ${agentReputations.totalFailures} + 1) > 0
                THEN (${agentReputations.totalCompletions} + 1)::real / (${agentReputations.totalCompletions} + ${agentReputations.totalFailures} + 1)::real
                ELSE 0 END`,
              avgCompletionMs: sql`CASE WHEN ${agentReputations.avgCompletionMs} = 0
                THEN ${durationMs}
                ELSE ${agentReputations.avgCompletionMs} * 0.9 + ${durationMs} * 0.1 END`,
              updatedAt: new Date(),
            })
            .where(eq(agentReputations.agentId, agentId))
        } else {
          await this.db
            .update(agentReputations)
            .set({
              totalFailures: sql`${agentReputations.totalFailures} + 1`,
              successRate: sql`CASE WHEN (${agentReputations.totalCompletions} + ${agentReputations.totalFailures} + 1) > 0
                THEN ${agentReputations.totalCompletions}::real / (${agentReputations.totalCompletions} + ${agentReputations.totalFailures} + 1)::real
                ELSE 0 END`,
              avgCompletionMs: sql`CASE WHEN ${agentReputations.avgCompletionMs} = 0
                THEN ${durationMs}
                ELSE ${agentReputations.avgCompletionMs} * 0.9 + ${durationMs} * 0.1 END`,
              updatedAt: new Date(),
            })
            .where(eq(agentReputations.agentId, agentId))
        }

        // Invalidate cache
        this.reputationCache.delete(agentId)
        return
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          'work-market: DB recordCompletion failed, falling back to in-memory',
        )
      }
    }

    // In-memory fallback
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
  async getStats(): Promise<MarketStats> {
    if (this.db) {
      try {
        const allRows = await this.db.select().from(marketListings)
        const open = allRows.filter((l) => l.status === 'open')
        const awarded = allRows.filter((l) => l.status === 'awarded')
        const totalBids = allRows.reduce((a, l) => a + ((l.bids as AgentBid[]) ?? []).length, 0)

        const repRows = await this.db.select().from(agentReputations)
        const topAgents: AgentReputation[] = repRows
          .map((r) => ({
            agentId: r.agentId,
            agentName: r.agentId, // name not stored in reputation table
            totalBids: r.totalBids,
            totalWins: r.totalWins,
            totalCompletions: r.totalCompletions,
            totalFailures: r.totalFailures,
            winRate: r.totalBids > 0 ? r.totalWins / r.totalBids : 0,
            successRate: r.successRate,
            avgCompletionMs: r.avgCompletionMs,
            skills: r.skills ?? [],
          }))
          .sort((a, b) => b.successRate * b.totalWins - a.successRate * a.totalWins)
          .slice(0, 10)

        return {
          totalListings: allRows.length,
          openListings: open.length,
          awardedListings: awarded.length,
          avgBidsPerListing: allRows.length > 0 ? totalBids / allRows.length : 0,
          topAgents,
        }
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          'work-market: DB getStats failed, falling back to in-memory',
        )
      }
    }

    // In-memory fallback
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
  async getOpenListings(agentSkills?: string[]): Promise<MarketListing[]> {
    if (this.db) {
      try {
        const rows = await this.db
          .select()
          .from(marketListings)
          .where(eq(marketListings.status, 'open'))

        const listings: MarketListing[] = rows.map((r) => ({
          ticketId: r.ticketId,
          title: '', // title not stored in DB listing
          requiredSkills: [],
          priority: 'medium',
          complexity: 'medium' as const,
          listedAt: r.createdAt.getTime(),
          expiresAt: r.expiresAt.getTime(),
          bids: (r.bids ?? []) as AgentBid[],
          winnerId: r.winnerId ?? undefined,
          status: r.status as 'open' | 'awarded' | 'expired',
        }))

        if (agentSkills && agentSkills.length > 0) {
          return listings.filter(
            (l) =>
              l.requiredSkills.length === 0 ||
              this.calculateSkillMatch(l.requiredSkills, agentSkills) > 0.2,
          )
        }
        return listings
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          'work-market: DB getOpenListings failed, falling back to in-memory',
        )
      }
    }

    // In-memory fallback
    const skills = agentSkills ?? []
    return Array.from(this.listings.values())
      .filter((l) => l.status === 'open')
      .filter(
        (l) => skills.length === 0 || this.calculateSkillMatch(l.requiredSkills, skills) > 0.2,
      )
      .sort((a, b) => {
        const pOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
        return (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2)
      })
  }

  /**
   * Get agent reputation (with 60s in-memory cache for DB mode).
   */
  async getReputation(agentId: string): Promise<AgentReputation | undefined> {
    if (this.db) {
      // Check cache first
      const cached = this.reputationCache.get(agentId)
      if (cached && Date.now() - cached.cachedAt < REPUTATION_CACHE_TTL_MS) {
        return cached.rep
      }

      try {
        const [row] = await this.db
          .select()
          .from(agentReputations)
          .where(eq(agentReputations.agentId, agentId))
          .limit(1)

        if (!row) return undefined

        const rep: AgentReputation = {
          agentId: row.agentId,
          agentName: row.agentId,
          totalBids: row.totalBids,
          totalWins: row.totalWins,
          totalCompletions: row.totalCompletions,
          totalFailures: row.totalFailures,
          winRate: row.totalBids > 0 ? row.totalWins / row.totalBids : 0,
          successRate: row.successRate,
          avgCompletionMs: row.avgCompletionMs,
          skills: row.skills ?? [],
        }

        // Cache for 60s
        this.reputationCache.set(agentId, { rep, cachedAt: Date.now() })
        return rep
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          'work-market: DB getReputation failed, falling back to in-memory',
        )
      }
    }

    return this.reputations.get(agentId)
  }

  getAllReputations(): AgentReputation[] {
    return Array.from(this.reputations.values())
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private calculateSkillMatch(required: string[], agentSkills: string[]): number {
    if (required.length === 0) return 1 // no requirements = anyone can do it
    const agentSet = new Set(agentSkills.map((s) => s.toLowerCase()))
    const matched = required.filter((r) => agentSet.has(r.toLowerCase())).length
    return matched / required.length
  }

  private async getRequiredSkills(ticketId: string): Promise<string[]> {
    // For in-memory mode, get from listing
    const listing = this.listings.get(ticketId)
    if (listing) return listing.requiredSkills
    return []
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

  private async upsertReputationBid(agentId: string, skills: string[]): Promise<void> {
    if (!this.db) return

    try {
      // Try update first
      const result = await this.db
        .update(agentReputations)
        .set({
          totalBids: sql`${agentReputations.totalBids} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(agentReputations.agentId, agentId))
        .returning()

      if (result.length === 0) {
        // Insert new reputation record
        await this.db.insert(agentReputations).values({
          agentId,
          totalBids: 1,
          totalWins: 0,
          totalCompletions: 0,
          totalFailures: 0,
          successRate: 0.5,
          avgCompletionMs: 0,
          skills,
        })
      }

      // Invalidate cache
      this.reputationCache.delete(agentId)
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err : undefined },
        'work-market: reputation upsert failed',
      )
    }
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
