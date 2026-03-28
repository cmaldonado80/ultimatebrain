/**
 * Flow Engine — Deterministic Orchestration
 *
 * TypeScript builder pattern for defining multi-step execution flows.
 * Flows are deterministic — they control WHEN and in what ORDER things run.
 * They never call LLMs directly; they delegate to Crews for autonomous reasoning.
 *
 * Builder API:
 *   flow('project-execution')
 *     .start(receiveProjectBrief)
 *     .then(routeToWorkspaces)       // sequential
 *     .parallel(executeInDivisions)  // fan-out
 *     .join(synthesizeResults)       // fan-in
 *     .conditional(qualityCheck, { pass: deliver, fail: revise })
 *     .end()
 *
 * Flows are checkpointed at every step via CheckpointManager.
 */

import type { Database } from '@solarc/db'

import { CheckpointManager } from '../checkpointing/checkpoint-manager'

// ── Types ─────────────────────────────────────────────────────────────────

export type FlowStepType = 'start' | 'then' | 'parallel' | 'join' | 'conditional' | 'loop' | 'end'

export type FlowStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed'

export interface FlowContext {
  flowId: string
  flowName: string
  stepIndex: number
  data: Record<string, unknown>
  metadata: Record<string, unknown>
}

export type StepFn = (ctx: FlowContext) => Promise<FlowContext>
export type ConditionFn = (ctx: FlowContext) => Promise<boolean>

export interface ConditionalBranches {
  pass: StepFn
  fail: StepFn
}

export interface LoopOptions {
  /** Called each iteration; return false to exit loop */
  condition: ConditionFn
  maxIterations?: number
}

interface FlowStep {
  type: FlowStepType
  name: string
  fn?: StepFn
  branches?: ConditionalBranches
  condition?: ConditionFn
  parallelFns?: StepFn[]
  loopOptions?: LoopOptions
}

export interface FlowRunResult {
  flowId: string
  flowName: string
  status: FlowStatus
  stepsExecuted: number
  finalContext: FlowContext
  durationMs: number
  error?: string
}

// ── Flow Builder ──────────────────────────────────────────────────────────

export class FlowBuilder {
  private steps: FlowStep[] = []

  constructor(private name: string) {}

  /** Entry point — first step to execute */
  start(fn: StepFn): this {
    this.steps.push({ type: 'start', name: `${this.name}:start`, fn })
    return this
  }

  /** Sequential step — runs after the previous step completes */
  then(fn: StepFn, label?: string): this {
    this.steps.push({
      type: 'then',
      name: label ?? `${this.name}:then:${this.steps.length}`,
      fn,
    })
    return this
  }

  /** Fan-out — runs multiple steps in parallel, merges results into context */
  parallel(fns: StepFn[], label?: string): this {
    this.steps.push({
      type: 'parallel',
      name: label ?? `${this.name}:parallel:${this.steps.length}`,
      parallelFns: fns,
    })
    return this
  }

  /** Fan-in — aggregates parallel results (runs after parallel) */
  join(fn: StepFn, label?: string): this {
    this.steps.push({
      type: 'join',
      name: label ?? `${this.name}:join:${this.steps.length}`,
      fn,
    })
    return this
  }

  /** Branch based on a condition — routes to pass or fail step */
  conditional(condition: ConditionFn, branches: ConditionalBranches, label?: string): this {
    this.steps.push({
      type: 'conditional',
      name: label ?? `${this.name}:conditional:${this.steps.length}`,
      condition,
      branches,
    })
    return this
  }

  /** Repeat a step while condition holds */
  loop(fn: StepFn, options: LoopOptions, label?: string): this {
    this.steps.push({
      type: 'loop',
      name: label ?? `${this.name}:loop:${this.steps.length}`,
      fn,
      loopOptions: options,
    })
    return this
  }

  /** Terminal marker — signals flow completion */
  end(): FlowDefinition {
    this.steps.push({ type: 'end', name: `${this.name}:end` })
    return new FlowDefinition(this.name, this.steps)
  }
}

// ── Flow Definition (built, immutable) ───────────────────────────────────

export class FlowDefinition {
  constructor(
    readonly name: string,
    readonly steps: FlowStep[],
  ) {}

  /** Create a runner bound to a DB instance */
  runner(db: Database): FlowRunner {
    return new FlowRunner(this, db)
  }
}

// ── Flow Runner ───────────────────────────────────────────────────────────

export class FlowRunner {
  private checkpointManager: CheckpointManager

  constructor(
    private definition: FlowDefinition,
    _db: Database,
  ) {
    this.checkpointManager = new CheckpointManager(_db)
  }

