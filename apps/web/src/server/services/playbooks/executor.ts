/**
 * Playbook Executor
 *
 * Replays a playbook on new inputs:
 * - Resolves {{variables}} against provided parameter values
 * - Executes each step and verifies the outcome
 * - On deviation: pause for HITL approval or retry with LLM adaptation
 * - A/B testing: run original vs. modified playbook, compare outcomes
 */

import type { Database } from '@solarc/db'
import type { PlaybookStep, SavedPlaybook } from './recorder'

export type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'awaiting_hitl'

export interface StepExecutionResult {
  stepIndex: number
  stepName: string
  status: StepStatus
  output?: unknown
  error?: string
  durationMs: number
  deviationDetected?: boolean
  hitlRequired?: boolean
}

export interface PlaybookRunResult {
  runId: string
  playbookId: string
  playbookName: string
  status: 'completed' | 'failed' | 'paused_for_hitl' | 'aborted'
  stepResults: StepExecutionResult[]
  stepsCompleted: number
  totalSteps: number
  successRate: number
  durationMs: number
  parameterValues: Record<string, unknown>
  /** Set when paused for HITL */
  pausedAtStep?: number
}

export interface ABTestResult {
  originalRunId: string
  modifiedRunId: string
  originalResult: PlaybookRunResult
  modifiedResult: PlaybookRunResult
  winner: 'original' | 'modified' | 'tie'
  comparison: {
    successRateDelta: number
    durationDelta: number
    stepsCompletedDelta: number
  }
}

export interface ExecuteOptions {
  /** Values for {{variables}} in the playbook */
  parameterValues?: Record<string, unknown>
  /** If true, pause before risky steps for human approval */
  hitlMode?: boolean
  /** Called when HITL is needed; return true to proceed, false to abort */
  onHitlRequest?: (step: PlaybookStep, context: unknown) => Promise<boolean>
  /** Called on each step completion */
  onStepComplete?: (result: StepExecutionResult) => void
  /** Max retries per failed step */
  maxRetries?: number
}

/** In-memory run store (production: persist to DB) */
const runStore = new Map<string, PlaybookRunResult>()

export class PlaybookExecutor {
  constructor(private db: Database) {}

  /**
   * Execute a playbook with given parameter values.
   */
  async execute(playbook: SavedPlaybook, options: ExecuteOptions = {}): Promise<PlaybookRunResult> {
    const runId = crypto.randomUUID()
    const start = Date.now()
    const { parameterValues = {}, hitlMode = false, maxRetries = 2 } = options

    const stepResults: StepExecutionResult[] = []
    let pausedAtStep: number | undefined

    for (const step of playbook.steps) {
      if (pausedAtStep !== undefined) break

      const resolved = this.resolveParameters(step, parameterValues)
      const result = await this.executeStep(resolved, options, maxRetries)
      stepResults.push(result)
      options.onStepComplete?.(result)

      if (result.hitlRequired) {
        const proceed = options.onHitlRequest
          ? await options.onHitlRequest(resolved, { stepResults, parameterValues })
          : false

        if (!proceed) {
          pausedAtStep = step.index
          break
        }
      }

      if (result.status === 'failed' && !result.hitlRequired) {
        break
      }
    }

    const stepsCompleted = stepResults.filter(
      (r) => r.status === 'passed' || r.status === 'skipped'
    ).length

    const runResult: PlaybookRunResult = {
      runId,
      playbookId: playbook.id,
      playbookName: playbook.name,
      status:
        pausedAtStep !== undefined
          ? 'paused_for_hitl'
          : stepResults.some((r) => r.status === 'failed')
          ? 'failed'
          : 'completed',
      stepResults,
      stepsCompleted,
      totalSteps: playbook.steps.length,
      successRate: playbook.steps.length > 0 ? stepsCompleted / playbook.steps.length : 0,
      durationMs: Date.now() - start,
      parameterValues,
      pausedAtStep,
    }

    runStore.set(runId, runResult)
    return runResult
  }

