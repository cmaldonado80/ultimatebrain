/**
 * ECC Instinct System — Promoter
 *
 * Manages the promotion cascade that moves instincts up the entity hierarchy:
 *
 *   Development → Mini Brain → Brain (universal)
 *
 * Promotion rules:
 *   1. A Development-scoped instinct with confidence ≥ 0.7 is considered "reliable"
 *      at the Development level (no scope change yet — just marks it stable).
 *
 *   2. If the same instinct pattern is confirmed in 2+ Developments that share
 *      the same parent Mini Brain, it is promoted to `mini_brain` scope.
 *      The Mini Brain now injects it for ALL its Developments.
 *
 *   3. If the same instinct pattern is confirmed in 2+ Mini Brains (possibly
 *      across different domains), it is promoted to `brain` scope — universal.
 *
 *   4. A `brain`-scoped instinct with confidence ≥ 0.9 AND evidenceCount ≥ 50
 *      becomes a candidate for evolution into a Skill or Command via evolve.ts.
 *
 * Examples:
 *   - Dev-A and Dev-B (both under Mini Brain "ResearchBrain") both have:
 *     trigger: "when build error contains 'type mismatch'"
 *     action:  "run tsc --noEmit before committing"
 *     → Promoted to mini_brain scope on "ResearchBrain"
 *
 *   - "ResearchBrain" and "WritingBrain" both carry the JSON-format instinct
 *     → Promoted to brain scope (universal for all agents)
 *
 *   - Brain instinct "use structured JSON for all API responses" reaches
 *     confidence 0.92, evidenceCount 60
 *     → Candidate for evolution into a Skill: "structured-api-response"
 */

import { randomUUID } from 'crypto'
import type { Instinct, InstinctScope, PromotionResult } from './types'

// ---------------------------------------------------------------------------
// Promotion thresholds
// ---------------------------------------------------------------------------

const PROMOTION_THRESHOLDS = {
  /** Min confidence for a development instinct to be considered stable. */
  developmentStable: 0.7,
  /** Min peer entities required to promote from development → mini_brain. */
  devPeersForMiniPromote: 2,
  /** Min peer Mini Brains required to promote from mini_brain → brain. */
  miniBrainPeersForBrainPromote: 2,
  /** Min confidence for a brain instinct to become an evolution candidate. */
  evolutionMinConfidence: 0.9,
  /** Min evidence count for a brain instinct to become an evolution candidate. */
  evolutionMinEvidence: 50,
} as const

// ---------------------------------------------------------------------------
// Peer registry — tracks which entities share the same instinct pattern
// ---------------------------------------------------------------------------

/**
 * A minimal in-memory peer registry.
 *
 * In production this would query a database:
 *   SELECT entity_id, parent_id FROM instincts WHERE trigger_hash = ?
 *
 * For now it's injected as a function to keep the Promoter decoupled.
 */
export type PeerLookupFn = (
  triggerFingerprint: string,
  scope: InstinctScope,
) => Promise<{ entityId: string; parentId: string }[]>

// ---------------------------------------------------------------------------
// InstinctPromoter
// ---------------------------------------------------------------------------

