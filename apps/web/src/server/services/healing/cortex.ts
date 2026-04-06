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
 * 5. LEARN    — feed outcomes back into instincts, tuner, and memory
 */
import type { Database } from '@solarc/db'
import { agents as agentsTable } from '@solarc/db'
import { eq as eqOp } from 'drizzle-orm'

import { logger } from '../../../lib/logger'
import { EvidenceMemoryPipeline } from '../intelligence/evidence-memory'
import { MemoryService } from '../memory/memory-service'
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
import {
  createAgentRecoveryPlan,
  createTicketRecoveryPlan,
  RecoveryExecutor,
} from './recovery-state-machine'

// ── Constants ───────────────────────────────────────────────────────────

const CYCLE_TIMEOUT_MS = 60_000 // 1 minute max per cycle
const STALE_CYCLE_MS = 10 * 60 * 1000 // 10 minutes = stale

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
  lastCycleAgeMs: number | null
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
  readonly evidence: EvidenceMemoryPipeline

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
    this.evidence = new EvidenceMemoryPipeline()
  }

  /**
   * Run one full OODA cycle with timeout protection.
   */
  async runCycle(): Promise<CortexCycleResult> {
    if (this.isRunning) {
      throw new Error('Cortex cycle already in progress')
    }

    this.isRunning = true

    try {
      const result = await Promise.race([
        this._executeCycle(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Cortex cycle timed out')), CYCLE_TIMEOUT_MS),
        ),
      ])
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
   * Get current cortex status with stale cycle detection.
   */
  getStatus(): CortexStatus {
    const lastRisk = this.lastCycle?.phases.orient.riskLevel ?? 'low'
    const lastCycleAgeMs = this.lastCycle ? Date.now() - this.lastCycle.timestamp.getTime() : null
    const isStale = lastCycleAgeMs === null || lastCycleAgeMs > STALE_CYCLE_MS

    let systemHealth: CortexStatus['systemHealth']

    if (isStale && this.cycleCount > 0) {
      // Had cycles before but data is stale — can't trust it
      systemHealth = 'degraded'
    } else if (lastRisk === 'low') {
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
      lastCycleAgeMs,
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
      evidence: {
        queue: this.evidence.getQueue().length,
        recentLog: this.evidence.getLog(10),
      },
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /**
   * Execute a phase with error isolation. If a phase throws, log and return fallback.
   */
  private async safePhase<T>(name: string, fn: () => Promise<T> | T, fallback: T): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error : undefined },
        `[Cortex] ${name} phase failed`,
      )
      return fallback
    }
  }

  /**
   * The actual OODA cycle logic, separated for timeout wrapping.
   */
  private async _executeCycle(): Promise<CortexCycleResult> {
    const start = Date.now()

    const DEFAULT_REPORT: PredictiveReport = {
      timestamp: new Date(),
      trends: [],
      riskLevel: 'low',
      interventions: [],
    }

    // ── PHASE 1: OBSERVE ─────────────────────────────────────────
    const predictiveReport = await this.safePhase(
      'observe',
      () => this.predictor.predict(),
      DEFAULT_REPORT,
    )

    // ── PHASE 2: ORIENT ──────────────────────────────────────────
    const { immediateThreats, instinctMatches } = await this.safePhase(
      'orient',
      async () => {
        const threats = predictiveReport.interventions.filter(
          (i) => i.urgency === 'immediate',
        ).length
        let matches = 0

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
          matches += results.length
        }

        return { immediateThreats: threats, instinctMatches: matches }
      },
      { immediateThreats: 0, instinctMatches: 0 },
    )

    // ── PHASE 3: DECIDE ──────────────────────────────────────────
    const { healingActions, recoveryPlans, stillErrorAgents } = await this.safePhase(
      'decide',
      async () => {
        const { actions } = await this.healer.autoHeal()

        const plans: Array<{
          plan: ReturnType<typeof createAgentRecoveryPlan>
          trigger: string
        }> = []

        // Queue agent recovery plans for agents still in error after base healing
        const errorAgents = await this.db.query.agents.findMany({
          where: eqOp(agentsTable.status, 'error'),
        })
        for (const agent of errorAgents) {
          const plan = createAgentRecoveryPlan(
            agent.id,
            agent.name,
            (id, reason) => this.healer.restartAgent(id, reason),
            async () => {
              const cleared = await this.healer.clearExpiredLeases()
              return cleared >= 0
            },
            async () => {
              this.degradation.forceLevel(
                agent.id,
                agent.name,
                'suspended',
                'Recovery plan: suspend',
              )
              return true
            },
          )
          plans.push({ plan, trigger: `Failed restart: ${agent.name}` })
        }

        // Aggressive ticket recovery when predictive engine flags stuck tickets
        for (const intervention of predictiveReport.interventions) {
          if (
            intervention.metric === 'ticket.stuck_count' &&
            intervention.urgency === 'immediate'
          ) {
            await this.healer.clearExpiredLeases()
            const ticketPlan = createTicketRecoveryPlan(
              `stuck-tickets-${Date.now()}`,
              (id, reason) => this.healer.requeueTicket(id, reason),
              async () => true, // cancel fallback — just acknowledge
            )
            plans.push({ plan: ticketPlan, trigger: intervention.reason })
          }
        }

        return { healingActions: actions, recoveryPlans: plans, stillErrorAgents: errorAgents }
      },
      {
        healingActions: [] as HealingRecord[],
        recoveryPlans: [] as Array<{
          plan: ReturnType<typeof createAgentRecoveryPlan>
          trigger: string
        }>,
        stillErrorAgents: [] as Array<{ id: string; name: string }>,
      },
    )

    // ── PHASE 4: ACT ────────────────────────────────────────────
    const { recoveryExecutions, tuningActions, allInstinctExecutions, degradationEvents } =
      await this.safePhase(
        'act',
        async () => {
          const executions: RecoveryExecution[] = []
          for (const { plan, trigger } of recoveryPlans) {
            const execution = await this.recovery.execute(plan, trigger)
            executions.push(execution)
          }

          const tuning = this.tuner.tune()

          const instinctExecs: ExecutionRecord[] = []
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
            instinctExecs.push(...results)
          }

          const degradations: DegradationEvent[] = []
          for (const agent of stillErrorAgents) {
            const event = this.degradation.recordOutcome(agent.id, agent.name, false)
            if (event) degradations.push(event)
          }

          // Act on predictive interventions that need immediate action
          let cooldownActive = false

          for (const intervention of predictiveReport.interventions) {
            if (intervention.urgency !== 'immediate') continue

            switch (intervention.action) {
              case 'cooldown_healing':
                cooldownActive = true
                break
              case 'preemptive_restart':
                if (cooldownActive) break
                for (const profile of this.degradation.getAllProfiles()) {
                  if (profile.pressure > 0.7 && profile.level === 'full') {
                    this.degradation.forceLevel(
                      profile.agentId,
                      profile.agentName,
                      'reduced',
                      'Preemptive: predicted error rate spike',
                    )
                  }
                }
                break
              case 'throttle_dispatch':
                if (cooldownActive) break
                this.tuner.recordOutcome('global_dispatch', 'workspace', {
                  timestamp: Date.now(),
                  success: false,
                  latencyMs: 0,
                  tokensUsed: 0,
                })
                break
              case 'force_requeue':
                if (cooldownActive) break
                await this.healer.clearExpiredLeases()
                break
            }
          }

          // Code repair sweep — detect and create tickets for recurring code-level errors
          try {
            const { CodeRepairOrchestrator } = await import('./code-repair-orchestrator')
            const repairer = new CodeRepairOrchestrator(this.db)
            const candidates = await repairer.detectRepairCandidates()
            if (candidates.length > 0) {
              await repairer.runSweep()
            }
          } catch (err) {
            logger.warn(
              { err: err instanceof Error ? err : undefined },
              'cortex: code repair sweep failed',
            )
          }

          return {
            recoveryExecutions: executions,
            tuningActions: tuning,
            allInstinctExecutions: instinctExecs,
            degradationEvents: degradations,
          }
        },
        {
          recoveryExecutions: [] as RecoveryExecution[],
          tuningActions: [] as TuningAction[],
          allInstinctExecutions: [] as ExecutionRecord[],
          degradationEvents: [] as DegradationEvent[],
        },
      )

    // ── PHASE 5: LEARN ───────────────────────────────────────────
    const { outcomesRecorded, confidenceUpdates } = await this.safePhase(
      'learn',
      async () => {
        let outcomes = 0
        const confidence = allInstinctExecutions.length

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
          outcomes++
        }

        // Write healing outcomes to evidence memory pipeline
        for (const action of healingActions) {
          this.evidence.recordHealingOutcome({
            action: action.action,
            target: action.target,
            success: action.success,
            reason: action.reason,
          })
        }
        for (const execution of recoveryExecutions) {
          this.evidence.recordHealingOutcome({
            action: 'recovery_plan',
            target: execution.planName,
            success: execution.status === 'succeeded',
            reason: `Recovery ${execution.status}: ${execution.steps.length} steps`,
          })
        }

        // Fire-and-forget flush to memory store
        const memSvc = new MemoryService(this.db)
        const memAdapter = {
          store: (input: {
            key: string
            content: string
            tier: string
            sourceAgentId?: string
            workspaceId?: string
            confidence?: number
          }) =>
            memSvc.store({
              ...input,
              tier: input.tier as 'critical' | 'core' | 'recall' | 'archival',
            }) as Promise<unknown>,
        }
        this.evidence
          .flush(memAdapter)
          .catch((err) => logger.warn({ err }, 'cortex: evidence flush failed'))

        return { outcomesRecorded: outcomes, confidenceUpdates: confidence }
      },
      { outcomesRecorded: 0, confidenceUpdates: 0 },
    )

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
  }
}
