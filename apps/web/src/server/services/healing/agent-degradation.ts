/**
 * Agent Capability Degradation
 *
 * Graceful downgrade under pressure instead of binary work/fail.
 *
 * Architecture:
 * 1. Capability levels — full → reduced → minimal → suspended
 * 2. Pressure signals — error rate, latency, token exhaustion, consecutive failures
 * 3. Auto-downgrade — step down capabilities as pressure increases
 * 4. Auto-upgrade — restore capabilities as conditions improve
 * 5. Per-agent profiles — each agent has independent degradation state
 */

import type { Database } from '@solarc/db'
import { agents, healingLogs } from '@solarc/db'
import { eq } from 'drizzle-orm'

import { logger } from '../../../lib/logger'
import { broadcastDegradation } from './degradation-broadcaster'

// ── Types ────────────────────────────────────────────────────────────────

export type CapabilityLevel = 'full' | 'reduced' | 'minimal' | 'suspended'

export interface DegradationProfile {
  agentId: string
  agentName: string
  level: CapabilityLevel
  pressure: number // 0-1
  consecutiveFailures: number
  consecutiveSuccesses: number
  modelOverride: string | null // downgraded model, null = use default
  maxConcurrency: number
  allowedTicketTypes: 'all' | 'simple_only' | 'none'
  tokenBudgetMultiplier: number // 1.0 = full, 0.5 = half, etc.
  lastTransition: number
  transitionHistory: Array<{
    from: CapabilityLevel
    to: CapabilityLevel
    timestamp: number
    reason: string
  }>
}

export interface DegradationEvent {
  agentId: string
  agentName: string
  from: CapabilityLevel
  to: CapabilityLevel
  reason: string
}

// ── Configuration ────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<
  CapabilityLevel,
  {
    maxConcurrency: number
    allowedTicketTypes: DegradationProfile['allowedTicketTypes']
    tokenBudgetMultiplier: number
    modelTier: 'premium' | 'standard' | 'economy' | null
  }
> = {
  full: {
    maxConcurrency: 3,
    allowedTicketTypes: 'all',
    tokenBudgetMultiplier: 1.0,
    modelTier: null, // use default
  },
  reduced: {
    maxConcurrency: 2,
    allowedTicketTypes: 'all',
    tokenBudgetMultiplier: 0.7,
    modelTier: 'standard',
  },
  minimal: {
    maxConcurrency: 1,
    allowedTicketTypes: 'simple_only',
    tokenBudgetMultiplier: 0.4,
    modelTier: 'economy',
  },
  suspended: {
    maxConcurrency: 0,
    allowedTicketTypes: 'none',
    tokenBudgetMultiplier: 0,
    modelTier: null,
  },
}

// Thresholds for transitions
const DOWNGRADE_CONSECUTIVE_FAILURES = 3
const UPGRADE_CONSECUTIVE_SUCCESSES = 5
const TRANSITION_COOLDOWN_MS = 2 * 60 * 1000 // 2 min between transitions
const MAX_HISTORY_PER_AGENT = 20

const LEVEL_ORDER: CapabilityLevel[] = ['full', 'reduced', 'minimal', 'suspended']

// Model tier mapping for degradation
const MODEL_OVERRIDES: Record<string, string> = {
  economy: 'claude-haiku-4-5-20251001',
  standard: 'claude-sonnet-4-6',
  premium: 'claude-opus-4-6',
}

// ── Agent Degradation Manager ────────────────────────────────────────────

export class AgentDegradationManager {
  private profiles = new Map<string, DegradationProfile>()
  private events: DegradationEvent[] = []
  private maxEvents = 100

  constructor(private db: Database) {}

  /**
   * Record a task outcome for an agent.
   */
  recordOutcome(agentId: string, agentName: string, success: boolean): DegradationEvent | null {
    const profile = this.getOrCreateProfile(agentId, agentName)

    if (success) {
      profile.consecutiveSuccesses++
      profile.consecutiveFailures = 0
    } else {
      profile.consecutiveFailures++
      profile.consecutiveSuccesses = 0
    }

    // Calculate pressure
    profile.pressure = this.calculatePressure(profile)

    // Check for transitions
    return this.evaluateTransition(profile)
  }

