/**
 * Agent Routing Engine — adaptive routing using performance + specialization + context.
 *
 * Combines scorecard data, specialization signals, workspace context, and
 * optional instinct bias to produce explainable agent recommendations.
 *
 * Routing is ADVISORY — it suggests, never hard-assigns.
 *
 * Answers: "Who should do this work, in this workspace, and why?"
 */

import type { Database } from '@solarc/db'
import { agents, agentTrustScores, instincts } from '@solarc/db'
import { eq } from 'drizzle-orm'

import { type AgentScorecard, computeAgentScorecard } from './agent-scorecard'
import { type AgentSpecialization, computeAgentSpecialization } from './agent-specialization'

// ── Types ─────────────────────────────────────────────────────────────

export interface RoutingContext {
  workspaceId: string
  workflowName?: string
  taskType?: string // e.g. 'contract-review', 'natal-chart'
  preferredAgentIds?: string[]
}

export interface RoutingScore {
  agentId: string
  agentName: string
  score: number // 0-1 composite
  factors: {
    performance: number // from scorecard
    specialization: number // from specialization signals
    workspaceFit: number // workspace-specific quality
    collaborationFit: number // co-agent synergy
    instinctBias: number // optional instinct boost
  }
  reason: string
}

export interface RoutingRecommendation {
  primaryAgentId: string
  primaryAgentName: string
  primaryScore: number
  primaryReason: string
  candidateAgents: RoutingScore[]
  suggestedCollaborators: Array<{
    agentId: string
    agentName: string
    synergy: 'positive' | 'neutral'
    sharedRuns: number
    reason: string
  }>
  confidence: 'strong' | 'moderate' | 'early' | 'none'
  explanation: string
}

// ── Weights ──────────────────────────────────────────────────────────

const ROUTING_WEIGHTS = {
  performance: 0.3,
  specialization: 0.25,
  workspaceFit: 0.25,
  collaborationFit: 0.1,
  instinctBias: 0.1,
} as const

// ── Core Routing ─────────────────────────────────────────────────────

/**
 * Compute routing recommendations for a task in a workspace.
 * Scores all agents in the workspace, ranks them, and suggests collaborators.
 */
export async function computeRouting(
  db: Database,
  ctx: RoutingContext,
): Promise<RoutingRecommendation> {
  // Load all agents in the workspace
  const wsAgents = await db.query.agents.findMany({
    where: eq(agents.workspaceId, ctx.workspaceId),
  })

  if (wsAgents.length === 0) {
    return emptyRecommendation('No agents in this workspace')
  }

  // Load scorecards and specializations in parallel
  const [scorecards, specializations, instinctBoost] = await Promise.all([
    Promise.all(wsAgents.map((a) => computeAgentScorecard(db, a.id))),
    Promise.all(wsAgents.map((a) => computeAgentSpecialization(db, a.id))),
    getRoutingInstinctBoost(db, ctx),
  ])

  const scorecardMap = new Map<string, AgentScorecard>()
  for (const sc of scorecards) {
    if (sc) scorecardMap.set(sc.agentId, sc)
  }
  const specMap = new Map<string, AgentSpecialization>()
  for (const sp of specializations) {
    if (sp) specMap.set(sp.agentId, sp)
  }

  // Score each agent
  const scores: RoutingScore[] = wsAgents.map((agent) => {
    const sc = scorecardMap.get(agent.id)
    const spec = specMap.get(agent.id)

    const performance = scorePerformance(sc)
    const specialization = scoreSpecialization(spec, ctx)
    const workspaceFit = scoreWorkspaceFit(sc, spec)
    const collaborationFit = scoreCollaboration(spec, ctx.preferredAgentIds)
    const instinct = instinctBoost.get(agent.id) ?? 0

    const composite =
      performance * ROUTING_WEIGHTS.performance +
      specialization * ROUTING_WEIGHTS.specialization +
      workspaceFit * ROUTING_WEIGHTS.workspaceFit +
      collaborationFit * ROUTING_WEIGHTS.collaborationFit +
      instinct * ROUTING_WEIGHTS.instinctBias

    const reason = buildReason(
      agent.name,
      {
        performance,
        specialization,
        workspaceFit,
        collaborationFit,
        instinctBias: instinct,
      },
      sc,
      spec,
      ctx,
    )

    return {
      agentId: agent.id,
      agentName: agent.name,
      score: Math.round(composite * 1000) / 1000,
      factors: {
        performance: round2(performance),
        specialization: round2(specialization),
        workspaceFit: round2(workspaceFit),
        collaborationFit: round2(collaborationFit),
        instinctBias: round2(instinct),
      },
      reason,
    }
  })

  // Rank by score descending
  scores.sort((a, b) => b.score - a.score)

  const primary = scores[0]!
  const confidence = computeConfidence(scorecardMap, wsAgents.length)

  // Find best collaborators from the primary agent's specialization
  const primarySpec = specMap.get(primary.agentId)
  const suggestedCollaborators = buildCollaboratorSuggestions(primarySpec)

  const explanation = buildExplanation(primary, scores.length, confidence, ctx)

  return {
    primaryAgentId: primary.agentId,
    primaryAgentName: primary.agentName,
    primaryScore: primary.score,
    primaryReason: primary.reason,
    candidateAgents: scores,
    suggestedCollaborators,
    confidence,
    explanation,
  }
}

