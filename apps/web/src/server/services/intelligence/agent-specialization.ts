/**
 * Agent Specialization Detection — discover contextual strengths from execution data.
 *
 * Answers: "What is this agent good at?", "Where does it perform best?",
 * "Who does it work well with?"
 *
 * Dimensions:
 *  1. Workspace strength — quality/success per workspace
 *  2. Workflow affinity — which workflows this agent excels in
 *  3. Tool proficiency — which tools it uses effectively
 *  4. Collaboration — which co-agents correlate with high quality
 *  5. Weak contexts — where performance drops
 */

import type { Database } from '@solarc/db'
import { agents, chatRuns, chatRunSteps, runQuality } from '@solarc/db'
import { desc, eq, sql } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export interface StrengthSignal {
  label: string
  score: number // 0-1
  runs: number
  confidence: 'strong' | 'moderate' | 'early'
}

export interface CollaboratorSignal {
  agentId: string
  agentName: string
  sharedRuns: number
  avgQuality: number | null
  synergy: 'positive' | 'neutral' | 'negative'
}

export interface AgentSpecialization {
  agentId: string
  agentName: string
  workspaceStrengths: StrengthSignal[]
  workflowAffinities: StrengthSignal[]
  toolProficiencies: StrengthSignal[]
  collaborators: CollaboratorSignal[]
  weakContexts: StrengthSignal[]
  topStrength: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────

function confidence(runs: number): StrengthSignal['confidence'] {
  return runs >= 8 ? 'strong' : runs >= 3 ? 'moderate' : 'early'
}

// ── Core Detection ────────────────────────────────────────────────────

/**
 * Detect specialization patterns for a single agent from execution history.
 */
export async function computeAgentSpecialization(
  db: Database,
  agentId: string,
): Promise<AgentSpecialization | null> {
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) return null

  // Load recent steps for this agent
  const steps = await db.query.chatRunSteps.findMany({
    where: eq(chatRunSteps.agentId, agentId),
    orderBy: desc(chatRunSteps.startedAt),
    limit: 1000,
  })

  if (steps.length === 0) {
    return {
      agentId,
      agentName: agent.name,
      workspaceStrengths: [],
      workflowAffinities: [],
      toolProficiencies: [],
      collaborators: [],
      weakContexts: [],
      topStrength: null,
    }
  }

  // Load associated runs + quality
  const runIds = [...new Set(steps.map((s) => s.runId))]
  const runs = await db.query.chatRuns.findMany({
    where: sql`${chatRuns.id} = ANY(${runIds})`,
  })
  const qualities = await db.query.runQuality.findMany({
    where: sql`${runQuality.runId} = ANY(${runIds})`,
  })

  const qualityMap = new Map(qualities.map((q) => [q.runId, q.score]))

  // ── 1. Workflow Affinity ──────────────────────────────────────────
  const workflowBuckets = new Map<
    string,
    { runs: number; qualitySum: number; qualityCount: number }
  >()
  for (const run of runs) {
    const wf = run.workflowName ?? 'default'
    const bucket = workflowBuckets.get(wf) ?? { runs: 0, qualitySum: 0, qualityCount: 0 }
    bucket.runs++
    const q = qualityMap.get(run.id)
    if (q != null) {
      bucket.qualitySum += q
      bucket.qualityCount++
    }
    workflowBuckets.set(wf, bucket)
  }

