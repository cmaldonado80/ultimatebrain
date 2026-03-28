/**
 * ECC Instinct System
 *
 * Behavioral pattern learning for the Solarc Brain platform.
 *
 * Instincts are distinct from:
 *   - Memory   → facts and knowledge (what the agent knows)
 *   - Skills   → procedures and capabilities (what the agent can do)
 *   - Instincts → learned behavioral patterns (how the agent tends to act)
 *
 * Lifecycle:
 *   ObservationEvent
 *     ↓  (InstinctObserver.observe)
 *   InstinctObservation[]  (buffered)
 *     ↓  (PatternDetector.detectPatterns)
 *   PatternCandidate  (3+ matching observations)
 *     ↓  (PatternDetector.candidateToInstinct)
 *   Instinct  (confidence: 0.3, scope: development)
 *     ↓  (ConfidenceScorer.updateConfidence)
 *   Instinct  (confidence: 0.5 → 0.7 → 0.9)
 *     ↓  (InstinctPromoter.checkForPromotion)
 *   Instinct  (scope: mini_brain → brain)
 *     ↓  (InstinctInjector.inject)
 *   Agent system prompt  (behavioral guidance injected at runtime)
 *     ↓  (InstinctEvolver.evolveToSkill / evolveToCommand)
 *   Skill.md / Command definition  (graduated from heuristic to formal capability)
 */

// Core types
export type {
  ConfidenceUpdate,
  DetectedPattern,
  EvolutionResult,
  InjectionContext,
  Instinct,
  InstinctDomain,
  InstinctObservation,
  InstinctScope,
  ObservationType,
  PatternCandidate,
  PromotionResult,
} from './types'

// Observer — raw event recording
export type { FlushHandler, ObservationEvent, ObserverConfig } from './observer'
export { InstinctObserver } from './observer'

// Pattern Detector — clusters observations into candidate instincts
export { PatternDetector } from './pattern-detector'

// Confidence Scorer — Bayesian updates + time-based decay
export { ConfidenceScorer } from './confidence'

// Promoter — promotion cascade across entity tiers
export type { PeerLookupFn } from './promoter'
export { InstinctPromoter } from './promoter'

// Injector — injects relevant instincts into agent system prompts
export { InstinctInjector } from './injector'

// Evolver — graduates instinct clusters into Skills or Commands
export type { InstinctCluster } from './evolve'
export { InstinctEvolver } from './evolve'