  /**
   * Force a specific capability level for an agent.
   */
  forceLevel(
    agentId: string,
    agentName: string,
    level: CapabilityLevel,
    reason: string,
  ): DegradationEvent {
    const profile = this.getOrCreateProfile(agentId, agentName)
    const from = profile.level
    this.applyLevel(profile, level, reason)
    const event: DegradationEvent = { agentId, agentName, from, to: level, reason }
    this.recordEvent(event)
    return event
  }

  /**
   * Get degradation profile for an agent.
   */
  getProfile(agentId: string): DegradationProfile | undefined {
    return this.profiles.get(agentId)
  }

  /**
   * Get all profiles.
   */
  getAllProfiles(): DegradationProfile[] {
    return Array.from(this.profiles.values())
  }

  /**
   * Get recent degradation events.
   */
  getRecentEvents(): DegradationEvent[] {
    return [...this.events]
  }

  /**
   * Check if an agent can accept a ticket of given complexity.
   */
  canAcceptTicket(agentId: string, isComplex: boolean): boolean {
    const profile = this.profiles.get(agentId)
    if (!profile) return true // unknown agent = assume full

    if (profile.level === 'suspended') return false
    if (profile.allowedTicketTypes === 'none') return false
    if (profile.allowedTicketTypes === 'simple_only' && isComplex) return false
    return true
  }

  /**
   * Get model override for an agent (if degraded).
   */
  getModelOverride(agentId: string): string | null {
    return this.profiles.get(agentId)?.modelOverride ?? null
  }

  /**
   * Get concurrency limit for an agent.
   */
  getConcurrencyLimit(agentId: string): number {
    return this.profiles.get(agentId)?.maxConcurrency ?? LEVEL_CONFIG.full.maxConcurrency
  }

  /**
   * Get token budget multiplier for an agent.
   */
  getTokenBudgetMultiplier(agentId: string): number {
    return this.profiles.get(agentId)?.tokenBudgetMultiplier ?? 1.0
  }

  private getOrCreateProfile(agentId: string, agentName: string): DegradationProfile {
    let profile = this.profiles.get(agentId)
    if (!profile) {
      profile = {
        agentId,
        agentName,
        level: 'full',
        pressure: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        modelOverride: null,
        maxConcurrency: LEVEL_CONFIG.full.maxConcurrency,
        allowedTicketTypes: LEVEL_CONFIG.full.allowedTicketTypes,
        tokenBudgetMultiplier: LEVEL_CONFIG.full.tokenBudgetMultiplier,
        lastTransition: 0,
        transitionHistory: [],
      }
      this.profiles.set(agentId, profile)
    }
    return profile
  }

  private calculatePressure(profile: DegradationProfile): number {
    // Pressure from consecutive failures (0-1)
    const failPressure = Math.min(
      1,
      profile.consecutiveFailures / (DOWNGRADE_CONSECUTIVE_FAILURES * 2),
    )
    // Inverse of consecutive successes acts as recovery signal
    const recoverySignal = Math.min(1, profile.consecutiveSuccesses / UPGRADE_CONSECUTIVE_SUCCESSES)
    return Math.max(0, failPressure - recoverySignal * 0.5)
  }

