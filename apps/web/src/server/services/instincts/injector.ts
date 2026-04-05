/**
 * ECC Instinct System — Injector
 *
 * Retrieves instincts that are relevant to the current agent context and
 * injects them into the agent's system prompt as behavioral guidance.
 *
 * Injection strategy:
 *   1. Filter instincts by domain (exact match OR 'universal').
 *   2. Filter by minimum effective confidence (accounting for decay).
 *   3. Score each instinct's relevance to the current trigger text.
 *   4. Return top-N sorted by relevance × confidence.
 *   5. Format as natural-language instructions appended to the system prompt.
 *
 * Injected text example:
 *   --- Behavioral Instincts (learned patterns) ---
 *   • When user corrects output format, you should respond with structured JSON
 *     matching the expected schema. (confidence: 87%)
 *   • When encountering error: "type mismatch", you should apply resolution:
 *     "run tsc --noEmit before committing". (confidence: 72%)
 *   ---
 *
 * The agent treats these as strong preferences, not hard rules. Higher confidence
 * instincts are listed first; instincts near the floor (< 0.3) are omitted.
 */

import { ConfidenceScorer } from './confidence'
import type { InjectionContext, Instinct } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of instincts to inject into a single prompt. */
const MAX_INSTINCTS_PER_INJECTION = 8

/** Absolute minimum effective confidence to even consider injecting. */
const HARD_MIN_CONFIDENCE = 0.3

// ---------------------------------------------------------------------------
// InstinctInjector
// ---------------------------------------------------------------------------

export class InstinctInjector {
  private scorer: ConfidenceScorer

  constructor(scorer?: ConfidenceScorer) {
    this.scorer = scorer ?? new ConfidenceScorer()
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Return instincts relevant to the current domain + trigger context,
   * sorted by effective confidence descending.
   *
   * @param allInstincts   Full instinct list for this entity (from DB / cache).
   * @param context        Current injection context (domain, trigger, minConfidence).
   * @param now            Optional override for "now" (used in tests).
   *
   * Examples:
   *   getRelevantInstincts(instincts, { domain: 'astrology', trigger: 'user asks about timing', minConfidence: 0.5 })
   *   → returns instincts tagged 'astrology' or 'universal' with effective confidence ≥ 0.5
   *     sorted by those most relevant to "timing" queries first
   *
   *   getRelevantInstincts(instincts, { domain: 'hospitality', trigger: 'booking fails', minConfidence: 0.4 })
   *   → "when hospitality booking fails → retry with alternative date range first" (0.71)
   *      "when encountering error: 'no availability' → suggest adjacent dates" (0.65)
   */
  getRelevantInstincts(
    allInstincts: Instinct[],
    context: InjectionContext,
    now: Date = new Date(),
  ): Instinct[] {
    const effectiveMin = Math.max(context.minConfidence, HARD_MIN_CONFIDENCE)

    const candidates = allInstincts.filter((inst) => {
      // Domain: must be universal OR match current domain
      if (inst.domain !== 'universal' && inst.domain !== context.domain) return false

      // Not already evolved into a skill/command
      if (inst.evolvedInto) return false

      // Effective confidence must meet threshold
      const effective = this.scorer.getEffectiveConfidence(inst, now)
      return effective >= effectiveMin
    })

    // Score relevance: simple token overlap between trigger text and instinct trigger
    const triggerTokens = this.tokenize(context.trigger)

    const scored = candidates.map((inst) => {
      const instTokens = this.tokenize(inst.trigger)
      const overlap = [...instTokens].filter((t) => triggerTokens.has(t)).length
      const relevanceScore = instTokens.size > 0 ? overlap / instTokens.size : 0
      const effectiveConf = this.scorer.getEffectiveConfidence(inst, now)

      // Combined score: relevance weighted by confidence
      const score = effectiveConf * (0.6 + 0.4 * relevanceScore)
      return { inst, score }
    })

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_INSTINCTS_PER_INJECTION)
      .map((s) => s.inst)
  }

  /**
   * Build the formatted text block to append to an agent's system prompt.
   *
   * Returns an empty string if there are no relevant instincts (so callers
   * can safely append without adding noise).
   *
   * Example output for a development agent in the 'astrology' domain:
   *
   *   --- Behavioral Instincts (learned patterns) ---
   *   • When user asks about planetary positions, you should respond with
   *     structured JSON containing planet and sign fields. (confidence: 87%)
   *   • When producing chart output for user, you should prefer markdown table
   *     output format when user context matches. (confidence: 71%)
   *   ---
   */
  buildPromptInjection(instincts: Instinct[], now: Date = new Date()): string {
    if (instincts.length === 0) return ''

    const lines = instincts.map((inst) => {
      const pct = Math.round(this.scorer.getEffectiveConfidence(inst, now) * 100)
      return `• ${this.formatInstinct(inst, pct)}`
    })

    return ['--- Behavioral Instincts (learned patterns) ---', ...lines, '---'].join('\n')
  }

  /**
   * Format a single instinct as a natural-language instruction.
   *
   * Format: "When {trigger}, you should {action} (confidence: {N}%)"
   *
   * Examples:
   *   "When user corrects output format, you should respond with structured JSON
   *    matching the expected schema (confidence: 87%)"
   *
   *   "When encountering error: "type mismatch", you should run tsc --noEmit
   *    before committing (confidence: 72%)"
   *
   *   "When hospitality booking fails, you should retry with alternative date
   *    range first (confidence: 65%)"
   */
  formatInstinct(instinct: Instinct, confidencePct?: number): string {
    const pct = confidencePct ?? Math.round(this.scorer.getEffectiveConfidence(instinct) * 100)

    // Normalize trigger: strip leading "when " if already present to avoid "When when..."
    const rawTrigger = instinct.trigger.replace(/^when\s+/i, '')
    const rawAction = instinct.action

    return `When ${rawTrigger}, you should ${rawAction} (confidence: ${pct}%)`
  }

  /**
   * Convenience: given raw instincts and a context, return the ready-to-use
   * injection string in one call.
   *
   * Usage in an agent gateway:
   *   const injection = injector.inject(entityInstincts, {
   *     domain: 'astrology',
   *     trigger: 'user is asking about natal chart interpretation',
   *     minConfidence: 0.5,
   *   })
   *   const systemPrompt = basePrompt + '\n\n' + injection
   */
  inject(allInstincts: Instinct[], context: InjectionContext, now: Date = new Date()): string {
    const relevant = this.getRelevantInstincts(allInstincts, context, now)
    return this.buildPromptInjection(relevant, now)
  }

  /**
   * Like inject() but also returns the IDs of injected instincts for outcome tracking.
   */
  injectWithIds(
    allInstincts: Instinct[],
    context: InjectionContext,
    now: Date = new Date(),
  ): { text: string; instinctIds: string[] } {
    const relevant = this.getRelevantInstincts(allInstincts, context, now)
    return {
      text: this.buildPromptInjection(relevant, now),
      instinctIds: relevant.map((i) => i.id),
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Tokenize a string into a set of lowercase words (stop-words removed).
   * Used for token-overlap relevance scoring.
   */
  private tokenize(text: string): Set<string> {
    const stopWords = new Set([
      'a',
      'an',
      'the',
      'is',
      'are',
      'was',
      'were',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'and',
      'or',
      'but',
      'with',
      'when',
      'that',
      'this',
      'it',
      'you',
      'i',
      'we',
      'they',
      'be',
      'has',
      'have',
      'do',
    ])

    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((t) => t.length > 2 && !stopWords.has(t)),
    )
  }
}
