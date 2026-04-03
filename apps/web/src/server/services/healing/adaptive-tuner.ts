/**
 * Adaptive Resource Tuner
 *
 * Dynamically adjusts rate limits, timeouts, and model selection
 * based on real-time outcome feedback.
 *
 * Architecture:
 * 1. Outcome tracking — success/failure/latency per agent, provider, model
 * 2. Feedback loop — adjust parameters based on sliding window outcomes
 * 3. Pressure detection — identify when agents/providers are under stress
 * 4. Auto-tuning — rate limits, timeouts, concurrency, model tier
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface OutcomeRecord {
  timestamp: number
  success: boolean
  latencyMs: number
  tokensUsed: number
}

export interface TuningProfile {
  maxTokens: number
  refillRatePerSecond: number
  timeoutMs: number
  concurrencyLimit: number
  modelTier: 'premium' | 'standard' | 'economy'
}

export interface TuningState {
  entityId: string
  entityType: 'agent' | 'provider' | 'workspace'
  current: TuningProfile
  baseline: TuningProfile
  pressure: number // 0-1, higher = more stressed
  successRate: number // rolling window
  avgLatencyMs: number
  lastAdjusted: number
  adjustmentCount: number
}

export interface TuningAction {
  entityId: string
  field: keyof TuningProfile
  oldValue: number | string
  newValue: number | string
  reason: string
}

// ── Configuration ────────────────────────────────────────────────────────

const OUTCOME_WINDOW = 50 // last N outcomes for calculations
const ADJUSTMENT_COOLDOWN_MS = 60 * 1000 // min 1 min between adjustments
const SUCCESS_RATE_TARGET = 0.85
const LATENCY_P95_TARGET_MS = 30000

const BASELINE_PROFILES: Record<string, TuningProfile> = {
  agent: {
    maxTokens: 100000,
    refillRatePerSecond: 5000,
    timeoutMs: 60000,
    concurrencyLimit: 3,
    modelTier: 'standard',
  },
  provider: {
    maxTokens: 500000,
    refillRatePerSecond: 20000,
    timeoutMs: 90000,
    concurrencyLimit: 10,
    modelTier: 'standard',
  },
  workspace: {
    maxTokens: 500000,
    refillRatePerSecond: 20000,
    timeoutMs: 120000,
    concurrencyLimit: 20,
    modelTier: 'standard',
  },
}

// ── Adaptive Tuner ───────────────────────────────────────────────────────

export class AdaptiveResourceTuner {
  private outcomes = new Map<string, OutcomeRecord[]>()
  private states = new Map<string, TuningState>()
  private actions: TuningAction[] = []
  private maxActionHistory = 200

  /**
   * Record an outcome for an entity (agent, provider, workspace).
   */
  recordOutcome(entityId: string, entityType: TuningState['entityType'], outcome: OutcomeRecord) {
    const records = this.outcomes.get(entityId) ?? []
    records.push(outcome)
    while (records.length > OUTCOME_WINDOW) records.shift()
    this.outcomes.set(entityId, records)

    // Initialize state if needed
    if (!this.states.has(entityId)) {
      const baseline = { ...(BASELINE_PROFILES[entityType] ?? BASELINE_PROFILES['agent']!) }
      this.states.set(entityId, {
        entityId,
        entityType,
        current: { ...baseline },
        baseline: { ...baseline },
        pressure: 0,
        successRate: 1,
        avgLatencyMs: 0,
        lastAdjusted: 0,
        adjustmentCount: 0,
      })
    }
  }

  /**
   * Run the tuning loop: analyze outcomes and adjust parameters.
   */
  tune(): TuningAction[] {
    const newActions: TuningAction[] = []
    const now = Date.now()

    for (const [entityId, records] of this.outcomes) {
      if (records.length < 5) continue // need minimum data

      const state = this.states.get(entityId)
      if (!state) continue
      if (now - state.lastAdjusted < ADJUSTMENT_COOLDOWN_MS) continue

      // Calculate metrics
      const successRate = records.filter((r) => r.success).length / records.length
      const latencies = records.map((r) => r.latencyMs).sort((a, b) => a - b)
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length
      const p95Latency = latencies[Math.floor(latencies.length * 0.95)] ?? avgLatency

      state.successRate = successRate
      state.avgLatencyMs = avgLatency

      // Calculate pressure (0-1)
      const successPressure = Math.max(0, (SUCCESS_RATE_TARGET - successRate) / SUCCESS_RATE_TARGET)
      const latencyPressure = Math.max(
        0,
        (p95Latency - LATENCY_P95_TARGET_MS) / LATENCY_P95_TARGET_MS,
      )
      state.pressure = Math.min(1, (successPressure + latencyPressure) / 2)

      // Adjust based on pressure
      if (state.pressure > 0.5) {
        // Under stress — reduce load, increase timeouts, downgrade model
        const actions = this.applyPressureRelief(state)
        newActions.push(...actions)
      } else if (state.pressure < 0.1 && successRate > 0.95) {
        // Very healthy — cautiously restore toward baseline
        const actions = this.applyRecovery(state)
        newActions.push(...actions)
      }
    }

    this.actions.push(...newActions)
    while (this.actions.length > this.maxActionHistory) this.actions.shift()

    return newActions
  }

  private applyPressureRelief(state: TuningState): TuningAction[] {
    const actions: TuningAction[] = []
    const now = Date.now()

    // 1. Increase timeout if latency is high
    if (state.avgLatencyMs > state.current.timeoutMs * 0.7) {
      const newTimeout = Math.min(state.current.timeoutMs * 1.5, state.baseline.timeoutMs * 3)
      if (newTimeout !== state.current.timeoutMs) {
        actions.push({
          entityId: state.entityId,
          field: 'timeoutMs',
          oldValue: state.current.timeoutMs,
          newValue: newTimeout,
          reason: `Avg latency ${state.avgLatencyMs.toFixed(0)}ms approaching timeout`,
        })
        state.current.timeoutMs = newTimeout
      }
    }

    // 2. Reduce concurrency
    if (state.current.concurrencyLimit > 1) {
      const newLimit = Math.max(1, Math.floor(state.current.concurrencyLimit * 0.7))
      if (newLimit !== state.current.concurrencyLimit) {
        actions.push({
          entityId: state.entityId,
          field: 'concurrencyLimit',
          oldValue: state.current.concurrencyLimit,
          newValue: newLimit,
          reason: `Pressure ${(state.pressure * 100).toFixed(0)}% — reducing concurrency`,
        })
        state.current.concurrencyLimit = newLimit
      }
    }

    // 3. Downgrade model tier under heavy pressure
    if (state.pressure > 0.7) {
      const tierDowngrade: Record<string, TuningProfile['modelTier']> = {
        premium: 'standard',
        standard: 'economy',
      }
      const newTier = tierDowngrade[state.current.modelTier]
      if (newTier) {
        actions.push({
          entityId: state.entityId,
          field: 'modelTier',
          oldValue: state.current.modelTier,
          newValue: newTier,
          reason: `High pressure ${(state.pressure * 100).toFixed(0)}% — downgrading model tier`,
        })
        state.current.modelTier = newTier
      }
    }

    // 4. Reduce refill rate to slow down requests
    if (state.pressure > 0.6) {
      const newRate = Math.max(
        state.baseline.refillRatePerSecond * 0.3,
        state.current.refillRatePerSecond * 0.7,
      )
      if (Math.abs(newRate - state.current.refillRatePerSecond) > 100) {
        actions.push({
          entityId: state.entityId,
          field: 'refillRatePerSecond',
          oldValue: state.current.refillRatePerSecond,
          newValue: Math.round(newRate),
          reason: `Throttling request rate under pressure`,
        })
        state.current.refillRatePerSecond = Math.round(newRate)
      }
    }

    if (actions.length > 0) {
      state.lastAdjusted = now
      state.adjustmentCount++
    }

    return actions
  }

  private applyRecovery(state: TuningState): TuningAction[] {
    const actions: TuningAction[] = []
    const now = Date.now()

    // Gradually restore toward baseline (10% per cycle)
    const restore = (field: 'timeoutMs' | 'concurrencyLimit' | 'refillRatePerSecond') => {
      const current = state.current[field] as number
      const baseline = state.baseline[field] as number
      if (current === baseline) return

      const step = (baseline - current) * 0.1
      if (Math.abs(step) < 1) return

      const newValue = Math.round(current + step)
      actions.push({
        entityId: state.entityId,
        field,
        oldValue: current,
        newValue,
        reason: `Recovering toward baseline (success rate: ${(state.successRate * 100).toFixed(0)}%)`,
      })
      ;(state.current[field] as number) = newValue
    }

    restore('timeoutMs')
    restore('concurrencyLimit')
    restore('refillRatePerSecond')

    // Restore model tier
    const tierUpgrade: Record<string, TuningProfile['modelTier']> = {
      economy: 'standard',
      standard: 'premium',
    }
    if (state.current.modelTier !== state.baseline.modelTier) {
      const newTier = tierUpgrade[state.current.modelTier]
      if (newTier) {
        actions.push({
          entityId: state.entityId,
          field: 'modelTier',
          oldValue: state.current.modelTier,
          newValue: newTier,
          reason: `Healthy — upgrading model tier`,
        })
        state.current.modelTier = newTier
      }
    }

    if (actions.length > 0) {
      state.lastAdjusted = now
      state.adjustmentCount++
    }

    return actions
  }

  /**
   * Get current tuning profile for an entity.
   */
  getProfile(entityId: string): TuningProfile | undefined {
    return this.states.get(entityId)?.current
  }

  /**
   * Get full tuning state for all entities.
   */
  getAllStates(): TuningState[] {
    return Array.from(this.states.values())
  }

  /**
   * Get recent tuning actions.
   */
  getActionHistory(): TuningAction[] {
    return [...this.actions]
  }

  /**
   * Override baseline for a specific entity.
   */
  setBaseline(
    entityId: string,
    entityType: TuningState['entityType'],
    profile: Partial<TuningProfile>,
  ) {
    const existing = this.states.get(entityId)
    const baseline = {
      ...(BASELINE_PROFILES[entityType] ?? BASELINE_PROFILES['agent']!),
      ...profile,
    }
    if (existing) {
      existing.baseline = { ...baseline }
    } else {
      this.states.set(entityId, {
        entityId,
        entityType,
        current: { ...baseline },
        baseline: { ...baseline },
        pressure: 0,
        successRate: 1,
        avgLatencyMs: 0,
        lastAdjusted: 0,
        adjustmentCount: 0,
      })
    }
  }
}