  /**
   * Resume a paused run (after HITL decision).
   */
  async resume(
    runId: string,
    playbook: SavedPlaybook,
    options: ExecuteOptions = {}
  ): Promise<PlaybookRunResult> {
    const existing = runStore.get(runId)
    if (!existing) throw new Error(`Run ${runId} not found`)
    if (existing.status !== 'paused_for_hitl') {
      throw new Error(`Run ${runId} is not paused (status: ${existing.status})`)
    }

    const remainingSteps = playbook.steps.slice(existing.pausedAtStep ?? 0)
    const resumedPlaybook = { ...playbook, steps: remainingSteps }

    const continuation = await this.execute(resumedPlaybook, {
      ...options,
      parameterValues: existing.parameterValues,
    })

    // Merge results
    const merged: PlaybookRunResult = {
      ...continuation,
      runId,
      stepResults: [...existing.stepResults, ...continuation.stepResults],
      stepsCompleted: existing.stepsCompleted + continuation.stepsCompleted,
      durationMs: existing.durationMs + continuation.durationMs,
    }

    merged.successRate = merged.stepsCompleted / playbook.steps.length
    runStore.set(runId, merged)
    return merged
  }

  /**
   * A/B test: run original playbook vs. a modified version.
   */
  async abTest(
    original: SavedPlaybook,
    modified: SavedPlaybook,
    parameterValues: Record<string, unknown> = {}
  ): Promise<ABTestResult> {
    const [originalResult, modifiedResult] = await Promise.all([
      this.execute(original, { parameterValues }),
      this.execute(modified, { parameterValues }),
    ])

    const successDelta = modifiedResult.successRate - originalResult.successRate
    const durationDelta = modifiedResult.durationMs - originalResult.durationMs

    let winner: ABTestResult['winner'] = 'tie'
    if (successDelta > 0.05) winner = 'modified'
    else if (successDelta < -0.05) winner = 'original'
    else if (durationDelta < -500) winner = 'modified' // faster by 500ms+
    else if (durationDelta > 500) winner = 'original'

    return {
      originalRunId: originalResult.runId,
      modifiedRunId: modifiedResult.runId,
      originalResult,
      modifiedResult,
      winner,
      comparison: {
        successRateDelta: successDelta,
        durationDelta,
        stepsCompletedDelta: modifiedResult.stepsCompleted - originalResult.stepsCompleted,
      },
    }
  }

  /**
   * Get a run result by ID.
   */
  getRun(runId: string): PlaybookRunResult | null {
    return runStore.get(runId) ?? null
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private resolveParameters(step: PlaybookStep, values: Record<string, unknown>): PlaybookStep {
    const resolvedParams: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(step.parameters)) {
      if (typeof value === 'string') {
        resolvedParams[key] = value.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
          return values[varName] !== undefined ? String(values[varName]) : `{{${varName}}}`
        })
      } else {
        resolvedParams[key] = value
      }
    }

    return { ...step, parameters: resolvedParams }
  }

  private async executeStep(
    step: PlaybookStep,
    options: ExecuteOptions,
    maxRetries: number
  ): Promise<StepExecutionResult> {
    const start = Date.now()

    // Check if HITL required before risky steps
    if (options.hitlMode && step.requiresApproval) {
      return {
        stepIndex: step.index,
        stepName: step.name,
        status: 'awaiting_hitl',
        durationMs: Date.now() - start,
        hitlRequired: true,
      }
    }

    let lastError: string | undefined
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const output = await this.runStepAction(step)
        const deviationDetected = await this.verifyOutcome(step, output)

        if (deviationDetected && options.hitlMode) {
          return {
            stepIndex: step.index,
            stepName: step.name,
            status: 'awaiting_hitl',
            output,
            durationMs: Date.now() - start,
            deviationDetected: true,
            hitlRequired: true,
          }
        }

        return {
          stepIndex: step.index,
          stepName: step.name,
          status: 'passed',
          output,
          durationMs: Date.now() - start,
          deviationDetected,
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
        }
      }
    }

    return {
      stepIndex: step.index,
      stepName: step.name,
      status: 'failed',
      error: lastError,
      durationMs: Date.now() - start,
    }
  }

  private async runStepAction(step: PlaybookStep): Promise<unknown> {
    // Stub — real impl dispatches to the appropriate handler based on step.type:
    // 'click' → UI automation, 'api_call' → tRPC/fetch, 'transformation' → data fn
    return { executed: true, step: step.name, params: step.parameters }
  }

  private async verifyOutcome(step: PlaybookStep, output: unknown): Promise<boolean> {
    if (!step.expectedOutcome) return false
    // Stub — real impl does LLM-as-judge comparison of actual vs expected outcome
    return false
  }
}
