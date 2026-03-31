/**
 * Agent Evolution Service — the self-improvement loop.
 *
 * Implements the A-Evolve pattern adapted for Solarc Brain:
 *   Observe → Analyze → Mutate → Gate → Apply (or Rollback)
 *
 * Uses real run data to evolve agent souls (prompts), closing the feedback
 * loop between performance metrics and agent behavior.
 */

import type { Database } from '@solarc/db'
import { agents, agentSoulVersions, evolutionCycles } from '@solarc/db'
import { and, desc, eq } from 'drizzle-orm'

import { GatewayRouter } from '../gateway'
import { type AnalysisResult, analyzeAgentPerformance } from './analyzer'
import { isConverged, validateMutation } from './gating'

// ── Types ─────────────────────────────────────────────────────────────

export interface EvolutionConfig {
  /** Min runs before evolution is triggered */
  minObservedRuns: number
  /** Days of history to analyze */
  windowDays: number
  /** Score below which evolution is recommended */
  evolveThreshold: number
  /** Model to use for LLM-driven mutation synthesis */
  evolverModel?: string
}

export interface EvolutionResult {
  agentId: string
  cycleId: string
  status: 'accepted' | 'rejected' | 'skipped'
  reason: string
  fromVersion: number
  toVersion: number | null
  scoreDelta: number | null
  summary: string
}

const DEFAULT_CONFIG: EvolutionConfig = {
  minObservedRuns: 5,
  windowDays: 7,
  evolveThreshold: 0.6,
}

// ── Evolution Service ─────────────────────────────────────────────────

/**
 * Snapshot the current agent state as a new soul version.
 * Called when an agent is first created or before mutation.
 */
export async function snapshotSoulVersion(
  db: Database,
  agentId: string,
  opts?: { cycleId?: string; mutationSummary?: string },
): Promise<{ id: string; version: number }> {
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) throw new Error(`Agent ${agentId} not found`)

  // Get current max version
  const [latest] = await db
    .select({ version: agentSoulVersions.version })
    .from(agentSoulVersions)
    .where(eq(agentSoulVersions.agentId, agentId))
    .orderBy(desc(agentSoulVersions.version))
    .limit(1)

  const nextVersion = (latest?.version ?? 0) + 1

  // Deactivate all current versions
  await db
    .update(agentSoulVersions)
    .set({ isActive: false })
    .where(eq(agentSoulVersions.agentId, agentId))

  // Insert new version
  const [version] = await db
    .insert(agentSoulVersions)
    .values({
      agentId,
      version: nextVersion,
      soul: agent.soul ?? '',
      model: agent.model,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      toolAccess: agent.toolAccess,
      parentVersionId: latest ? undefined : undefined,
      cycleId: opts?.cycleId,
      mutationSummary: opts?.mutationSummary ?? `Snapshot v${nextVersion}`,
      isActive: true,
    })
    .returning()

  return { id: version!.id, version: nextVersion }
}

/**
 * Rollback an agent to a previous soul version.
 * Restores soul, model, temperature, maxTokens, toolAccess from the version.
 */
export async function rollbackToVersion(
  db: Database,
  agentId: string,
  targetVersion: number,
): Promise<{ success: boolean; restoredVersion: number; soul: string }> {
  const version = await db.query.agentSoulVersions.findFirst({
    where: and(
      eq(agentSoulVersions.agentId, agentId),
      eq(agentSoulVersions.version, targetVersion),
    ),
  })

  if (!version) throw new Error(`Version ${targetVersion} not found for agent ${agentId}`)

  // Apply the version's state to the agent
  await db
    .update(agents)
    .set({
      soul: version.soul,
      model: version.model,
      temperature: version.temperature,
      maxTokens: version.maxTokens,
      toolAccess: version.toolAccess,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId))

  // Mark this version as active, deactivate others
  await db
    .update(agentSoulVersions)
    .set({ isActive: false })
    .where(eq(agentSoulVersions.agentId, agentId))

  await db
    .update(agentSoulVersions)
    .set({ isActive: true })
    .where(eq(agentSoulVersions.id, version.id))

  // Snapshot the rollback as a new version for audit trail
  await snapshotSoulVersion(db, agentId, {
    mutationSummary: `Rollback to v${targetVersion}`,
  })

  return { success: true, restoredVersion: targetVersion, soul: version.soul }
}

/**
 * Run one evolution cycle for an agent.
 * This is the core loop: Observe → Analyze → Mutate → Gate → Apply.
 */
