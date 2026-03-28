/**
 * ECC Instinct System — Pattern Detector
 *
 * Receives batches of raw observations from the InstinctObserver and clusters
 * them into candidate instincts. Only patterns with 3+ corroborating observations
 * are promoted to candidates; noise and one-offs are discarded.
 *
 * Clustering strategy:
 *   1. Group observations by eventType + domain (coarse bucket).
 *   2. Within each bucket, compute a trigger fingerprint from the payload.
 *   3. Merge fingerprints whose edit-distance / key overlap exceeds a threshold.
 *   4. Any merged group with ≥ CANDIDATE_THRESHOLD members becomes a PatternCandidate.
 *
 * Examples of clusters that form candidates:
 *   - 3× user_correction with field:'format' → "when agent responds in plain text → use JSON"
 *   - 4× error_resolution with error:'type mismatch' → "when TypeScript error occurs → run tsc first"
 *   - 5× tool_call where tool:'search_web' precedes agent_output with userAccepted:true
 *     → "when researching → call search_web before drafting response"
 */

import { randomUUID } from 'crypto'

import type {
  DetectedPattern,
  Instinct,
  InstinctDomain,
  InstinctObservation,
  PatternCandidate,
} from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum observations in a cluster before it becomes a candidate. */
const CANDIDATE_THRESHOLD = 3

/** Initial confidence assigned to a freshly formed candidate instinct. */
const INITIAL_CONFIDENCE = 0.3

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Derive a coarse fingerprint key from an observation payload.
 *
 * The fingerprint is intentionally lossy — we want semantically similar
 * observations to hash to the same bucket. We extract:
 *   - eventType
 *   - domain (from _meta)
 *   - the 2-3 most discriminating payload keys sorted alphabetically
 *
 * Example:
 *   payload: { tool: 'search_web', query: 'lunar calendar', _meta: { domain: 'astrology' } }
 *   fingerprint: "tool_call|astrology|tool=search_web"
 */
