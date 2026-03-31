/**
 * Cross-Agent Learning — Knowledge propagation between agents.
 *
 * Two mechanisms:
 * 1. Soul Fragments: Extract reusable improvements from evolution mutations
 *    and make them available to other agents.
 * 2. Shared Observations: High-proof-count observations auto-promote to
 *    workspace-level, accessible by all agents.
 */

import type { Database } from '@solarc/db'
import { agents, evolutionCycles, memories, soulFragments } from '@solarc/db'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

import type { GatewayRouter } from '../gateway'

// ── Types ─────────────────────────────────────────────────────────────

export interface SoulFragment {
  id: string
  title: string
  content: string
  category: string
  proofCount: number
  adoptedByCount: number
}

export interface CrossLearningResult {
  fragmentsExtracted: number
  observationsPromoted: number
  errors: string[]
}

// ── Fragment Extraction ───────────────────────────────────────────────

const FRAGMENT_EXTRACTION_PROMPT = `You are a knowledge extraction system. Given an agent evolution diff (old soul → new soul), extract the specific improvements as reusable "soul fragments" that other agents could benefit from.

## OLD SOUL
{oldSoul}

## NEW SOUL
{newSoul}

## MUTATION SUMMARY
{summary}

## Instructions
Extract 1-3 reusable fragments. Each fragment should be:
- Self-contained (usable without the full soul context)
- General (applicable to other agents, not just this one)
- Actionable (specific guidance, not vague advice)

Categorize each as: error_handling, communication, tool_use, reasoning, or domain

Return ONLY valid JSON:
{"fragments": [{"title": "short title", "content": "the reusable guidance", "category": "category"}]}

If the improvement is too agent-specific to be reusable, return: {"fragments": []}
`

/**
 * Extract reusable soul fragments from a successful evolution cycle.
 * Called after an accepted evolution mutation.
 */
export async function extractSoulFragments(
  db: Database,
  gw: GatewayRouter,
  cycleId: string,
): Promise<number> {
  const cycle = await db.query.evolutionCycles.findFirst({
    where: and(eq(evolutionCycles.id, cycleId), eq(evolutionCycles.status, 'accepted')),
  })
  if (!cycle || !cycle.proposedSoul) return 0

  // Get the agent's previous soul from the version
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, cycle.agentId) })
  if (!agent) return 0

  const prompt = FRAGMENT_EXTRACTION_PROMPT.replace(
    '{oldSoul}',
    cycle.proposedSoul ? 'See mutation diff' : '(empty)',
  )
    .replace('{newSoul}', cycle.proposedSoul)
    .replace('{summary}', cycle.analysisSummary ?? cycle.mutationDiff ?? 'General improvement')

  try {
    const response = await gw.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      maxTokens: 2048,
    })

    const cleaned = response.content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    const parsed = JSON.parse(cleaned)
    const fragments = parsed.fragments ?? []

    let count = 0
    for (const f of fragments) {
      if (!f.title || !f.content || !f.category) continue
      await db.insert(soulFragments).values({
        title: f.title,
        content: f.content,
        category: f.category,
        sourceAgentId: cycle.agentId,
        sourceCycleId: cycleId,
        workspaceId: agent.workspaceId,
      })
      count++
    }
    return count
  } catch {
    return 0
  }
}

/**
 * Get relevant soul fragments for an agent (for injection into evolution prompts
 * or direct agent context enrichment).
 */
export async function getRelevantFragments(
  db: Database,
  agentId: string,
  limit: number = 10,
): Promise<SoulFragment[]> {
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) return []

  // Get fragments from same workspace + global fragments, ordered by adoption count
  const results = await db
    .select({
      id: soulFragments.id,
      title: soulFragments.title,
      content: soulFragments.content,
      category: soulFragments.category,
      proofCount: soulFragments.proofCount,
      adoptedByCount: soulFragments.adoptedByCount,
    })
    .from(soulFragments)
    .where(
      agent.workspaceId
        ? sql`${soulFragments.workspaceId} = ${agent.workspaceId} OR ${soulFragments.isGlobal} = true`
        : eq(soulFragments.isGlobal, true),
    )
    .orderBy(desc(soulFragments.adoptedByCount), desc(soulFragments.proofCount))
    .limit(limit)

  return results
}

/**
 * Run the full cross-agent learning cycle:
 * 1. Extract fragments from recent accepted evolutions
 * 2. Promote high-proof observations to workspace scope
 */
export async function runCrossAgentLearning(
  db: Database,
  gw: GatewayRouter,
): Promise<CrossLearningResult> {
  const result: CrossLearningResult = {
    fragmentsExtracted: 0,
    observationsPromoted: 0,
    errors: [],
  }

  // 1. Extract fragments from recent accepted evolutions that haven't been processed
  try {
    const recentCycles = await db
      .select()
      .from(evolutionCycles)
      .where(eq(evolutionCycles.status, 'accepted'))
      .orderBy(desc(evolutionCycles.completedAt))
      .limit(10)

    for (const cycle of recentCycles) {
      // Check if fragments already extracted for this cycle
      const existing = await db.query.soulFragments.findFirst({
        where: eq(soulFragments.sourceCycleId, cycle.id),
      })
      if (existing) continue

      const count = await extractSoulFragments(db, gw, cycle.id)
      result.fragmentsExtracted += count
    }
  } catch (err) {
    result.errors.push(`fragment extraction: ${err instanceof Error ? err.message : 'failed'}`)
  }

  // 2. Promote high-proof observations to workspace-wide visibility
  // Observations with proofCount >= 10 that are agent-scoped get promoted
  try {
    const highProofObs = await db
      .select({ id: memories.id, proofCount: memories.proofCount })
      .from(memories)
      .where(
        and(
          eq(memories.factType, 'observation'),
          gte(memories.proofCount, 10),
          eq(memories.tier, 'recall'),
        ),
      )
      .limit(20)

    for (const obs of highProofObs) {
      await db
        .update(memories)
        .set({
          tier: 'core',
          confidence: 0.95,
          updatedAt: new Date(),
        })
        .where(eq(memories.id, obs.id))
      result.observationsPromoted++
    }
  } catch (err) {
    result.errors.push(`observation promotion: ${err instanceof Error ? err.message : 'failed'}`)
  }

  return result
}
