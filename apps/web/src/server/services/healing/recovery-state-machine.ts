/**
 * Recovery State Machine
 *
 * Multi-path recovery with escalation, rollback, and conditional branching.
 * Each recovery "workflow" is a directed graph of recovery steps with
 * success/failure transitions, max retries, and automatic escalation.
 *
 * Architecture:
 * - RecoveryPlan: A graph of RecoverySteps connected by transitions
 * - RecoveryStep: An atomic action with success/failure/timeout paths
 * - RecoveryExecutor: Walks the graph, executing steps and following transitions
 * - Escalation: When a path exhausts retries, escalate to next severity level
 * - Rollback: On critical failure, unwind completed steps in reverse
 */

import type { Database } from '@solarc/db'
import { healingLogs } from '@solarc/db'

// ── Types ────────────────────────────────────────────────────────────────

export type RecoveryStepStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'rolled_back'

export interface RecoveryStep {
  id: string
  name: string
  action: () => Promise<boolean>
  rollback?: () => Promise<void>
  maxRetries: number
  timeoutMs: number
  onSuccess?: string // next step ID
  onFailure?: string // fallback step ID (or 'escalate' | 'rollback')
}

export interface RecoveryStepResult {
  stepId: string
  name: string
  status: RecoveryStepStatus
  attempts: number
  durationMs: number
  error?: string
}

export interface RecoveryExecution {
  planId: string
  planName: string
  trigger: string
  startedAt: Date
  completedAt?: Date
  status: 'running' | 'succeeded' | 'failed' | 'escalated' | 'rolled_back'
  steps: RecoveryStepResult[]
  escalatedTo?: string
}

export interface RecoveryPlan {
  id: string
  name: string
  description: string
  entryStep: string
  steps: RecoveryStep[]
}

// ── Recovery Executor ────────────────────────────────────────────────────

export class RecoveryExecutor {
  private executions: RecoveryExecution[] = []
  private maxHistory = 100

  constructor(private db: Database) {}

  /**
   * Execute a recovery plan from its entry step.
   */
  async execute(plan: RecoveryPlan, trigger: string): Promise<RecoveryExecution> {
    const execution: RecoveryExecution = {
      planId: plan.id,
      planName: plan.name,
      trigger,
      startedAt: new Date(),
      status: 'running',
      steps: [],
    }

    const stepMap = new Map(plan.steps.map((s) => [s.id, s]))
    const completedSteps: Array<{ step: RecoveryStep; result: RecoveryStepResult }> = []
    let currentStepId: string | undefined = plan.entryStep

    while (currentStepId) {
      const step = stepMap.get(currentStepId)
      if (!step) break

      const result = await this.executeStep(step)
      execution.steps.push(result)

      if (result.status === 'succeeded') {
        completedSteps.push({ step, result })
        currentStepId = step.onSuccess
      } else {
        // Step failed — check failure path
        if (step.onFailure === 'rollback') {
          await this.rollback(completedSteps, execution)
          execution.status = 'rolled_back'
          currentStepId = undefined
        } else if (step.onFailure === 'escalate') {
          execution.status = 'escalated'
          execution.escalatedTo = `manual_intervention:${step.name}`
          currentStepId = undefined
        } else if (step.onFailure) {
          // Follow fallback path
          currentStepId = step.onFailure
        } else {
          // No fallback — escalate by default
          execution.status = 'escalated'
          execution.escalatedTo = `unhandled_failure:${step.name}`
          currentStepId = undefined
        }
      }
    }

    if (execution.status === 'running') {
      execution.status = 'succeeded'
    }

    execution.completedAt = new Date()
    this.recordExecution(execution)
    return execution
  }

  private async executeStep(step: RecoveryStep): Promise<RecoveryStepResult> {
    const start = Date.now()
    let attempts = 0
    let lastError: string | undefined

    while (attempts <= step.maxRetries) {
      attempts++
      try {
        const success = await Promise.race([
          step.action(),
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), step.timeoutMs),
          ),
        ])