// ── Factor Scoring ───────────────────────────────────────────────────

function scorePerformance(sc: AgentScorecard | undefined): number {
  if (!sc || sc.totalRuns === 0) return 0.5 // neutral for no data
  // Blend success rate (60%) and quality (40%)
  const quality = sc.avgQualityScore ?? 0.5
  const base = sc.successRate * 0.6 + quality * 0.4
  // Trend bonus/penalty
  const trendBonus = sc.trend === 'improving' ? 0.05 : sc.trend === 'declining' ? -0.05 : 0
  return clamp(base + trendBonus)
}

function scoreSpecialization(spec: AgentSpecialization | undefined, ctx: RoutingContext): number {
  if (!spec) return 0.5

  let best = 0.5

  // Workflow match
  if (ctx.workflowName) {
    const match = spec.workflowAffinities.find(
      (w) => w.label.toLowerCase() === ctx.workflowName!.toLowerCase(),
    )
    if (match && match.confidence !== 'early') {
      best = Math.max(best, match.score)
    }
  }

  // Task type match against tool proficiencies and workflow affinities
  if (ctx.taskType) {
    const taskLower = ctx.taskType.toLowerCase()
    for (const wf of spec.workflowAffinities) {
      if (wf.label.toLowerCase().includes(taskLower) && wf.confidence !== 'early') {
        best = Math.max(best, wf.score)
      }
    }
    for (const tp of spec.toolProficiencies) {
      if (tp.label.toLowerCase().includes(taskLower) && tp.confidence !== 'early') {
        best = Math.max(best, tp.score)
      }
    }
  }

  // Penalty for weak contexts
  if (ctx.workflowName) {
    const weak = spec.weakContexts.find(
      (w) => w.label.toLowerCase() === ctx.workflowName!.toLowerCase(),
    )
    if (weak) {
      best = Math.min(best, 0.4)
    }
  }

  return clamp(best)
}

function scoreWorkspaceFit(
  sc: AgentScorecard | undefined,
  spec: AgentSpecialization | undefined,
): number {
  if (!sc || sc.totalRuns === 0) return 0.5

  // Use workspace strength signal if available
  if (spec && spec.workspaceStrengths.length > 0) {
    const ws = spec.workspaceStrengths[0]!
    if (ws.confidence !== 'early') return clamp(ws.score)
  }

  // Fallback to scorecard success rate
  return clamp(sc.successRate)
}

function scoreCollaboration(
  spec: AgentSpecialization | undefined,
  preferredAgentIds?: string[],
): number {
  if (!spec || spec.collaborators.length === 0) return 0.5

  if (preferredAgentIds && preferredAgentIds.length > 0) {
    // Check if any preferred agents have positive synergy
    const preferred = spec.collaborators.filter(
      (c) => preferredAgentIds.includes(c.agentId) && c.synergy === 'positive',
    )
    if (preferred.length > 0) return 0.8
    const negative = spec.collaborators.filter(
      (c) => preferredAgentIds.includes(c.agentId) && c.synergy === 'negative',
    )
    if (negative.length > 0) return 0.3
  }

  // General collaboration health
  const positive = spec.collaborators.filter((c) => c.synergy === 'positive').length
  const total = spec.collaborators.length
  return clamp(0.5 + (positive / total) * 0.3)
}

// ── Instinct Boost ───────────────────────────────────────────────────