  private evaluateTransition(profile: DegradationProfile): DegradationEvent | null {
    const now = Date.now()
    if (now - profile.lastTransition < TRANSITION_COOLDOWN_MS) return null

    const currentIdx = LEVEL_ORDER.indexOf(profile.level)

    // Downgrade: consecutive failures exceeded threshold
    if (
      profile.consecutiveFailures >= DOWNGRADE_CONSECUTIVE_FAILURES &&
      currentIdx < LEVEL_ORDER.length - 1
    ) {
      const newLevel = LEVEL_ORDER[currentIdx + 1]!
      const reason = `${profile.consecutiveFailures} consecutive failures`
      this.applyLevel(profile, newLevel, reason)
      profile.consecutiveFailures = 0 // reset to prevent immediate re-downgrade
      profile.consecutiveSuccesses = 0
      const event: DegradationEvent = {
        agentId: profile.agentId,
        agentName: profile.agentName,
        from: LEVEL_ORDER[currentIdx]!,
        to: newLevel,
        reason,
      }
      this.recordEvent(event)
      this.persistTransition(event)
      broadcastDegradation(event, this.db).catch((err) => {
        logger.warn(
          { err: err instanceof Error ? err : undefined, agentId: event.agentId },
          'agent-degradation: failed to broadcast event',
        )
      })
      return event
    }

    // Upgrade: consecutive successes exceeded threshold
    if (profile.consecutiveSuccesses >= UPGRADE_CONSECUTIVE_SUCCESSES && currentIdx > 0) {
      const newLevel = LEVEL_ORDER[currentIdx - 1]!
      const reason = `${profile.consecutiveSuccesses} consecutive successes`
      this.applyLevel(profile, newLevel, reason)
      profile.consecutiveSuccesses = 0 // reset to prevent immediate re-upgrade
      profile.consecutiveFailures = 0 // reset to prevent immediate re-downgrade
      const event: DegradationEvent = {
        agentId: profile.agentId,
        agentName: profile.agentName,
        from: LEVEL_ORDER[currentIdx]!,
        to: newLevel,
        reason,
      }
      this.recordEvent(event)
      this.persistTransition(event)
      broadcastDegradation(event, this.db).catch((err) => {
        logger.warn(
          { err: err instanceof Error ? err : undefined, agentId: event.agentId },
          'agent-degradation: failed to broadcast event',
        )
      })
      return event
    }

    return null
  }

  private applyLevel(profile: DegradationProfile, level: CapabilityLevel, reason: string) {
    const config = LEVEL_CONFIG[level]
    const from = profile.level

    profile.level = level
    profile.maxConcurrency = config.maxConcurrency
    profile.allowedTicketTypes = config.allowedTicketTypes
    profile.tokenBudgetMultiplier = config.tokenBudgetMultiplier
    profile.modelOverride = config.modelTier ? (MODEL_OVERRIDES[config.modelTier] ?? null) : null
    profile.lastTransition = Date.now()

    profile.transitionHistory.push({ from, to: level, timestamp: Date.now(), reason })
    while (profile.transitionHistory.length > MAX_HISTORY_PER_AGENT) {
      profile.transitionHistory.shift()
    }

    // If suspended, update DB
    if (level === 'suspended') {
      this.db
        .update(agents)
        .set({ status: 'offline', updatedAt: new Date() })
        .where(eq(agents.id, profile.agentId))
        .catch((err) =>
          logger.warn(
            { err, agentId: profile.agentId },
            'degradation: DB status update to offline failed',
          ),
        )
    } else if (from === 'suspended') {
      // Reactivate
      this.db
        .update(agents)
        .set({ status: 'idle', updatedAt: new Date() })
        .where(eq(agents.id, profile.agentId))
        .catch((err) =>
          logger.warn(
            { err, agentId: profile.agentId },
            'degradation: DB status update to idle failed',
          ),
        )
    }
  }

  private recordEvent(event: DegradationEvent) {
    this.events.push(event)
    while (this.events.length > this.maxEvents) this.events.shift()
  }

  private persistTransition(event: DegradationEvent) {
    this.db
      .insert(healingLogs)
      .values({
        action: `degrade:${event.from}->${event.to}`,
        target: event.agentName,
        reason: event.reason,
        success: true,
      })
      .catch((err) =>
        logger.warn(
          { err, agentId: event.agentId },
          'degradation: persist transition to healing log failed',
        ),
      )
  }
}
