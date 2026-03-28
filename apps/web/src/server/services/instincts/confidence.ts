/**
 * ECC Instinct System — Confidence Scorer
 *
 * Implements Bayesian-style confidence updates with time-based decay.
 *
 * Confidence ladder (representative milestones):
 *   0.3  → newly formed candidate (3 observations)
 *   0.5  → corroborated pattern (6–8 observations, no contradictions)
 *   0.7  → reliable instinct (10+ observations, promotion to Mini Brain eligible)
 *   0.9  → strong universal instinct (50+ observations, evolution eligible)
 *
 * Decay model:
 *   Instincts that are not re-observed decay toward 0 over time.
 *   Half-life is configurable (default: 30 days).
 *   An instinct that reaches < 0.1 effective confidence is effectively dormant.
 *
 * Examples:
 *   updateConfidence(jsonFormatInstinct, correction)
 *     "User corrected plain-text to JSON again → confidence 0.3 → 0.5"
 *
 *   decreaseConfidence(jsonFormatInstinct)
 *     "User overrode our JSON output with plain text → confidence 0.5 → 0.3"
 *
 *   applyDecay(oldTscInstinct)
 *     "30 days since last TypeScript error → confidence 0.7 → 0.54"
 */

import type { ConfidenceUpdate, Instinct } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Confidence floor — instincts never go below this before being discarded. */
const CONFIDENCE_FLOOR = 0.05

/** Confidence ceiling. */
const CONFIDENCE_CEILING = 1.0

/**
 * How much to increase confidence per corroborating observation.
 * Uses a diminishing-returns curve: the gain shrinks as confidence grows.
 * Follows the logistic-inspired formula: gain = BASE_GAIN * (1 - current)
 */
const BASE_GAIN = 0.25

/**
 * How much to decrease confidence per user override.
 * Overrides are strong negative signals — penalised at 2× the base gain.
 */
const OVERRIDE_PENALTY = 0.2

/**
 * Decay half-life in milliseconds (default: 30 days).
 * After this many ms without observation, confidence halves.
 */
const DEFAULT_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// ConfidenceScorer
// ---------------------------------------------------------------------------

export class ConfidenceScorer {
  private halfLifeMs: number