export async function evolveAgent(
  db: Database,
  agentId: string,
  config: Partial<EvolutionConfig> = {},
): Promise<EvolutionResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const startTime = Date.now()

  // Get agent
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) throw new Error(`Agent ${agentId} not found`)

  // Determine cycle number
  const [lastCycle] = await db
    .select({ cycleNumber: evolutionCycles.cycleNumber })
    .from(evolutionCycles)
    .where(eq(evolutionCycles.agentId, agentId))
    .orderBy(desc(evolutionCycles.cycleNumber))
    .limit(1)

  const cycleNumber = (lastCycle?.cycleNumber ?? 0) + 1

  // Create cycle record
  const [cycle] = await db
    .insert(evolutionCycles)
    .values({
      agentId,
      cycleNumber,
      status: 'running',
    })
    .returning()

  const cycleId = cycle!.id

  try {
    // Check convergence first
    if (await isConverged(db, agentId)) {
      await completeCycle(db, cycleId, 'rejected', {
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      })
      return {
        agentId,
        cycleId,
        status: 'skipped',
        reason: 'Agent has converged — no further evolution needed',
        fromVersion: 0,
        toVersion: null,
        scoreDelta: null,
        summary: 'Evolution converged (EGL plateau)',
      }
    }

    // PHASE 1: OBSERVE + ANALYZE
    const analysis = await analyzeAgentPerformance(db, agentId, cfg.windowDays)
    if (!analysis) throw new Error('Analysis failed — agent not found')

    await db
      .update(evolutionCycles)
      .set({
        observedRuns: analysis.observedRuns,
        preScore: analysis.avgScore,
        failurePatterns: analysis.failurePatterns,
      })
      .where(eq(evolutionCycles.id, cycleId))

    // Check if evolution is warranted
    if (analysis.recommendation !== 'evolve') {
      await completeCycle(db, cycleId, 'rejected', {
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      })
      return {
        agentId,
        cycleId,
        status: 'skipped',
        reason:
          analysis.recommendation === 'insufficient_data'
            ? `Not enough data (${analysis.observedRuns} runs, need ${cfg.minObservedRuns})`
            : `Agent performing well (score: ${analysis.avgScore.toFixed(2)}, success: ${(analysis.successRate * 100).toFixed(0)}%)`,
        fromVersion: 0,
        toVersion: null,
        scoreDelta: null,
        summary: `Analysis: ${analysis.recommendation}`,
      }
    }

    // Snapshot current state
    const currentSnapshot = await snapshotSoulVersion(db, agentId, { cycleId })

    // PHASE 2: MUTATE — Use LLM to synthesize improved soul
    const proposedSoul = await synthesizeMutation(db, analysis, cfg.evolverModel)

    await db
      .update(evolutionCycles)
      .set({
        proposedSoul,
        analysisSummary: buildAnalysisSummary(analysis),
      })
      .where(eq(evolutionCycles.id, cycleId))

    // PHASE 3: GATE — Validate the proposed mutation
    const gateResult = await validateMutation(db, {
      agentId,
      currentSoul: analysis.currentSoul,
      proposedSoul,
      preScore: analysis.avgScore,
      analysisResult: {
        failurePatterns: analysis.failurePatterns,
        weaknesses: analysis.weaknesses,
      },
    })

    await db
      .update(evolutionCycles)
      .set({
        gateScore: gateResult.gateScore,
        gateThreshold: gateResult.threshold,
        gatePassed: gateResult.passed,
      })
      .where(eq(evolutionCycles.id, cycleId))

    if (!gateResult.passed) {
      await completeCycle(db, cycleId, 'rejected', {
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      })
      return {
        agentId,
        cycleId,
        status: 'rejected',
        reason: gateResult.reason,
        fromVersion: currentSnapshot.version,
        toVersion: null,
        scoreDelta: null,
        summary: `Gate rejected: ${gateResult.reason}`,
      }
    }

    // PHASE 4: APPLY — Update agent soul and create new version
    await db
      .update(agents)
      .set({ soul: proposedSoul, updatedAt: new Date() })
      .where(eq(agents.id, agentId))

    const newSnapshot = await snapshotSoulVersion(db, agentId, {
      cycleId,
      mutationSummary: buildAnalysisSummary(analysis),
    })

    // Compute diff summary
    const diffSummary = `v${currentSnapshot.version} → v${newSnapshot.version}: ${buildAnalysisSummary(analysis)}`

    await completeCycle(db, cycleId, 'accepted', {
      fromVersionId: currentSnapshot.id,
      toVersionId: newSnapshot.id,
      mutationDiff: diffSummary,
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
    })

    return {
      agentId,
      cycleId,
      status: 'accepted',
      reason: `Evolution applied — addressed ${analysis.failurePatterns.length} failure patterns`,
      fromVersion: currentSnapshot.version,
      toVersion: newSnapshot.version,
      scoreDelta: null, // Will be computed after post-evolution runs
      summary: diffSummary,
    }
  } catch (err) {
    await completeCycle(db, cycleId, 'rejected', {
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
    })
    throw err
  }
}

