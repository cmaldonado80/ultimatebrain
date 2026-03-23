/**
 * ECC Instinct System — Shared Types
 *
 * Instincts are behavioral patterns, distinct from:
 * - Memories (facts, knowledge)
 * - Skills (procedures, capabilities)
 *
 * An instinct is: one trigger + one action + confidence weight + domain tag + evidence
 *
 * Example instincts:
 *   - "When user corrects agent output format → always use structured JSON"
 *   - "When build error contains 'type mismatch' → run TypeScript check before committing"
 *   - "When astrology user asks about timing → include planetary hours in response"
 *   - "When hospitality booking fails → retry with alternative date range first"
 */

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

export type InstinctScope = 'development' | 'mini_brain' | 'brain'

export type ObservationType =
  | 'tool_call'
  | 'user_correction'
  | 'error_resolution'
  | 'agent_output'

export type InstinctDomain = string // 'universal' | 'astrology' | 'hospitality' | etc.

// ---------------------------------------------------------------------------
// Instinct — the core behavioral pattern record
// ---------------------------------------------------------------------------

export interface Instinct {
  id: string
  /** Natural-language trigger condition. e.g. "when user corrects output format" */
  trigger: string
  /** Natural-language action to take. e.g. "respond with structured JSON" */
  action: string
  /** Bayesian confidence score, 0.0 – 1.0. Starts at 0.3, decays over time. */
  confidence: number
  /** Domain tag. 'universal' applies everywhere; otherwise e.g. 'astrology', 'hospitality'. */
  domain: InstinctDomain
  /** Promotion scope: starts at development, can rise to mini_brain or brain. */
  scope: InstinctScope
  /** ID of the entity (Development, Mini Brain, Brain) that learned this instinct. */
  entityId: string
  /** Number of independent observations backing this instinct. */
  evidenceCount: number
  /** Timestamp of the most recent supporting observation. */
  lastObservedAt: Date
  /** If this instinct has been evolved into a skill/command, its ID goes here. */
  evolvedInto?: string
  createdAt: Date
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// Instinct Observation — a raw event recorded by the observer
// ---------------------------------------------------------------------------

export interface InstinctObservation {
  id: string
  /** If this observation is linked to a known instinct, its ID is stored here. */
  instinctId?: string
  /** The type of event that was observed. */
  eventType: ObservationType
  /**
   * Domain-specific payload.
   * Examples:
   *   tool_call:         { tool: 'search_web', args: { query: '...' }, result: 'success' }
   *   user_correction:   { original: '...', corrected: '...', field: 'format' }
   *   error_resolution:  { error: 'type mismatch', resolution: 'ran tsc --noEmit' }
   *   agent_output:      { agentId: '...', outputType: 'json', accepted: true }
   */
  payload: Record<string, unknown>
  createdAt: Date
}

// ---------------------------------------------------------------------------
// Confidence update — records a confidence change event
// ---------------------------------------------------------------------------

export interface ConfidenceUpdate {
  instinctId: string
  previousConfidence: number
  newConfidence: number
  /** What caused the change: repetition, user_override, or time_decay. */
  reason: 'repetition' | 'user_override' | 'time_decay'
  appliedAt: Date
}

// ---------------------------------------------------------------------------
// Pattern detection intermediaries
// ---------------------------------------------------------------------------

export interface PatternCandidate {
  /** Unique fingerprint derived from trigger + action similarity clustering. */
  fingerprint: string
  observations: InstinctObservation[]
  /** Extracted representative trigger phrase from the cluster. */
  representativeTrigger: string
  /** Extracted representative action phrase from the cluster. */
  representativeAction: string
  domain: InstinctDomain
  /** Entity that generated the majority of observations. */
  entityId: string
}

export interface DetectedPattern {
  candidate: PatternCandidate
  /** Pattern is only promoted to a candidate instinct when this is true (3+ observations). */
  meetsThreshold: boolean
  /** Count of unique observations in this cluster. */
  observationCount: number
}

// ---------------------------------------------------------------------------
// Injection context — used when building prompt injections
// ---------------------------------------------------------------------------

export interface InjectionContext {
  domain: InstinctDomain
  /** Trigger text from the current agent context to match against instincts. */
  trigger: string
  /** Minimum confidence to include an instinct in the injection. */
  minConfidence: number
}

// ---------------------------------------------------------------------------
// Promotion result
// ---------------------------------------------------------------------------

export interface PromotionResult {
  shouldPromote: boolean
  newScope: InstinctScope | null
  reason: string
}

// ---------------------------------------------------------------------------
// Evolution result
// ---------------------------------------------------------------------------

export interface EvolutionResult {
  instinctIds: string[]
  /** 'skill' or 'command' */
  artifactType: 'skill' | 'command'
  /** Reference ID of the generated artifact. */
  artifactId: string
  /** For skills, the generated SKILL.md content (stub). */
  content?: string
}
