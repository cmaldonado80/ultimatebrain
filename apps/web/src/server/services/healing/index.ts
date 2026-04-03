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

let _cortex: import('./cortex').SelfHealingCortex | null = null
let _healer: import('./healing-engine').HealingEngine | null = null

export async function initCortex(db: Database) {
  const { SelfHealingCortex: Cortex } = await import('./cortex')
  _cortex = new Cortex(db)
  _healer = _cortex.healer
  return _cortex
}

export function getCortex() {
  return _cortex
}

export function getHealingEngine() {
  return _healer
}