/**
 * Get evolution history for an agent.
 */
export async function getEvolutionHistory(db: Database, agentId: string, limit: number = 20) {
  const cycles = await db
    .select()
    .from(evolutionCycles)
    .where(eq(evolutionCycles.agentId, agentId))
    .orderBy(desc(evolutionCycles.cycleNumber))
    .limit(limit)

  const versions = await db
    .select()
    .from(agentSoulVersions)
    .where(eq(agentSoulVersions.agentId, agentId))
    .orderBy(desc(agentSoulVersions.version))
    .limit(limit)

  return { cycles, versions }
}

// ── Internal Helpers ──────────────────────────────────────────────────

async function completeCycle(
  db: Database,
  cycleId: string,
  status: 'accepted' | 'rejected' | 'rolled_back',
  extra: Record<string, unknown>,
) {
  await db
    .update(evolutionCycles)
    .set({ status, ...extra })
    .where(eq(evolutionCycles.id, cycleId))
}

/**
 * Use the LLM gateway to synthesize an improved soul based on analysis.
 */
async function synthesizeMutation(
  db: Database,
  analysis: AnalysisResult,
  model?: string,
): Promise<string> {
  const gw = new GatewayRouter(db)

  const failureSummary = analysis.failurePatterns
    .map((p) => `- ${p.pattern} (${p.count}x, ${p.severity}): ${p.examples[0] ?? ''}`)
    .join('\n')

  const instinctsSummary = analysis.recentInstincts
    .map((i) => `- When: ${i.trigger} → Do: ${i.action} (confidence: ${i.confidence})`)
    .join('\n')

  const prompt = `You are an AI agent evolution engine. Your task is to improve an agent's system prompt (soul) based on observed performance data.

## Current Agent
Name: ${analysis.agentName}
Success Rate: ${(analysis.successRate * 100).toFixed(1)}%
Avg Quality Score: ${analysis.avgScore.toFixed(2)}/1.0
Observed Runs: ${analysis.observedRuns}

## Current Soul
${analysis.currentSoul || '(empty — no soul defined)'}

## Failure Patterns
${failureSummary || '(none detected)'}

## Weaknesses
${analysis.weaknesses.join('\n') || '(none detected)'}

## Strengths
${analysis.strengths.join('\n') || '(none detected)'}

## Learned Instincts
${instinctsSummary || '(none yet)'}

## Instructions
1. Analyze the failure patterns and weaknesses above
2. Identify the root causes of poor performance
3. Write an IMPROVED version of the agent's soul that:
   - Preserves all existing strengths and capabilities
   - Adds specific guidance to address each failure pattern
   - Incorporates relevant learned instincts as permanent rules
   - Keeps the same general role and personality
   - Is clear, concise, and actionable
4. Return ONLY the improved soul text — no explanations, no markdown fences

If the current soul is empty, create a new one based on the agent name and observed behavior patterns.`

  const result = await gw.chat({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 4096,
  })

  // Clean up any markdown fences the LLM might add
  let soul = result.content.trim()
  if (soul.startsWith('```')) {
    soul = soul.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')
  }

  return soul
}

function buildAnalysisSummary(analysis: AnalysisResult): string {
  const parts: string[] = []
  if (analysis.failurePatterns.length > 0) {
    parts.push(
      `Addressed ${analysis.failurePatterns.length} failure pattern(s): ${analysis.failurePatterns.map((p) => p.pattern).join(', ')}`,
    )
  }
  if (analysis.weaknesses.length > 0) {
    parts.push(`Improved ${analysis.weaknesses.length} weak area(s)`)
  }
  if (analysis.recentInstincts.length > 0) {
    parts.push(`Incorporated ${analysis.recentInstincts.length} learned instinct(s)`)
  }
  return parts.join('. ') || 'General soul improvement'
}