async function getRoutingInstinctBoost(
  db: Database,
  ctx: RoutingContext,
): Promise<Map<string, number>> {
  const boosts = new Map<string, number>()

  try {
    const promoted = await db.query.instincts.findMany({
      where: eq(instincts.status, 'promoted'),
      limit: 20,
    })

    if (promoted.length === 0) return boosts

    // Match instincts that relate to routing/agent selection
    const relevant = promoted.filter((i) => {
      const trigger = (i.trigger ?? '').toLowerCase()
      return (
        trigger.includes('route') ||
        trigger.includes('assign') ||
        trigger.includes('agent') ||
        (ctx.workflowName && trigger.includes(ctx.workflowName.toLowerCase())) ||
        (ctx.taskType && trigger.includes(ctx.taskType.toLowerCase()))
      )
    })

    // Load trust scores for boost mapping
    if (relevant.length > 0) {
      const wsAgents = await db.query.agents.findMany({
        where: eq(agents.workspaceId, ctx.workspaceId),
      })
      for (const agent of wsAgents) {
        const trust = await db.query.agentTrustScores.findFirst({
          where: eq(agentTrustScores.agentId, agent.id),
        })
        // Agents with high trust get a small instinct-based boost (max 0.1)
        if (trust && trust.score > 0.7) {
          boosts.set(agent.id, Math.min(0.1, (trust.score - 0.7) * 0.33))
        }
      }
    }
  } catch {
    // Instinct boost is non-blocking
  }

  return boosts
}

// ── Confidence ───────────────────────────────────────────────────────

function computeConfidence(
  scorecardMap: Map<string, AgentScorecard>,
  agentCount: number,
): RoutingRecommendation['confidence'] {
  if (agentCount === 0) return 'none'

  const withData = [...scorecardMap.values()].filter((sc) => sc.totalRuns > 0)
  if (withData.length === 0) return 'none'

  const totalRuns = withData.reduce((sum, sc) => sum + sc.totalRuns, 0)
  const strongAgents = withData.filter((sc) => sc.dataConfidence === 'strong').length

  if (totalRuns >= 20 && strongAgents >= 2) return 'strong'
  if (totalRuns >= 5 && withData.length >= 2) return 'moderate'
  return 'early'
}

// ── Collaboration Suggestions ────────────────────────────────────────

function buildCollaboratorSuggestions(
  spec: AgentSpecialization | undefined,
): RoutingRecommendation['suggestedCollaborators'] {
  if (!spec) return []

  return spec.collaborators
    .filter((c) => c.synergy === 'positive' || (c.synergy === 'neutral' && c.sharedRuns >= 5))
    .slice(0, 5)
    .map((c) => ({
      agentId: c.agentId,
      agentName: c.agentName,
      synergy: c.synergy === 'positive' ? ('positive' as const) : ('neutral' as const),
      sharedRuns: c.sharedRuns,
      reason:
        c.synergy === 'positive'
          ? `Quality improves to ${c.avgQuality != null ? Math.round(c.avgQuality * 100) + '%' : 'above average'} when paired (${c.sharedRuns} shared runs)`
          : `Frequent collaborator (${c.sharedRuns} shared runs)`,
    }))
}

// ── Explainability ───────────────────────────────────────────────────

function buildReason(
  _name: string,
  factors: RoutingScore['factors'],
  sc: AgentScorecard | undefined,
  _spec: AgentSpecialization | undefined,
  ctx: RoutingContext,
): string {
  const parts: string[] = []

  if (factors.performance >= 0.7 && sc) {
    parts.push(`${Math.round(sc.successRate * 100)}% success rate`)
  }
  if (factors.specialization >= 0.7 && ctx.workflowName) {
    parts.push(`strong in ${ctx.workflowName}`)
  }
  if (factors.workspaceFit >= 0.7 && sc?.avgQualityScore) {
    parts.push(`${Math.round(sc.avgQualityScore * 100)}% quality`)
  }
  if (factors.collaborationFit >= 0.7) {
    parts.push('good collaborator')
  }
  if (sc && sc.trend === 'improving') {
    parts.push('trending up')
  }

  if (parts.length === 0) {
    if (!sc || sc.totalRuns === 0) return 'New agent — no performance data yet'
    return 'Average performance across signals'
  }

  return parts.join(', ')
}

function buildExplanation(
  primary: RoutingScore,
  totalCandidates: number,
  confidence: RoutingRecommendation['confidence'],
  ctx: RoutingContext,
): string {
  const confLabel =
    confidence === 'strong'
      ? 'High confidence'
      : confidence === 'moderate'
        ? 'Moderate confidence'
        : confidence === 'early'
          ? 'Limited data'
          : 'No data'

  const context = ctx.workflowName
    ? ` for ${ctx.workflowName}`
    : ctx.taskType
      ? ` for ${ctx.taskType} tasks`
      : ''

  return `${confLabel}: Recommended ${primary.agentName}${context} — ${primary.reason}. Evaluated ${totalCandidates} candidate${totalCandidates !== 1 ? 's' : ''}.`
}

// ── Helpers ──────────────────────────────────────────────────────────

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function emptyRecommendation(reason: string): RoutingRecommendation {
  return {
    primaryAgentId: '',
    primaryAgentName: '',
    primaryScore: 0,
    primaryReason: reason,
    candidateAgents: [],
    suggestedCollaborators: [],
    confidence: 'none',
    explanation: reason,
  }
}