  constructor(halfLifeMs: number = DEFAULT_HALF_LIFE_MS) {
    this.halfLifeMs = halfLifeMs
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Increase confidence when an observation corroborates the instinct.
   *
   * Uses a diminishing-returns update so confidence asymptotically approaches 1.0:
   *   new = current + BASE_GAIN * (1 - current)
   *
   * Milestones (approximate):
   *   start  → 0.30  (3 observations)
   *   +1 obs → 0.48  (~4 observations)
   *   +1 obs → 0.60  (~5 observations)
   *   +1 obs → 0.70  (~6 observations)
   *   +1 obs → 0.78  (~7 observations)
   *   +1 obs → 0.83  ...
   *   +1 obs → 0.87  promotion to Mini Brain territory
   *   +1 obs → 0.90  evolution candidate territory
   *
   * Example:
   *   The "use JSON format" instinct was at 0.5.
   *   User corrected output format once more.
   *   updateConfidence(instinct, obs) → 0.5 + 0.25*(1-0.5) = 0.625
   */
  updateConfidence(instinct: Instinct, _observation?: unknown): ConfidenceUpdate {
    const prev = instinct.confidence
    const gain = BASE_GAIN * (1 - prev)
    const next = Math.min(CONFIDENCE_CEILING, prev + gain)

    instinct.confidence = next
    instinct.evidenceCount += 1
    instinct.lastObservedAt = new Date()
    instinct.updatedAt = new Date()

    return {
      instinctId: instinct.id,
      previousConfidence: prev,
      newConfidence: next,
      reason: 'repetition',
      appliedAt: new Date(),
    }
  }

  /**
   * Decrease confidence when the user overrides or contradicts the instinct.
   *
   * Example:
   *   The "always use markdown tables" instinct was at 0.7.
   *   User replaced a markdown table with bullet points.
   *   decreaseConfidence(instinct) → 0.7 - 0.20 = 0.50
   *
   * The instinct never drops below CONFIDENCE_FLOOR (0.05).
   */
  decreaseConfidence(instinct: Instinct): ConfidenceUpdate {
    const prev = instinct.confidence
    const next = Math.max(CONFIDENCE_FLOOR, prev - OVERRIDE_PENALTY)

    instinct.confidence = next
    instinct.updatedAt = new Date()

    return {
      instinctId: instinct.id,
      previousConfidence: prev,
      newConfidence: next,
      reason: 'user_override',
      appliedAt: new Date(),
    }
  }

  /**
   * Apply time-based exponential decay to an instinct's confidence.
   *
   * Formula: effective = current * 0.5^(elapsed / halfLife)
   *
   * This is a pure read — it mutates the instinct in-place only if you
   * call it intentionally (e.g. during a scheduled nightly sweep).
   *
   * Example:
   *   "run TypeScript check" instinct has not been seen in 30 days.
   *   confidence was 0.7.
   *   applyDecay → 0.7 * 0.5^(30/30) = 0.7 * 0.5 = 0.35
   *
   *   After 60 days without re-observation:
   *   applyDecay → 0.7 * 0.5^(60/30) = 0.7 * 0.25 = 0.175
   */
  applyDecay(instinct: Instinct, now: Date = new Date()): ConfidenceUpdate {
    const prev = instinct.confidence
    const elapsedMs = now.getTime() - instinct.lastObservedAt.getTime()

    if (elapsedMs <= 0) {
      return {
        instinctId: instinct.id,
        previousConfidence: prev,
        newConfidence: prev,
        reason: 'time_decay',
        appliedAt: now,
      }
    }

    const halfLives = elapsedMs / this.halfLifeMs
    const decayFactor = Math.pow(0.5, halfLives)
    const next = Math.max(CONFIDENCE_FLOOR, prev * decayFactor)

    instinct.confidence = next
    instinct.updatedAt = now

    return {
      instinctId: instinct.id,
      previousConfidence: prev,
      newConfidence: next,
      reason: 'time_decay',
      appliedAt: now,
    }
  }

  /**
   * Return the effective confidence of an instinct adjusted for elapsed decay,
   * WITHOUT mutating the instinct record.
   *
   * Use this for display, prompt injection filtering, and promotion checks
   * when you want a read-only view without triggering a database write.
   *
   * Example:
   *   instinct.confidence = 0.7, last seen 15 days ago (half-life 30 days)
   *   getEffectiveConfidence → 0.7 * 0.5^(15/30) ≈ 0.495
   */
  getEffectiveConfidence(instinct: Instinct, now: Date = new Date()): number {
    const elapsedMs = now.getTime() - instinct.lastObservedAt.getTime()
    if (elapsedMs <= 0) return instinct.confidence

    const halfLives = elapsedMs / this.halfLifeMs
    const decayFactor = Math.pow(0.5, halfLives)
    return Math.max(CONFIDENCE_FLOOR, instinct.confidence * decayFactor)
  }

  /**
   * Determine if an instinct has decayed to the point of being dormant.
   * Dormant instincts should not be injected into prompts and may be archived.
   */
  isDormant(instinct: Instinct, now: Date = new Date()): boolean {
    return this.getEffectiveConfidence(instinct, now) < 0.1
  }

  /**
   * Batch-apply decay to a list of instincts and return only those that changed
   * significantly (delta > 0.01). Used in nightly maintenance sweeps.
   */
  batchApplyDecay(
    instincts: Instinct[],
    now: Date = new Date(),
  ): { instinct: Instinct; update: ConfidenceUpdate }[] {
    const results: { instinct: Instinct; update: ConfidenceUpdate }[] = []

    for (const instinct of instincts) {
      const update = this.applyDecay(instinct, now)
      const delta = Math.abs(update.previousConfidence - update.newConfidence)
      if (delta > 0.01) {
        results.push({ instinct, update })
      }
    }

    return results
  }
}
