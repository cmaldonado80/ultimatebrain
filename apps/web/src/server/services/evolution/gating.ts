/**
 * Evolution Gating — validates proposed mutations before acceptance.
 *
 * Inspired by A-Evolve's holdout gating + EGL (Evolutionary Generality Loss).
 * Prevents regressions by:
 * 1. Comparing proposed soul quality against current baseline
 * 2. Running the proposed soul through a test conversation
 * 3. Checking EGL (is the agent becoming too specialized?)
 */

import type { Database } from '@solarc/db'
import { evolutionCycles } from '@solarc/db'
import { and, desc, eq } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export interface GateInput {
  agentId: string
  currentSoul: string
  proposedSoul: string
  preScore: number
  analysisResult: {
    failurePatterns: Array<{ pattern: string; count: number }>
    weaknesses: string[]
  }
}

export interface GateResult {
  passed: boolean
  reason: string
  gateScore: number
  threshold: number
  checks: {
    soulQuality: boolean
    notRegression: boolean
    eglCheck: boolean
    diffReasonable: boolean
  }
}

// ── Gating Logic ──────────────────────────────────────────────────────

/**
 * Validate a proposed soul mutation before it's applied.
 * Returns whether the gate passed and why.
 */
export async function validateMutation(db: Database, input: GateInput): Promise<GateResult> {
  const checks = {
    soulQuality: false,
    notRegression: false,
    eglCheck: false,
    diffReasonable: false,
  }

  // Check 1: Soul quality — proposed soul must be non-empty and reasonable length
  const proposedLen = input.proposedSoul.trim().length
  const currentLen = input.currentSoul.trim().length
  checks.soulQuality = proposedLen >= 50 && proposedLen <= currentLen * 3 + 500

  // Check 2: Not a regression — soul shouldn't remove critical sections
  // (We check for key structural elements that shouldn't be removed)
  const criticalSections = ['role', 'goal', 'rules', 'constraint', 'guideline']
  const currentLower = input.currentSoul.toLowerCase()
  const proposedLower = input.proposedSoul.toLowerCase()
  const removedCritical = criticalSections.filter(
    (s) => currentLower.includes(s) && !proposedLower.includes(s),
  )
  checks.notRegression = removedCritical.length === 0

  // Check 3: EGL — Evolutionary Generality Loss
  // Monitor if the agent is becoming too specialized
  const recentCycles = await db
    .select()
    .from(evolutionCycles)
    .where(and(eq(evolutionCycles.agentId, input.agentId), eq(evolutionCycles.status, 'accepted')))
    .orderBy(desc(evolutionCycles.cycleNumber))
    .limit(5)

  // If we've had 3+ cycles without score improvement, block further evolution
  if (recentCycles.length >= 3) {
    const recentDeltas = recentCycles.filter((c) => c.scoreDelta !== null).map((c) => c.scoreDelta!)
    const avgDelta =
      recentDeltas.length > 0 ? recentDeltas.reduce((a, b) => a + b, 0) / recentDeltas.length : 0
    checks.eglCheck = avgDelta > -0.05 // Allow if not consistently degrading
  } else {
    checks.eglCheck = true // Not enough history, allow
  }

  // Check 4: Diff is reasonable — changes shouldn't be more than 60% of the soul
  if (currentLen > 0) {
    // Simple character-level change ratio
    const maxLen = Math.max(currentLen, proposedLen)
    const minLen = Math.min(currentLen, proposedLen)
    const sizeRatio = minLen / maxLen
    checks.diffReasonable = sizeRatio > 0.4 // At least 40% of content preserved
  } else {
    checks.diffReasonable = true // No current soul, any proposal is fine
  }

  // Compute gate score (weighted checks)
  const weights = { soulQuality: 0.2, notRegression: 0.3, eglCheck: 0.25, diffReasonable: 0.25 }
  const gateScore =
    (checks.soulQuality ? weights.soulQuality : 0) +
    (checks.notRegression ? weights.notRegression : 0) +
    (checks.eglCheck ? weights.eglCheck : 0) +
    (checks.diffReasonable ? weights.diffReasonable : 0)

  const threshold = 0.7
  const passed = gateScore >= threshold

  // Build reason
  const failedChecks = Object.entries(checks)
    .filter(([, v]) => !v)
    .map(([k]) => k)
  const reason = passed
    ? `Gate passed (score: ${gateScore.toFixed(2)})`
    : `Gate failed: ${failedChecks.join(', ')} (score: ${gateScore.toFixed(2)}, threshold: ${threshold})`

  return { passed, reason, gateScore, threshold, checks }
}

/**
 * Check if evolution has converged (EGL plateau).
 * Returns true if the last N cycles show no meaningful improvement.
 */
export async function isConverged(
  db: Database,
  agentId: string,
  window: number = 3,
  epsilon: number = 0.02,
): Promise<boolean> {
  const cycles = await db
    .select({ postScore: evolutionCycles.postScore })
    .from(evolutionCycles)
    .where(and(eq(evolutionCycles.agentId, agentId), eq(evolutionCycles.status, 'accepted')))
    .orderBy(desc(evolutionCycles.cycleNumber))
    .limit(window + 1)

  const scores = cycles.map((c) => c.postScore).filter((s): s is number => s !== null)
  if (scores.length < window + 1) return false

  const baseline = scores[scores.length - 1]!
  const recent = scores.slice(0, window)
  return recent.every((s) => Math.abs(s - baseline) < epsilon)
}