  /**
   * Execute the flow from start to end.
   * Checkpoints state after every step.
   */
  async run(
    initialData: Record<string, unknown> = {},
    metadata: Record<string, unknown> = {},
    startFromStep = 0,
  ): Promise<FlowRunResult> {
    const flowId = crypto.randomUUID()
    const start = Date.now()

    let ctx: FlowContext = {
      flowId,
      flowName: this.definition.name,
      stepIndex: startFromStep,
      data: { ...initialData },
      metadata,
    }

    let stepsExecuted = 0

    try {
      for (let i = 0; i < this.definition.steps.length; i++) {
        const step = this.definition.steps[i]
        if (step.type === 'end') break
        // Skip already-completed steps when resuming from checkpoint
        if (i < startFromStep) continue

        ctx = await this.executeStep(step, ctx)
        stepsExecuted++

        // Checkpoint after every step
        await this.checkpointManager.save({
          entityType: 'flow',
          entityId: flowId,
          stepIndex: ctx.stepIndex,
          state: { data: ctx.data, stepName: step.name, stepType: step.type },
          metadata: {
            trigger: 'dag_step',
            label: step.name,
            ...metadata,
          },
        })

        ctx = { ...ctx, stepIndex: ctx.stepIndex + 1 }
      }

      return {
        flowId,
        flowName: this.definition.name,
        status: 'completed',
        stepsExecuted,
        finalContext: ctx,
        durationMs: Date.now() - start,
      }
    } catch (err) {
      return {
        flowId,
        flowName: this.definition.name,
        status: 'failed',
        stepsExecuted,
        finalContext: ctx,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /**
   * Resume a flow from a checkpoint (time travel / replay).
   * Skips steps that were already completed before the checkpoint.
   */
  async resumeFrom(checkpointId: string): Promise<FlowRunResult> {
    const checkpoint = await this.checkpointManager.get(checkpointId)
    if (!checkpoint) throw new Error(`Checkpoint ${checkpointId} not found`)

    const state = checkpoint.state as { data: Record<string, unknown> }
    const resumeFromStep = checkpoint.stepIndex + 1
    return this.run(state.data, { resumedFrom: checkpointId }, resumeFromStep)
  }

  // ── Step execution ────────────────────────────────────────────────────

  private async executeStep(step: FlowStep, ctx: FlowContext): Promise<FlowContext> {
    switch (step.type) {
      case 'start':
      case 'then':
      case 'join':
        return step.fn!(ctx)

      case 'parallel':
        return this.executeParallel(step, ctx)

      case 'conditional':
        return this.executeConditional(step, ctx)

      case 'loop':
        return this.executeLoop(step, ctx)

      default:
        return ctx
    }
  }

  private async executeParallel(step: FlowStep, ctx: FlowContext): Promise<FlowContext> {
    const fns = step.parallelFns ?? []
    const results = await Promise.allSettled(fns.map((fn) => fn(ctx)))

    // Merge all parallel results into context data
    const merged: Record<string, unknown> = { ...ctx.data }
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        Object.assign(merged, result.value.data)
        merged[`parallel_${i}_result`] = result.value.data
      } else {
        merged[`parallel_${i}_error`] = result.reason?.message ?? 'Unknown error'
      }
    })

    return { ...ctx, data: merged }
  }

  private async executeConditional(step: FlowStep, ctx: FlowContext): Promise<FlowContext> {
    if (!step.condition || !step.branches) {
      throw new Error(`Conditional step "${step.name}" missing condition or branches`)
    }
    const passed = await step.condition(ctx)
    const branchFn = passed ? step.branches.pass : step.branches.fail
    return branchFn(ctx)
  }

  private async executeLoop(step: FlowStep, ctx: FlowContext): Promise<FlowContext> {
    if (!step.loopOptions) {
      throw new Error(`Loop step "${step.name}" missing loopOptions`)
    }
    const { condition, maxIterations = 100 } = step.loopOptions
    let current = ctx
    let iterations = 0

    while (iterations < maxIterations) {
      const shouldContinue = await condition(current)
      if (!shouldContinue) break

      current = await step.fn!(current)
      iterations++

      // Checkpoint each loop iteration
      await this.checkpointManager.save({
        entityType: 'flow',
        entityId: ctx.flowId,
        stepIndex: ctx.stepIndex * 1_000_000 + iterations,
        state: { data: current.data, loop: step.name, iteration: iterations },
        metadata: { trigger: 'dag_step', label: `${step.name}:iter:${iterations}` },
      })
    }

    return { ...current, data: { ...current.data, loopIterations: iterations } }
  }
}

// ── Factory function ──────────────────────────────────────────────────────

/** Create a new flow builder */
export function flow(name: string): FlowBuilder {
  return new FlowBuilder(name)
}
