/**
 * Workforce Intelligence — workspace-level agent analytics.
 *
 * Computes:
 * - Top agents per workspace (ranked by composite quality)
 * - Strong agent pairs (positive synergy from collaboration data)
 * - Weak coverage areas (workflows/tools with no strong agent)
 * - Agent pairing recommendations for a specific agent
 *
 * All signals are derived from real execution data via scorecard + specialization.
 */

import type { Database } from '@solarc/db'
import { agents } from '@solarc/db'
import { eq } from 'drizzle-orm'

import { type AgentScorecard, computeAgentScorecard } from './agent-scorecard'
import { type AgentSpecialization, computeAgentSpecialization } from './agent-specialization'

// ── Types ─────────────────────────────────────────────────────────────

export interface WorkforceInsight {
  workspaceId: string
  topAgents: Array<{
    agentId: string
    agentName: string
    score: number
    runs: number
    topStrength: string | null
  }>
  strongPairs: Array<{
    agentA: { id: string; name: string }
    agentB: { id: string; name: string }
    sharedRuns: number
    avgQuality: number | null
  }>
  weakCoverage: Array<{
    area: string
    type: 'workflow' | 'tool'
    bestScore: number
    bestAgentName: string | null
    warning: string
  }>
  totalAgents: number
  agentsWithData: number
  summary: string
}

export interface AgentPairing {
  agentId: string
  agentName: string
  pairings: Array<{
    partnerId: string
    partnerName: string
    synergy: 'positive' | 'neutral' | 'negative'
    sharedRuns: number
    avgQuality: number | null
    recommendation: string
  }>
}

// ── Core Analysis ────────────────────────────────────────────────────

/**
 * Compute comprehensive workforce insights for a workspace.
 */
