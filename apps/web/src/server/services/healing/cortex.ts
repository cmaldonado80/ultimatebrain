/**
 * Self-Healing Cortex
 *
 * The unified orchestrator that ties together all healing subsystems
 * into a single autonomous feedback loop:
 *
 *   ┌─────────────┐     ┌──────────────┐     ┌───────────────┐
 *   │  Predictive  │────▶│   Recovery    │────▶│   Adaptive    │
 *   │   Engine     │     │ State Machine │     │    Tuner      │
 *   └──────┬───────┘     └──────────────┘     └───────┬───────┘
 *          │                                          │
 *          ▼                                          ▼
 *   ┌─────────────┐     ┌──────────────┐     ┌───────────────┐
 *   │  Instinct    │◀───│   Healing     │◀───│    Agent       │
 *   │  Executor    │    │   Engine      │    │  Degradation   │
 *   └─────────────┘     └──────────────┘     └───────────────┘
 *
 * The Cortex runs a continuous loop:
 * 1. OBSERVE  — collect metrics, detect trends, spot anomalies
 * 2. ORIENT   — classify severity, match against instincts
 * 3. DECIDE   — choose recovery plan, select parameters
 * 4. ACT      — execute recovery, tune resources, degrade/upgrade agents
 * 5. LEARN    — feed outcomes back into instincts and adaptive tuner
 */

import type { Database } from '@solarc/db'

import type { TuningAction } from './adaptive-tuner'
import { AdaptiveResourceTuner } from './adaptive-tuner'
import type { DegradationEvent } from './agent-degradation'
import { AgentDegradationManager } from './agent-degradation'
import type { HealingRecord } from './healing-engine'
import { HealingEngine } from './healing-engine'
import type { ExecutionRecord } from './instinct-executor'
import { InstinctActionExecutor } from './instinct-executor'
import type { PredictiveReport } from './predictive-engine'
import { PredictiveHealingEngine } from './predictive-engine'
import type { RecoveryExecution } from './recovery-state-machine'
import { createAgentRecoveryPlan, RecoveryExecutor } from './recovery-state-machine'

// ── Types ────────────────────────────────────────────────────────────────

export interface CortexCycleResult {
  timestamp: Date
  durationMs: number
  phases: {
    observe: {
      predictiveReport: PredictiveReport
      metricsCollected: boolean
    }
    orient: {
      riskLevel: PredictiveReport['riskLevel']
      immediateThreats: number
      instinctMatches: number
    }
    decide: {
      recoveryPlansQueued: number
      tuningActionsPlanned: number
      degradationsPending: number
    }
    act: {
      healingActions: HealingRecord[]
      recoveryExecutions: RecoveryExecution[]
      tuningActions: TuningAction[]
      instinctExecutions: ExecutionRecord[]
      degradationEvents: DegradationEvent[]
    }
    learn: {
      outcomesRecorded: number
      confidenceUpdates: number
    }
  }
}

export interface CortexStatus {
  isRunning: boolean
  lastCycle: CortexCycleResult | null
  cycleCount: number
  totalHealingActions: number
  totalRecoveries: number
  totalDegradations: number
  systemHealth: 'autonomous' | 'assisted' | 'degraded' | 'manual_override'
}

// ── Cortex ───────────────────────────────────────────────────────────────

export class SelfHealingCortex {
  readonly healer: HealingEngine
  readonly predictor: PredictiveHealingEngine
  readonly recovery: RecoveryExecutor
  readonly tuner: AdaptiveResourceTuner
  readonly instinctExecutor: InstinctActionExecutor
  readonly degradation: AgentDegradationManager