export class InstinctPromoter {
  constructor(private lookupPeers: PeerLookupFn) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Evaluate whether an instinct should be promoted to a higher scope.
   *
   * Returns a PromotionResult indicating whether promotion should happen,
   * what the new scope would be, and a human-readable reason.
   *
   * Examples:
   *   checkForPromotion(devInstinct, confidence=0.72)
   *   → { shouldPromote: false, newScope: null, reason: "Confidence meets stable threshold but only 1 peer entity confirmed" }
   *
   *   checkForPromotion(devInstinct, confidence=0.72, peers=["Dev-A","Dev-B"])
   *   → { shouldPromote: true, newScope: "mini_brain", reason: "Pattern confirmed in 2 Developments under same Mini Brain" }
   *
   *   checkForPromotion(miniBrainInstinct, confidence=0.91, evidenceCount=55)
   *   → { shouldPromote: true, newScope: "brain", reason: "Pattern confirmed in 2+ Mini Brains" }
   *
   *   checkForPromotion(brainInstinct, confidence=0.93, evidenceCount=60)
   *   → { shouldPromote: false, newScope: null, reason: "Brain instinct meets evolution threshold — use InstinctEvolver instead" }
   */
  async checkForPromotion(instinct: Instinct): Promise<PromotionResult> {
    // Brain-scoped instincts don't promote further — they may evolve
    if (instinct.scope === 'brain') {
      if (
        instinct.confidence >= PROMOTION_THRESHOLDS.evolutionMinConfidence &&
        instinct.evidenceCount >= PROMOTION_THRESHOLDS.evolutionMinEvidence
      ) {
        return {
          shouldPromote: false,
          newScope: null,
          reason:
            `Brain instinct meets evolution threshold ` +
            `(confidence: ${instinct.confidence.toFixed(2)}, evidence: ${instinct.evidenceCount}) ` +
            `— use InstinctEvolver to convert to a Skill`,
        }
      }
      return {
        shouldPromote: false,
        newScope: null,
        reason: 'Instinct is already at brain scope',
      }
    }

    // Development → Mini Brain promotion
    if (instinct.scope === 'development') {
      if (instinct.confidence < PROMOTION_THRESHOLDS.developmentStable) {
        return {
          shouldPromote: false,
          newScope: null,
          reason: `Confidence ${instinct.confidence.toFixed(2)} below stable threshold ${PROMOTION_THRESHOLDS.developmentStable} — keep observing`,
        }
      }

      const peers = await this.lookupPeers(
        this.fingerprintTrigger(instinct.trigger),
        'development',
      )
      const uniqueEntities = new Set(peers.map((p) => p.entityId))

      if (uniqueEntities.size < PROMOTION_THRESHOLDS.devPeersForMiniPromote) {
        return {
          shouldPromote: false,
          newScope: null,
          reason:
            `Confidence is stable but only ${uniqueEntities.size} peer Development(s) confirmed ` +
            `(need ${PROMOTION_THRESHOLDS.devPeersForMiniPromote})`,
        }
      }

      // Check all peers share the same parent Mini Brain
      const parentIds = new Set(peers.map((p) => p.parentId))
      if (parentIds.size !== 1) {
        return {
          shouldPromote: false,
          newScope: null,
          reason: `Pattern seen in ${uniqueEntities.size} Developments but across ${parentIds.size} different Mini Brains — needs same parent`,
        }
      }

      return {
        shouldPromote: true,
        newScope: 'mini_brain',
        reason:
          `Pattern confirmed in ${uniqueEntities.size} Developments ` +
          `under the same Mini Brain (parent: ${[...parentIds][0]})`,
      }
    }

    // Mini Brain → Brain promotion
    if (instinct.scope === 'mini_brain') {
      const peers = await this.lookupPeers(
        this.fingerprintTrigger(instinct.trigger),
        'mini_brain',
      )
      const uniqueMiniBrains = new Set(peers.map((p) => p.entityId))

      if (uniqueMiniBrains.size < PROMOTION_THRESHOLDS.miniBrainPeersForBrainPromote) {
        return {
          shouldPromote: false,
          newScope: null,
          reason:
            `Only ${uniqueMiniBrains.size} Mini Brain(s) carry this instinct ` +
            `(need ${PROMOTION_THRESHOLDS.miniBrainPeersForBrainPromote} for Brain promotion)`,
        }
      }

      return {
        shouldPromote: true,
        newScope: 'brain',
        reason:
          `Pattern confirmed across ${uniqueMiniBrains.size} Mini Brains — ` +
          `promoting to universal Brain scope`,
      }
    }

    return { shouldPromote: false, newScope: null, reason: 'Unknown scope' }
  }

  /**
   * Execute the promotion: clone the instinct at the new scope.
   *
   * In production this would also:
   *   - Persist the promoted instinct to the database
   *   - Mark the original instinct as "superseded_by" the new one
   *   - Notify the parent entity's system prompt cache to invalidate
   *
   * Example:
   *   promote('instinct-dev-abc', 'mini_brain')
   *   → creates a new instinct with scope='mini_brain', entityId=<parent mini brain id>
   *     and same trigger/action/domain
   */
  promote(instinct: Instinct, newScope: InstinctScope, newEntityId: string): Instinct {
    const now = new Date()
    return {
      ...instinct,
      id: randomUUID(),
      scope: newScope,
      entityId: newEntityId,
      // Reset evidence count at the new scope — needs fresh corroboration
      evidenceCount: 1,
      confidence: Math.max(0.3, instinct.confidence * 0.85), // slight confidence haircut on promotion
      lastObservedAt: now,
      createdAt: now,
      updatedAt: now,
    }
  }

  /**
   * Check if a brain-scoped instinct qualifies for evolution into a Skill.
   *
   * Example:
   *   isEvolutionCandidate({ scope: 'brain', confidence: 0.93, evidenceCount: 60 })
   *   → true  — "structured JSON for API responses" should become a formal Skill
   */
  isEvolutionCandidate(instinct: Instinct): boolean {
    return (
      instinct.scope === 'brain' &&
      instinct.confidence >= PROMOTION_THRESHOLDS.evolutionMinConfidence &&
      instinct.evidenceCount >= PROMOTION_THRESHOLDS.evolutionMinEvidence
    )
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Reduce a trigger string to a normalized fingerprint for peer matching.
   * Simple normalization: lowercase, remove punctuation, collapse whitespace.
   *
   * Example:
   *   "When build error contains 'type mismatch'" → "when build error contains type mismatch"
   */
  private fingerprintTrigger(trigger: string): string {
    return trigger
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
}