export async function computeWorkforceInsights(
  db: Database,
  workspaceId: string,
): Promise<WorkforceInsight> {
  const wsAgents = await db.query.agents.findMany({
    where: eq(agents.workspaceId, workspaceId),
  })

  if (wsAgents.length === 0) {
    return {
      workspaceId,
      topAgents: [],
      strongPairs: [],
      weakCoverage: [],
      totalAgents: 0,
      agentsWithData: 0,
      summary: 'No agents in this workspace.',
    }
  }

  // Load all scorecards and specializations
  const [scorecards, specializations] = await Promise.all([
    Promise.all(wsAgents.map((a) => computeAgentScorecard(db, a.id))),
    Promise.all(wsAgents.map((a) => computeAgentSpecialization(db, a.id))),
  ])

  const scMap = new Map<string, AgentScorecard>()
  for (const sc of scorecards) {
    if (sc) scMap.set(sc.agentId, sc)
  }
  const specMap = new Map<string, AgentSpecialization>()
  for (const sp of specializations) {
    if (sp) specMap.set(sp.agentId, sp)
  }

  const agentsWithData = [...scMap.values()].filter((sc) => sc.totalRuns > 0).length

  // ── Top Agents ──────────────────────────────────────────────────
  const topAgents = wsAgents
    .map((a) => {
      const sc = scMap.get(a.id)
      const spec = specMap.get(a.id)
      const quality = sc?.avgQualityScore ?? 0
      const success = sc?.successRate ?? 0
      const composite = success * 0.5 + quality * 0.5
      return {
        agentId: a.id,
        agentName: a.name,
        score: Math.round(composite * 100) / 100,
        runs: sc?.totalRuns ?? 0,
        topStrength: spec?.topStrength ?? null,
      }
    })
    .filter((a) => a.runs > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  // ── Strong Pairs ────────────────────────────────────────────────
  const pairMap = new Map<
    string,
    { a: string; aName: string; b: string; bName: string; runs: number; quality: number | null }
  >()

  for (const [agentId, spec] of specMap) {
    for (const collab of spec.collaborators) {
      if (collab.synergy !== 'positive') continue
      // Canonical pair key (sorted IDs to avoid duplicates)
      const [first, second] = [agentId, collab.agentId].sort()
      const key = `${first}:${second}`
      if (!pairMap.has(key)) {
        pairMap.set(key, {
          a: first!,
          aName: first === agentId ? spec.agentName : collab.agentName,
          b: second!,
          bName: second === collab.agentId ? collab.agentName : spec.agentName,
          runs: collab.sharedRuns,
          quality: collab.avgQuality,
        })
      }
    }
  }

  const strongPairs = [...pairMap.values()]
    .sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0))
    .slice(0, 10)
    .map((p) => ({
      agentA: { id: p.a, name: p.aName },
      agentB: { id: p.b, name: p.bName },
      sharedRuns: p.runs,
      avgQuality: p.quality,
    }))

  // ── Weak Coverage ───────────────────────────────────────────────
  // Collect all workflow/tool areas across all agents
  const areaScores = new Map<
    string,
    { type: 'workflow' | 'tool'; bestScore: number; bestAgent: string | null }
  >()

  for (const spec of specMap.values()) {
    for (const wf of spec.workflowAffinities) {
      const existing = areaScores.get(`wf:${wf.label}`)
      if (!existing || wf.score > existing.bestScore) {
        areaScores.set(`wf:${wf.label}`, {
          type: 'workflow',
          bestScore: wf.score,
          bestAgent: spec.agentName,
        })
      }
    }
    for (const tp of spec.toolProficiencies) {
      const existing = areaScores.get(`tool:${tp.label}`)
      if (!existing || tp.score > existing.bestScore) {
        areaScores.set(`tool:${tp.label}`, {
          type: 'tool',
          bestScore: tp.score,
          bestAgent: spec.agentName,
        })
      }
    }
  }

  const weakCoverage = [...areaScores.entries()]
    .filter(([, v]) => v.bestScore < 0.5)
    .map(([key, v]) => {
      const area = key.replace(/^(wf|tool):/, '')
      return {
        area,
        type: v.type,
        bestScore: Math.round(v.bestScore * 100) / 100,
        bestAgentName: v.bestAgent,
        warning:
          v.bestScore < 0.3
            ? `No agent performs well in "${area}" — best is ${Math.round(v.bestScore * 100)}%`
            : `Limited coverage for "${area}" — best agent scores ${Math.round(v.bestScore * 100)}%`,
      }
    })
    .sort((a, b) => a.bestScore - b.bestScore)
    .slice(0, 10)

  // ── Summary ─────────────────────────────────────────────────────
  const summaryParts: string[] = []
  summaryParts.push(`${wsAgents.length} agents, ${agentsWithData} with execution data`)
  if (topAgents.length > 0) {
    summaryParts.push(
      `top performer: ${topAgents[0]!.agentName} (${Math.round(topAgents[0]!.score * 100)}%)`,
    )
  }
  if (strongPairs.length > 0) {
    summaryParts.push(`${strongPairs.length} strong pair${strongPairs.length !== 1 ? 's' : ''}`)
  }
  if (weakCoverage.length > 0) {
    summaryParts.push(`${weakCoverage.length} weak area${weakCoverage.length !== 1 ? 's' : ''}`)
  }

  return {
    workspaceId,
    topAgents,
    strongPairs,
    weakCoverage,
    totalAgents: wsAgents.length,
    agentsWithData,
    summary: summaryParts.join(' | '),
  }
}

// ── Agent Pairings ───────────────────────────────────────────────────

/**
 * Get collaboration pairings for a specific agent — who works well with them.
 */
export async function computeAgentPairings(
  db: Database,
  agentId: string,
): Promise<AgentPairing | null> {
  const spec = await computeAgentSpecialization(db, agentId)
  if (!spec) return null

  const pairings = spec.collaborators.map((c) => ({
    partnerId: c.agentId,
    partnerName: c.agentName,
    synergy: c.synergy,
    sharedRuns: c.sharedRuns,
    avgQuality: c.avgQuality,
    recommendation:
      c.synergy === 'positive'
        ? `Strong pairing — quality improves when working together (${c.sharedRuns} shared runs)`
        : c.synergy === 'negative'
          ? `Avoid pairing — quality drops when working together (${c.sharedRuns} shared runs)`
          : `Neutral pairing — no significant quality change (${c.sharedRuns} shared runs)`,
  }))

  return {
    agentId,
    agentName: spec.agentName,
    pairings: pairings.sort((a, b) => {
      const order = { positive: 0, neutral: 1, negative: 2 }
      return order[a.synergy] - order[b.synergy]
    }),
  }
}
