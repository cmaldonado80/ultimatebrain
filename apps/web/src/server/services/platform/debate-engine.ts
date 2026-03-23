/**
 * Constitutional Debate Engine
 *
 * Structured argumentation framework:
 * - Session management with constitutional rules
 * - Argument graph (nodes + support/attack/rebuttal edges)
 * - Validity scoring for arguments
 * - Elo rating system for agent debate performance
 * - Arbitration: determine winning position
 */

import type { Database } from '@solarc/db'
import { debateSessions, debateNodes, debateEdges, debateElo } from '@solarc/db'
import { eq, and, desc, sql } from 'drizzle-orm'

export type DebateStatus = 'active' | 'completed' | 'cancelled'
export type EdgeType = 'support' | 'attack' | 'rebuttal'

export interface ConstitutionalRule {
  name: string
  description: string
  weight: number
}

export interface DebateArgument {
  id: string
  agentId: string | null
  text: string
  validity: number | null
  parentId: string | null
  isAxiom: boolean
  createdAt: Date
}

export interface DebateSessionFull {
  id: string
  projectId: string | null
  status: string
  constitutionalRules: ConstitutionalRule[]
  nodes: DebateArgument[]
  edges: Array<{ fromNodeId: string; toNodeId: string; type: EdgeType }>
  createdAt: Date
}

/** K-factor for Elo calculations */
const ELO_K = 32

export class DebateEngine {
  constructor(private db: Database) {}

  /**
   * Create a new debate session with constitutional rules.
   */
  async createSession(
    projectId?: string,
    rules?: ConstitutionalRule[],
  ) {
    const [session] = await this.db.insert(debateSessions).values({
      projectId,
      status: 'active',
      constitutionalRules: rules ?? [],
    }).returning()
    return session!
  }

  /**
   * Submit an argument to a debate session.
   */
  async submitArgument(
    sessionId: string,
    agentId: string,
    text: string,
    options?: { parentId?: string; isAxiom?: boolean; validity?: number },
  ): Promise<DebateArgument> {
    const [node] = await this.db.insert(debateNodes).values({
      sessionId,
      agentId,
      text,
      parentId: options?.parentId,
      isAxiom: options?.isAxiom ?? false,
      validity: options?.validity,
    }).returning()

    return {
      id: node!.id,
      agentId: node!.agentId,
      text: node!.text,
      validity: node!.validity,
      parentId: node!.parentId,
      isAxiom: node!.isAxiom ?? false,
      createdAt: node!.createdAt,
    }
  }

  /**
   * Add an edge between two arguments.
   */
  async addEdge(fromNodeId: string, toNodeId: string, type: EdgeType): Promise<void> {
    await this.db.insert(debateEdges).values({ fromNodeId, toNodeId, type })
  }

  /**
   * Support: fromNode supports toNode.
   */
  async support(fromNodeId: string, toNodeId: string): Promise<void> {
    await this.addEdge(fromNodeId, toNodeId, 'support')
  }

  /**
   * Attack: fromNode attacks toNode.
   */
  async attack(fromNodeId: string, toNodeId: string): Promise<void> {
    await this.addEdge(fromNodeId, toNodeId, 'attack')
  }

  /**
   * Rebuttal: fromNode rebuts toNode.
   */
  async rebut(fromNodeId: string, toNodeId: string): Promise<void> {
    await this.addEdge(fromNodeId, toNodeId, 'rebuttal')
  }

  /**
   * Score argument validity based on support/attack graph.
   * Support adds to validity, attacks subtract, rebuttals partially counter attacks.
   */
  async scoreArgument(nodeId: string): Promise<number> {
    const edges = await this.db
      .select()
      .from(debateEdges)
      .where(eq(debateEdges.toNodeId, nodeId))

    let score = 0.5 // Base validity

    for (const edge of edges) {
      // Get source node validity
      const sourceNode = await this.db.query.debateNodes.findFirst({
        where: eq(debateNodes.id, edge.fromNodeId),
      })
      const sourceValidity = sourceNode?.validity ?? 0.5

      switch (edge.type) {
        case 'support':
          score += 0.15 * sourceValidity
          break
        case 'attack':
          score -= 0.2 * sourceValidity
          break
        case 'rebuttal':
          score += 0.1 * sourceValidity
          break
      }
    }

    const clamped = Math.max(0, Math.min(1, score))

    // Persist the computed validity
    await this.db.update(debateNodes).set({ validity: clamped })
      .where(eq(debateNodes.id, nodeId))

    return clamped
  }

