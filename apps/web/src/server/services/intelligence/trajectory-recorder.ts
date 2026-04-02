/**
 * Agent Execution Trajectory Recorder — Records every agent turn for replay and analysis.
 *
 * Inspired by Hermes Agent's trajectory.py.
 * Records tool calls, decisions, outcomes, and timing into structured JSONL
 * that can be replayed to identify where agents went wrong.
 */

import type { Database } from '@solarc/db'
import { chatRuns, chatRunSteps } from '@solarc/db'
import { desc, eq } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export interface TrajectoryStep {
  sequence: number
  type: 'tool_call' | 'tool_result' | 'llm_response' | 'decision' | 'error'
  agentName: string | null
  toolName: string | null
  toolInput: unknown
  toolResult: string | null
  durationMs: number | null
  status: string
  timestamp: number
}

export interface Trajectory {
  runId: string
  sessionId: string
  agentIds: string[]
  status: string
  startedAt: number
  completedAt: number | null
  totalDurationMs: number | null
  stepCount: number
  steps: TrajectoryStep[]
}

export interface TrajectoryAnalysis {
  runId: string
  totalSteps: number
  totalDurationMs: number
  toolCallDistribution: Record<string, number>
  failedSteps: TrajectoryStep[]
  longestStep: TrajectoryStep | null
  loopPatterns: Array<{ tool: string; count: number; consecutive: boolean }>
  decisionPoints: string[]
}

// ── Trajectory Retrieval ────────────────────────────────────────────

/**
 * Reconstruct the full execution trajectory for a chat run.
 * Pulls from chatRuns + chatRunSteps tables.
 */
export async function getTrajectory(db: Database, runId: string): Promise<Trajectory | null> {
  const run = await db.query.chatRuns.findFirst({
    where: eq(chatRuns.id, runId),
  })
  if (!run) return null

  const steps = await db
    .select()
    .from(chatRunSteps)
    .where(eq(chatRunSteps.runId, runId))
    .orderBy(chatRunSteps.sequence)

  return {
    runId: run.id,
    sessionId: run.sessionId,
    agentIds: (run.agentIds as string[]) ?? [],
    status: run.status,
    startedAt: run.startedAt.getTime(),
    completedAt: run.completedAt?.getTime() ?? null,
    totalDurationMs: run.durationMs,
    stepCount: run.stepCount ?? 0,
    steps: steps.map((s) => ({
      sequence: s.sequence,
      type: s.type as TrajectoryStep['type'],
      agentName: s.agentName,
      toolName: s.toolName,
      toolInput: s.toolInput,
      toolResult: s.toolResult,
      durationMs: s.durationMs,
      status: s.status,
      timestamp: s.startedAt.getTime(),
    })),
  }
}

/**
 * Get recent trajectories for a session, ordered by most recent first.
 */
export async function getRecentTrajectories(
  db: Database,
  sessionId: string,
  limit: number = 10,
): Promise<Trajectory[]> {
  const runs = await db
    .select()
    .from(chatRuns)
    .where(eq(chatRuns.sessionId, sessionId))
    .orderBy(desc(chatRuns.startedAt))
    .limit(limit)

  const trajectories: Trajectory[] = []
  for (const run of runs) {
    const t = await getTrajectory(db, run.id)
    if (t) trajectories.push(t)
  }
  return trajectories
}

// ── Trajectory Analysis ─────────────────────────────────────────────

/**
 * Analyze a trajectory to identify patterns, failures, and bottlenecks.
 */
export function analyzeTrajectory(trajectory: Trajectory): TrajectoryAnalysis {
  const toolCallDistribution: Record<string, number> = {}
  const failedSteps: TrajectoryStep[] = []
  let longestStep: TrajectoryStep | null = null

  for (const step of trajectory.steps) {
    // Tool distribution
    if (step.toolName) {
      toolCallDistribution[step.toolName] = (toolCallDistribution[step.toolName] ?? 0) + 1
    }

    // Failed steps
    if (step.status === 'failed' || step.status === 'error') {
      failedSteps.push(step)
    }

    // Longest step
    if (step.durationMs && (!longestStep || step.durationMs > (longestStep.durationMs ?? 0))) {
      longestStep = step
    }
  }

  // Detect loop patterns (same tool called 3+ times)
  const loopPatterns: TrajectoryAnalysis['loopPatterns'] = []
  for (const [tool, count] of Object.entries(toolCallDistribution)) {
    if (count >= 3) {
      // Check if consecutive
      let maxConsecutive = 0
      let currentConsecutive = 0
      for (const step of trajectory.steps) {
        if (step.toolName === tool) {
          currentConsecutive++
          maxConsecutive = Math.max(maxConsecutive, currentConsecutive)
        } else {
          currentConsecutive = 0
        }
      }
      loopPatterns.push({ tool, count, consecutive: maxConsecutive >= 3 })
    }
  }

  // Extract decision points (transitions between different tools)
  const decisionPoints: string[] = []
  for (let i = 1; i < trajectory.steps.length; i++) {
    const prev = trajectory.steps[i - 1]!
    const curr = trajectory.steps[i]!
    if (prev.toolName && curr.toolName && prev.toolName !== curr.toolName) {
      decisionPoints.push(`Step ${prev.sequence}: ${prev.toolName} → ${curr.toolName}`)
    }
  }

  return {
    runId: trajectory.runId,
    totalSteps: trajectory.steps.length,
    totalDurationMs: trajectory.totalDurationMs ?? 0,
    toolCallDistribution,
    failedSteps,
    longestStep,
    loopPatterns,
    decisionPoints,
  }
}

/**
 * Compare two trajectories to identify divergence points.
 * Useful for understanding why a retry succeeded when the original failed.
 */
export function compareTrajectories(
  original: Trajectory,
  retry: Trajectory,
): {
  divergencePoint: number | null
  originalOnlyTools: string[]
  retryOnlyTools: string[]
  sharedSteps: number
} {
  let divergencePoint: number | null = null
  let sharedSteps = 0

  const maxLen = Math.min(original.steps.length, retry.steps.length)
  for (let i = 0; i < maxLen; i++) {
    if (original.steps[i]!.toolName === retry.steps[i]!.toolName) {
      sharedSteps++
    } else if (divergencePoint === null) {
      divergencePoint = i
    }
  }

  const originalTools = new Set(original.steps.map((s) => s.toolName).filter(Boolean))
  const retryTools = new Set(retry.steps.map((s) => s.toolName).filter(Boolean))

  return {
    divergencePoint,
    originalOnlyTools: [...originalTools].filter((t) => !retryTools.has(t)) as string[],
    retryOnlyTools: [...retryTools].filter((t) => !originalTools.has(t)) as string[],
    sharedSteps,
  }
}