  const workflowAffinities: StrengthSignal[] = [...workflowBuckets.entries()]
    .filter(([, b]) => b.runs >= 2)
    .map(([label, b]) => ({
      label,
      score: b.qualityCount > 0 ? Math.round((b.qualitySum / b.qualityCount) * 100) / 100 : 0.5,
      runs: b.runs,
      confidence: confidence(b.runs),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  // ── 2. Tool Proficiency ───────────────────────────────────────────
  const toolBuckets = new Map<string, { total: number; succeeded: number }>()
  for (const step of steps) {
    if (step.type !== 'tool' || !step.toolName) continue
    const bucket = toolBuckets.get(step.toolName) ?? { total: 0, succeeded: 0 }
    bucket.total++
    if (step.status === 'completed') bucket.succeeded++
    toolBuckets.set(step.toolName, bucket)
  }

  const toolProficiencies: StrengthSignal[] = [...toolBuckets.entries()]
    .filter(([, b]) => b.total >= 2)
    .map(([label, b]) => ({
      label,
      score: Math.round((b.succeeded / b.total) * 100) / 100,
      runs: b.total,
      confidence: confidence(b.total),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)

  // ── 3. Collaboration Detection ────────────────────────────────────
  // Find co-agents: other agents that appeared in the same runs
  const coAgentBuckets = new Map<
    string,
    { agentName: string; sharedRuns: number; qualitySum: number; qualityCount: number }
  >()
  for (const run of runs) {
    const coAgents = (run.agentIds ?? []).filter((id) => id !== agentId)
    const q = qualityMap.get(run.id)
    for (const coId of coAgents) {
      const bucket = coAgentBuckets.get(coId) ?? {
        agentName: '',
        sharedRuns: 0,
        qualitySum: 0,
        qualityCount: 0,
      }
      bucket.sharedRuns++
      if (q != null) {
        bucket.qualitySum += q
        bucket.qualityCount++
      }
      coAgentBuckets.set(coId, bucket)
    }
  }

  // Resolve names for co-agents
  const coAgentIds = [...coAgentBuckets.keys()]
  if (coAgentIds.length > 0) {
    const coAgents = await db.query.agents.findMany({
      where: sql`${agents.id} = ANY(${coAgentIds})`,
    })
    for (const a of coAgents) {
      const b = coAgentBuckets.get(a.id)
      if (b) b.agentName = a.name
    }
  }

  // Overall average quality for this agent (baseline for synergy comparison)
  const allQualities = [...qualityMap.values()]
  const overallAvg =
    allQualities.length > 0 ? allQualities.reduce((a, b) => a + b, 0) / allQualities.length : 0.5

  const collaborators: CollaboratorSignal[] = [...coAgentBuckets.entries()]
    .filter(([, b]) => b.sharedRuns >= 2)
    .map(([coId, b]) => {
      const avgQ = b.qualityCount > 0 ? b.qualitySum / b.qualityCount : null
      const synergy: CollaboratorSignal['synergy'] =
        avgQ == null
          ? 'neutral'
          : avgQ > overallAvg + 0.08
            ? 'positive'
            : avgQ < overallAvg - 0.08
              ? 'negative'
              : 'neutral'
      return {
        agentId: coId,
        agentName: b.agentName || coId.slice(0, 8),
        sharedRuns: b.sharedRuns,
        avgQuality: avgQ != null ? Math.round(avgQ * 100) / 100 : null,
        synergy,
      }
    })
    .sort((a, b) => (b.avgQuality ?? 0) - (a.avgQuality ?? 0))
    .slice(0, 10)

  // ── 4. Workspace Strength ─────────────────────────────────────────
  // Group runs by workspace (via chatRuns.sessionId → chatSessions.workspaceId would be ideal
  // but we use agent.workspaceId as the primary scope since agents are workspace-bound)
  // For multi-workspace agents, we group by workflowName as a proxy
  const workspaceStrengths: StrengthSignal[] = []
  if (agent.workspaceId) {
    // Single workspace agent — its workspace IS its context
    const wsRuns = runs.filter((r) => r.status === 'completed' || r.status === 'failed')
    const wsCompleted = wsRuns.filter((r) => r.status === 'completed').length
    const wsQuality = wsRuns.map((r) => qualityMap.get(r.id)).filter((q): q is number => q != null)
    const avgQ =
      wsQuality.length > 0
        ? Math.round((wsQuality.reduce((a, b) => a + b, 0) / wsQuality.length) * 100) / 100
        : null
    workspaceStrengths.push({
      label: agent.workspaceId,
      score: avgQ ?? (wsRuns.length > 0 ? wsCompleted / wsRuns.length : 0.5),
      runs: wsRuns.length,
      confidence: confidence(wsRuns.length),
    })
  }

  // ── 5. Weak Contexts ──────────────────────────────────────────────
  const weakContexts: StrengthSignal[] = [
    ...workflowAffinities.filter((w) => w.score < 0.4 && w.runs >= 3),
    ...toolProficiencies.filter((t) => t.score < 0.5 && t.runs >= 3),
  ]
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)

  // ── Top Strength ──────────────────────────────────────────────────
  const allSignals = [...workflowAffinities, ...toolProficiencies].filter(
    (s) => s.confidence !== 'early',
  )
  const topStrength = allSignals.length > 0 ? allSignals[0]!.label : null

  return {
    agentId,
    agentName: agent.name,
    workspaceStrengths,
    workflowAffinities,
    toolProficiencies,
    collaborators,
    weakContexts,
    topStrength,
  }
}

// ── Workspace Performance Comparison ──────────────────────────────────

export interface AgentWorkspacePerformance {
  agentId: string
  agentName: string
  successRate: number
  avgQuality: number | null
  totalRuns: number
  topWorkflow: string | null
  topTool: string | null
}

/**
 * Get per-agent performance data for a workspace, ranked by quality.
 */
export async function getAgentWorkspacePerformance(
  db: Database,
  workspaceId: string,
): Promise<AgentWorkspacePerformance[]> {
  const wsAgents = await db.query.agents.findMany({
    where: eq(agents.workspaceId, workspaceId),
  })

  const results: AgentWorkspacePerformance[] = []

  for (const agent of wsAgents) {
    const steps = await db.query.chatRunSteps.findMany({
      where: eq(chatRunSteps.agentId, agent.id),
      orderBy: desc(chatRunSteps.startedAt),
      limit: 200,
    })

    const runIds = [...new Set(steps.map((s) => s.runId))]
    if (runIds.length === 0) {
      results.push({
        agentId: agent.id,
        agentName: agent.name,
        successRate: 0,
        avgQuality: null,
        totalRuns: 0,
        topWorkflow: null,
        topTool: null,
      })
      continue
    }

    const agentRuns = await db.query.chatRuns.findMany({
      where: sql`${chatRuns.id} = ANY(${runIds})`,
    })
    const agentQualities = await db.query.runQuality.findMany({
      where: sql`${runQuality.runId} = ANY(${runIds})`,
    })

    const finished = agentRuns.filter((r) => r.status !== 'running')
    const completed = finished.filter((r) => r.status === 'completed')
    const qScores = agentQualities.map((q) => q.score)

    // Top workflow by frequency
    const wfCounts = new Map<string, number>()
    for (const r of agentRuns) {
      const wf = r.workflowName ?? 'default'
      wfCounts.set(wf, (wfCounts.get(wf) ?? 0) + 1)
    }
    const topWorkflow =
      wfCounts.size > 0 ? [...wfCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0] : null

    // Top tool by usage
    const toolCounts = new Map<string, number>()
    for (const s of steps) {
      if (s.toolName) toolCounts.set(s.toolName, (toolCounts.get(s.toolName) ?? 0) + 1)
    }
    const topTool =
      toolCounts.size > 0 ? [...toolCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0] : null

    results.push({
      agentId: agent.id,
      agentName: agent.name,
      successRate:
        finished.length > 0 ? Math.round((completed.length / finished.length) * 100) / 100 : 0,
      avgQuality:
        qScores.length > 0
          ? Math.round((qScores.reduce((a, b) => a + b, 0) / qScores.length) * 100) / 100
          : null,
      totalRuns: finished.length,
      topWorkflow,
      topTool,
    })
  }

  return results.sort((a, b) => (b.avgQuality ?? 0) - (a.avgQuality ?? 0))
}