        if (success) {
          return {
            stepId: step.id,
            name: step.name,
            status: 'succeeded',
            attempts,
            durationMs: Date.now() - start,
          }
        }
        lastError = 'Action returned false'
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
      }

      // Brief delay before retry (exponential backoff)
      if (attempts <= step.maxRetries) {
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** (attempts - 1), 10000)))
      }
    }

    return {
      stepId: step.id,
      name: step.name,
      status: 'failed',
      attempts,
      durationMs: Date.now() - start,
      error: lastError,
    }
  }

  private async rollback(
    completedSteps: Array<{ step: RecoveryStep; result: RecoveryStepResult }>,
    execution: RecoveryExecution,
  ) {
    // Reverse order rollback
    for (let i = completedSteps.length - 1; i >= 0; i--) {
      const { step, result } = completedSteps[i]!
      if (step.rollback) {
        try {
          await step.rollback()
          result.status = 'rolled_back'
        } catch (err) {
          // Rollback failed — log but continue
          execution.steps.push({
            stepId: `rollback_${step.id}`,
            name: `Rollback: ${step.name}`,
            status: 'failed',
            attempts: 1,
            durationMs: 0,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }
  }

  private recordExecution(execution: RecoveryExecution) {
    this.executions.push(execution)
    while (this.executions.length > this.maxHistory) this.executions.shift()

    // Persist summary to healing log
    this.db
      .insert(healingLogs)
      .values({
        action: `recovery:${execution.planId}`,
        target: execution.trigger,
        reason: `${execution.steps.length} steps, status: ${execution.status}`,
        success: execution.status === 'succeeded',
      })
      .catch(() => {})
  }

  getHistory(): RecoveryExecution[] {
    return [...this.executions]
  }

  getLastExecution(planId: string): RecoveryExecution | undefined {
    for (let i = this.executions.length - 1; i >= 0; i--) {
      if (this.executions[i]!.planId === planId) return this.executions[i]
    }
    return undefined
  }
}

// ── Built-in Recovery Plans ──────────────────────────────────────────────

export function createAgentRecoveryPlan(
  agentId: string,
  agentName: string,
  restartFn: (id: string, reason: string) => Promise<boolean>,
  reassignFn: (id: string) => Promise<boolean>,
  suspendFn: (id: string) => Promise<boolean>,
): RecoveryPlan {
  return {
    id: 'agent_recovery',
    name: `Recover Agent: ${agentName}`,
    description: 'Multi-path agent recovery: restart → reassign tickets → suspend',
    entryStep: 'soft_restart',
    steps: [
      {
        id: 'soft_restart',
        name: 'Soft restart (clear state)',
        action: () => restartFn(agentId, 'Recovery plan: soft restart'),
        maxRetries: 1,
        timeoutMs: 10000,
        onSuccess: undefined, // done
        onFailure: 'reassign_work',
      },
      {
        id: 'reassign_work',
        name: 'Reassign active tickets',
        action: () => reassignFn(agentId),
        maxRetries: 1,
        timeoutMs: 15000,
        onSuccess: 'hard_restart',
        onFailure: 'hard_restart',
      },
      {
        id: 'hard_restart',
        name: 'Hard restart (force idle + clear locks)',
        action: () => restartFn(agentId, 'Recovery plan: hard restart after reassign'),
        maxRetries: 2,
        timeoutMs: 10000,
        onSuccess: undefined,
        onFailure: 'suspend_agent',
      },
      {
        id: 'suspend_agent',
        name: 'Suspend agent (take offline)',
        action: () => suspendFn(agentId),
        maxRetries: 0,
        timeoutMs: 5000,
        onSuccess: undefined,
        onFailure: 'escalate',
      },
    ],
  }
}

export function createTicketRecoveryPlan(
  ticketId: string,
  requeueFn: (id: string, reason: string) => Promise<boolean>,
  cancelFn: (id: string) => Promise<boolean>,
): RecoveryPlan {
  return {
    id: 'ticket_recovery',
    name: `Recover Ticket: ${ticketId.slice(0, 8)}`,
    description: 'Multi-path ticket recovery: requeue → requeue with delay → cancel',
    entryStep: 'requeue',
    steps: [
      {
        id: 'requeue',
        name: 'Requeue for retry',
        action: () => requeueFn(ticketId, 'Recovery plan: requeue'),
        maxRetries: 1,
        timeoutMs: 5000,
        onSuccess: undefined,
        onFailure: 'requeue_delayed',
      },
      {
        id: 'requeue_delayed',
        name: 'Requeue with backoff delay',
        action: async () => {
          await new Promise((r) => setTimeout(r, 5000))
          return requeueFn(ticketId, 'Recovery plan: delayed requeue')
        },
        maxRetries: 1,
        timeoutMs: 15000,
        onSuccess: undefined,
        onFailure: 'cancel_ticket',
      },
      {
        id: 'cancel_ticket',
        name: 'Cancel ticket (prevent infinite retry)',
        action: () => cancelFn(ticketId),
        maxRetries: 0,
        timeoutMs: 5000,
        onSuccess: undefined,
        onFailure: 'escalate',
      },
    ],
  }
}

export function createEntityRecoveryPlan(
  _entityId: string,
  entityName: string,
  healthCheckFn: () => Promise<boolean>,
  restartFn: () => Promise<boolean>,
  suspendFn: () => Promise<boolean>,
): RecoveryPlan {
  return {
    id: 'entity_recovery',
    name: `Recover Entity: ${entityName}`,
    description: 'Multi-path entity recovery: health check → restart → suspend',
    entryStep: 'verify_health',
    steps: [
      {
        id: 'verify_health',
        name: 'Verify entity health endpoint',
        action: healthCheckFn,
        maxRetries: 2,
        timeoutMs: 10000,
        onSuccess: undefined, // already healthy, done
        onFailure: 'restart_entity',
      },
      {
        id: 'restart_entity',
        name: 'Restart entity service',
        action: restartFn,
        maxRetries: 2,
        timeoutMs: 30000,
        onSuccess: 'verify_after_restart',
        onFailure: 'suspend_entity',
      },
      {
        id: 'verify_after_restart',
        name: 'Verify health after restart',
        action: healthCheckFn,
        maxRetries: 3,
        timeoutMs: 10000,
        onSuccess: undefined,
        onFailure: 'suspend_entity',
      },
      {
        id: 'suspend_entity',
        name: 'Suspend entity (mark degraded)',
        action: suspendFn,
        maxRetries: 0,
        timeoutMs: 5000,
        onSuccess: undefined,
        onFailure: 'escalate',
      },
    ],
  }
}