function deriveFingerprint(obs: InstinctObservation): string {
  const meta = obs.payload._meta as Record<string, string> | undefined
  const domain = meta?.domain ?? 'universal'
  const entityId = meta?.entityId ?? 'unknown'

  // Remove internal meta before fingerprinting
  const { _meta: _ignored, ...rest } = obs.payload

  // Pick discriminating keys (exclude generic / high-cardinality fields)
  const highCardinalityKeys = new Set(['query', 'sessionId', 'occurredAt', 'id', 'timestamp'])
  const discriminating = Object.entries(rest)
    .filter(([k]) => !highCardinalityKeys.has(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 3)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : typeof v}`)
    .join(',')

  return `${obs.eventType}|${domain}|${discriminating}|${entityId}`
}

/**
 * Extract a human-readable trigger phrase from a cluster of observations.
 * This is a heuristic extraction — in production this would call a small LLM.
 */
function extractTrigger(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case 'user_correction':
      return `when agent response requires format correction (field: ${payload.field ?? 'unknown'})`
    case 'error_resolution':
      return `when encountering error: "${String(payload.error ?? 'unknown error')}"`
    case 'tool_call':
      return `when invoking tool "${String(payload.tool ?? 'unknown')}"`
    case 'agent_output':
      return `when producing ${String(payload.outputType ?? 'output')} for user`
    default:
      return `when ${eventType} occurs`
  }
}

/**
 * Extract a human-readable action phrase from a cluster of observations.
 * Heuristic — production would use LLM summarization.
 */
function extractAction(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case 'user_correction': {
      const corrected = payload.corrected
      const isJson = typeof corrected === 'string' && corrected.trim().startsWith('{')
      return isJson
        ? 'respond with structured JSON matching the expected schema'
        : `apply correction: ${String(corrected ?? 'use expected format').slice(0, 80)}`
    }
    case 'error_resolution':
      return `apply resolution: "${String(payload.resolution ?? 'resolve error')}"`
    case 'tool_call':
      return `call tool "${String(payload.tool ?? 'unknown')}" with appropriate arguments`
    case 'agent_output':
      return `prefer ${String(payload.outputType ?? 'this')} output format when user context matches`
    default:
      return 'apply learned behavioral adjustment'
  }
}

// ---------------------------------------------------------------------------
// PatternDetector
// ---------------------------------------------------------------------------

export class PatternDetector {
  /**
   * Cluster a batch of observations into detected patterns.
   *
   * Returns all detected patterns, including those that do not meet the
   * promotion threshold (meetsThreshold: false) — useful for monitoring.
   *
   * Example input:
   *   [
   *     { eventType: 'user_correction', payload: { field: 'format', corrected: '{"ok":true}' } },
   *     { eventType: 'user_correction', payload: { field: 'format', corrected: '{"result":...}' } },
   *     { eventType: 'user_correction', payload: { field: 'format', corrected: '{"data":...}' } },
   *   ]
   *
   * Example output candidate:
   *   trigger: "when agent response requires format correction (field: format)"
   *   action:  "respond with structured JSON matching the expected schema"
   *   confidence: 0.3 (initial)
   */
  detectPatterns(observations: InstinctObservation[]): DetectedPattern[] {
    // Step 1: Group by fingerprint
    const clusters = new Map<string, InstinctObservation[]>()

    for (const obs of observations) {
      const fp = deriveFingerprint(obs)
      const existing = clusters.get(fp)
      if (existing) {
        existing.push(obs)
      } else {
        clusters.set(fp, [obs])
      }
    }

    // Step 2: Convert clusters → DetectedPattern
    const patterns: DetectedPattern[] = []

    for (const [fingerprint, clusterObs] of clusters.entries()) {
      const representative = clusterObs[0]
      const meta = representative.payload._meta as Record<string, string> | undefined
      const domain: InstinctDomain = meta?.domain ?? 'universal'
      const entityId = meta?.entityId ?? 'unknown'

      // Strip _meta for extraction helpers
      const { _meta: _ignored, ...payloadRest } = representative.payload

      const candidate: PatternCandidate = {
        fingerprint,
        observations: clusterObs,
        representativeTrigger: extractTrigger(representative.eventType, payloadRest),
        representativeAction: extractAction(representative.eventType, payloadRest),
        domain,
        entityId,
      }

      patterns.push({
        candidate,
        meetsThreshold: clusterObs.length >= CANDIDATE_THRESHOLD,
        observationCount: clusterObs.length,
      })
    }

    // Return highest-evidence clusters first
    return patterns.sort((a, b) => b.observationCount - a.observationCount)
  }

  /**
   * Convert a PatternCandidate that has met the threshold into a draft Instinct.
   *
   * The instinct starts at confidence 0.3 — it must accumulate more evidence
   * via the ConfidenceScorer before being promoted.
   *
   * Example:
   *   candidate with 4× error_resolution { error: 'type mismatch', resolution: 'ran tsc' }
   *   →
   *   {
   *     trigger: "when encountering error: "type mismatch"",
   *     action:  "apply resolution: "ran tsc --noEmit"",
   *     confidence: 0.3,
   *     domain: 'universal',
   *     scope: 'development',
   *     evidenceCount: 4,
   *   }
   */
  candidateToInstinct(candidate: PatternCandidate): Instinct {
    const now = new Date()
    return {
      id: randomUUID(),
      trigger: candidate.representativeTrigger,
      action: candidate.representativeAction,
      confidence: INITIAL_CONFIDENCE,
      domain: candidate.domain,
      scope: 'development',
      entityId: candidate.entityId,
      evidenceCount: candidate.observations.length,
      lastObservedAt: now,
      createdAt: now,
      updatedAt: now,
    }
  }

  /**
   * Convenience: run detectPatterns and immediately convert all threshold-meeting
   * candidates into draft instincts.
   *
   * Returns { instincts, skipped } where skipped are patterns below threshold.
   */
  extractInstincts(observations: InstinctObservation[]): {
    instincts: Instinct[]
    skipped: DetectedPattern[]
  } {
    const patterns = this.detectPatterns(observations)
    const instincts: Instinct[] = []
    const skipped: DetectedPattern[] = []

    for (const pattern of patterns) {
      if (pattern.meetsThreshold) {
        instincts.push(this.candidateToInstinct(pattern.candidate))
      } else {
        skipped.push(pattern)
      }
    }

    return { instincts, skipped }
  }
}