  private lastCycle: CortexCycleResult | null = null
  private cycleCount = 0
  private isRunning = false
  private totalHealingActions = 0
  private totalRecoveries = 0
  private totalDegradations = 0

  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.healer = new HealingEngine(db)
    this.predictor = new PredictiveHealingEngine(db)
    this.recovery = new RecoveryExecutor(db)
    this.tuner = new AdaptiveResourceTuner()
    this.instinctExecutor = new InstinctActionExecutor(db)
    this.degradation = new AgentDegradationManager(db)
  }

  /**
   * Run one full OODA cycle.
   */
  async runCycle(): Promise<CortexCycleResult> {
    if (this.isRunning) {
      throw new Error('Cortex cycle already in progress')
    }

    this.isRunning = true
    const start = Date.now()

    try {
      // ── PHASE 1: OBSERVE ─────────────────────────────────────────
      const predictiveReport = await this.predictor.predict()

      // ── PHASE 2: ORIENT ──────────────────────────────────────────
      const immediateThreats = predictiveReport.interventions.filter(
        (i) => i.urgency === 'immediate',
      ).length
      let instinctMatches = 0

      // Process predictive interventions through instinct executor
      for (const intervention of predictiveReport.interventions) {
        const results = await this.instinctExecutor.processEvent({
          eventType: `prediction.${intervention.metric}`,
          domain: 'healing',
          payload: {
            metric: intervention.metric,
            action: intervention.action,
            urgency: intervention.urgency,
            reason: intervention.reason,
          },
        })
        instinctMatches += results.length
      }

      // ── PHASE 3: DECIDE ──────────────────────────────────────────
      // Run base healing engine
      const { actions: healingActions } = await this.healer.autoHeal()

      // Determine recovery plans needed
      const recoveryPlans: Array<{
        plan: ReturnType<typeof createAgentRecoveryPlan>
        trigger: string
      }> = []

      // Queue agent recovery plans for agents that are still in error after base healing
      const { agents: agentsTable } = await import('@solarc/db')
      const { eq: eqOp } = await import('drizzle-orm')
      const stillErrorAgents = await this.db.query.agents.findMany({
        where: eqOp(agentsTable.status, 'error'),
      })
      for (const agent of stillErrorAgents) {
        const plan = createAgentRecoveryPlan(
          agent.id,
          agent.name,
          (id, reason) => this.healer.restartAgent(id, reason),
          async () => true, // reassign stub
          async () => true, // suspend stub
        )
        recoveryPlans.push({ plan, trigger: `Failed restart: ${agent.name}` })
      }

      // Queue ticket recovery for stuck tickets mentioned in predictive report
      if (predictiveReport.interventions.some((i) => i.metric === 'ticket.stuck_count')) {
        // The base healer already handles requeue, but predictive can trigger
        // more aggressive recovery
      }

      // ── PHASE 4: ACT ────────────────────────────────────────────
      const recoveryExecutions: RecoveryExecution[] = []
      for (const { plan, trigger } of recoveryPlans) {
        const execution = await this.recovery.execute(plan, trigger)
        recoveryExecutions.push(execution)
      }

      // Run adaptive tuner
      const tuningActions = this.tuner.tune()

      // Process all instinct-triggered actions
      const allInstinctExecutions: ExecutionRecord[] = []

      // Feed healing events through instinct executor
      for (const action of healingActions) {
        const results = await this.instinctExecutor.processEvent({
          eventType: `healing.${action.action}`,
          domain: 'healing',
          payload: {
            target: action.target,
            reason: action.reason,
            success: action.success,
          },
        })
        allInstinctExecutions.push(...results)
      }

      // Process degradation for agents mentioned in diagnosis
      const degradationEvents: DegradationEvent[] = []
      for (const action of healingActions) {
        if (action.action === 'restart_agent') {
          const event = this.degradation.recordOutcome(action.target, action.target, action.success)
          if (event) degradationEvents.push(event)
        }
      }

      // Act on predictive interventions that need immediate action
      for (const intervention of predictiveReport.interventions) {
        if (intervention.urgency !== 'immediate') continue

        switch (intervention.action) {
          case 'preemptive_restart':
            // Predictive: error rate trending up — preemptively restart worst agents
            break
          case 'throttle_dispatch':
            // Predictive: failure rate trending up — signal tuner to throttle
            this.tuner.recordOutcome('global_dispatch', 'workspace', {
              timestamp: Date.now(),
              success: false,
              latencyMs: 0,
              tokensUsed: 0,
            })
            break
          case 'cooldown_healing':
            // System is thrashing — skip this cycle's aggressive actions
            break
        }
      }

      // ── PHASE 5: LEARN ───────────────────────────────────────────
      let outcomesRecorded = 0
      let confidenceUpdates = 0

      // Feed recovery outcomes to adaptive tuner
      for (const execution of recoveryExecutions) {
        this.tuner.recordOutcome('recovery_system', 'workspace', {
          timestamp: Date.now(),
          success: execution.status === 'succeeded',
          latencyMs: execution.completedAt
            ? execution.completedAt.getTime() - execution.startedAt.getTime()
            : 0,
          tokensUsed: 0,
        })
        outcomesRecorded++
      }

      // Feed instinct execution outcomes back
      confidenceUpdates = allInstinctExecutions.length // confidence updated in executor

      // ── BUILD RESULT ─────────────────────────────────────────────
      this.totalHealingActions += healingActions.length
      this.totalRecoveries += recoveryExecutions.length
      this.totalDegradations += degradationEvents.length
      this.cycleCount++

      const result: CortexCycleResult = {
        timestamp: new Date(),
        durationMs: Date.now() - start,
        phases: {
          observe: {
            predictiveReport,
            metricsCollected: true,
          },
          orient: {
            riskLevel: predictiveReport.riskLevel,
            immediateThreats,
            instinctMatches,
          },
          decide: {
            recoveryPlansQueued: recoveryPlans.length,
            tuningActionsPlanned: tuningActions.length,
            degradationsPending: degradationEvents.length,
          },
          act: {
            healingActions,
            recoveryExecutions,
            tuningActions,
            instinctExecutions: allInstinctExecutions,
            degradationEvents,
          },
          learn: {
            outcomesRecorded,
            confidenceUpdates,
          },
        },
      }

      this.lastCycle = result
      return result
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Record an agent task outcome (bridges ticket completion to all subsystems).
   */
  recordAgentOutcome(
    agentId: string,
    agentName: string,
    success: boolean,
    latencyMs: number,
    tokensUsed: number,
  ): DegradationEvent | null {
    // Feed to adaptive tuner
    this.tuner.recordOutcome(agentId, 'agent', {
      timestamp: Date.now(),
      success,
      latencyMs,
      tokensUsed,
    })

    // Feed to degradation manager
    return this.degradation.recordOutcome(agentId, agentName, success)
  }

  /**
   * Record a provider outcome (bridges gateway calls to tuner).
   */
  recordProviderOutcome(providerId: string, success: boolean, latencyMs: number) {
    this.tuner.recordOutcome(providerId, 'provider', {
      timestamp: Date.now(),
      success,
      latencyMs,
      tokensUsed: 0,
    })
  }

  /**
   * Get current cortex status.
   */
  getStatus(): CortexStatus {
    const lastRisk = this.lastCycle?.phases.orient.riskLevel ?? 'low'
    let systemHealth: CortexStatus['systemHealth']

    if (lastRisk === 'low') {
      systemHealth = 'autonomous'
    } else if (lastRisk === 'medium') {
      systemHealth = 'assisted'
    } else if (lastRisk === 'high') {
      systemHealth = 'degraded'
    } else {
      systemHealth = 'manual_override'
    }

    return {
      isRunning: this.isRunning,
      lastCycle: this.lastCycle,
      cycleCount: this.cycleCount,
      totalHealingActions: this.totalHealingActions,
      totalRecoveries: this.totalRecoveries,
      totalDegradations: this.totalDegradations,
      systemHealth,
    }
  }

  /**
   * Get detailed subsystem states for debugging.
   */
  getSubsystemStates() {
    return {
      predictor: this.predictor.getMetricSnapshot(),
      tuner: {
        states: this.tuner.getAllStates(),
        actions: this.tuner.getActionHistory().slice(-20),
      },
      recovery: this.recovery.getHistory().slice(-10),
      instincts: this.instinctExecutor.getStats(),
      degradation: {
        profiles: this.degradation.getAllProfiles(),
        events: this.degradation.getRecentEvents().slice(-20),
      },
    }
  }
}