  /**
   * Score all arguments in a session.
   */
  async scoreSession(sessionId: string): Promise<Map<string, number>> {
    const nodes = await this.db.query.debateNodes.findMany({
      where: eq(debateNodes.sessionId, sessionId),
    })

    const scores = new Map<string, number>()
    for (const node of nodes) {
      const score = await this.scoreArgument(node.id)
      scores.set(node.id, score)
    }
    return scores
  }

  /**
   * Get a full debate session with nodes and edges.
   */
  async getSession(sessionId: string): Promise<DebateSessionFull | null> {
    const session = await this.db.query.debateSessions.findFirst({
      where: eq(debateSessions.id, sessionId),
    })
    if (!session) return null

    const nodes = await this.db.query.debateNodes.findMany({
      where: eq(debateNodes.sessionId, sessionId),
    })

    const nodeIds = nodes.map((n) => n.id)
    let edges: Array<typeof debateEdges.$inferSelect> = []
    if (nodeIds.length > 0) {
      edges = await this.db.select().from(debateEdges).where(
        sql`${debateEdges.fromNodeId} = ANY(${nodeIds}) OR ${debateEdges.toNodeId} = ANY(${nodeIds})`,
      )
    }

    return {
      id: session.id,
      projectId: session.projectId,
      status: session.status,
      constitutionalRules: (session.constitutionalRules as ConstitutionalRule[]) ?? [],
      nodes: nodes.map((n) => ({
        id: n.id,
        agentId: n.agentId,
        text: n.text,
        validity: n.validity,
        parentId: n.parentId,
        isAxiom: n.isAxiom ?? false,
        createdAt: n.createdAt,
      })),
      edges: edges.map((e) => ({
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        type: e.type as EdgeType,
      })),
      createdAt: session.createdAt,
    }
  }

  /**
   * Complete a debate session and update Elo ratings.
   */
  async completeSession(
    sessionId: string,
    winnerId?: string,
    loserId?: string,
  ): Promise<void> {
    await this.db.update(debateSessions).set({ status: 'completed' })
      .where(eq(debateSessions.id, sessionId))

    if (winnerId && loserId) {
      await this.updateElo(winnerId, loserId)
    }
  }

  /**
   * Cancel a debate session.
   */
  async cancelSession(sessionId: string): Promise<void> {
    await this.db.update(debateSessions).set({ status: 'cancelled' })
      .where(eq(debateSessions.id, sessionId))
  }

  // === Elo Rating System ===

  /**
   * Get an agent's debate Elo rating.
   */
  async getElo(agentId: string): Promise<{ eloRating: number; matches: number; wins: number }> {
    const row = await this.db.query.debateElo.findFirst({
      where: eq(debateElo.agentId, agentId),
    })
    return {
      eloRating: row?.eloRating ?? 1200,
      matches: row?.matches ?? 0,
      wins: row?.wins ?? 0,
    }
  }

  /**
   * Update Elo ratings after a debate (winner/loser).
   */
  async updateElo(winnerId: string, loserId: string): Promise<{ winnerElo: number; loserElo: number }> {
    const winner = await this.getElo(winnerId)
    const loser = await this.getElo(loserId)

    const expectedWinner = 1 / (1 + Math.pow(10, (loser.eloRating - winner.eloRating) / 400))
    const expectedLoser = 1 - expectedWinner

    const newWinnerElo = Math.round(winner.eloRating + ELO_K * (1 - expectedWinner))
    const newLoserElo = Math.round(loser.eloRating + ELO_K * (0 - expectedLoser))

    await this.upsertElo(winnerId, newWinnerElo, winner.matches + 1, winner.wins + 1)
    await this.upsertElo(loserId, newLoserElo, loser.matches + 1, loser.wins)

    return { winnerElo: newWinnerElo, loserElo: newLoserElo }
  }

  private async upsertElo(agentId: string, rating: number, matches: number, wins: number): Promise<void> {
    const existing = await this.db.query.debateElo.findFirst({
      where: eq(debateElo.agentId, agentId),
    })

    if (existing) {
      await this.db.update(debateElo).set({
        eloRating: rating,
        matches,
        wins,
        updatedAt: new Date(),
      }).where(eq(debateElo.agentId, agentId))
    } else {
      await this.db.insert(debateElo).values({
        agentId,
        eloRating: rating,
        matches,
        wins,
      })
    }
  }

  /**
   * Get Elo leaderboard.
   */
  async leaderboard(limit = 20) {
    return this.db.query.debateElo.findMany({
      orderBy: desc(debateElo.eloRating),
      limit,
    })
  }
}
