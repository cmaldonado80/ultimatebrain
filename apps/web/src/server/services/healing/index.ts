import type { Database } from '@solarc/db'

export { AdaptiveResourceTuner, type TuningAction, type TuningState } from './adaptive-tuner'
export {
  AgentDegradationManager,
  type CapabilityLevel,
  type DegradationEvent,
  type DegradationProfile,
} from './agent-degradation'
export { type CortexCycleResult, type CortexStatus, SelfHealingCortex } from './cortex'
export {
  type DiagnosticReport,
  type HealingAction,
  HealingEngine,
  type HealingRecord,
  type HealthStatus,
} from './healing-engine'
export { type ExecutionRecord, InstinctActionExecutor } from './instinct-executor'
export {
  PredictiveHealingEngine,
  type PredictiveReport,
  type TrendAnalysis,
} from './predictive-engine'
export {
  createAgentRecoveryPlan,
  createEntityRecoveryPlan,
  createTicketRecoveryPlan,
  type RecoveryExecution,
  RecoveryExecutor,
  type RecoveryPlan,
} from './recovery-state-machine'

// ── Singleton ────────────────────────────────────────────────────────────
// One cortex instance shared by: healing router, event bus, sandbox audit,
// cron job. Auto-initializes on first access with a db connection.

let _cortex: import('./cortex').SelfHealingCortex | null = null
let _healer: import('./healing-engine').HealingEngine | null = null

/**
 * Get or create the cortex singleton. Lazy-initializes on first call.
 * This is the ONLY way to get the cortex — ensures all consumers share one instance.
 */
export function getOrCreateCortex(db: Database): import('./cortex').SelfHealingCortex {
  if (!_cortex) {
    // Synchronous import to avoid async initialization races

    const { SelfHealingCortex: Cortex } = require('./cortex') as typeof import('./cortex')
    _cortex = new Cortex(db)
    _healer = _cortex.healer
  }
  return _cortex
}

/**
 * Get the cortex if already initialized (for event bus and other non-db contexts).
 */
export function getCortex() {
  return _cortex
}

export function getHealingEngine() {
  return _healer
}
