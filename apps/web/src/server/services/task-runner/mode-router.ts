/**
 * Mode Router — Tiered Agent Execution
 *
 * Routes tickets through one of three execution pipelines:
 *
 * quick      — Single LLM call, no tools, no receipt, no checkpoint (<60s)
 * autonomous — Full pipeline: lease → guardrails → LLM+tools → receipt → checkpoint
 * deep_work  — Plan → user approval → autonomous execution with periodic check-ins
 *
 * Auto-detection logic:
 *   easy + no tools            → quick
 *   medium/hard OR tools       → autonomous
 *   critical OR project-level  → deep_work
 */

import type { Database } from '@solarc/db'
import { tickets } from '@solarc/db'
import { eq } from 'drizzle-orm'

export type ExecutionMode = 'quick' | 'autonomous' | 'deep_work'
export type TicketComplexity = 'easy' | 'medium' | 'hard' | 'critical'

export interface PlanStep {
  index: number
  title: string
  description: string
  estimatedMs?: number
  toolsRequired?: string[]
  status: 'pending' | 'in_progress' | 'done' | 'skipped'
}

export interface ExecutionPlan {
  ticketId: string
  steps: PlanStep[]
  totalEstimatedMs: number
  generatedAt: Date
  approvedAt?: Date
  approvedBy?: string
}

export interface QuickResult {
  mode: 'quick'
  ticketId: string
  response: string
  latencyMs: number
}

export interface AutonomousResult {
  mode: 'autonomous'
  ticketId: string
  receiptId: string
  checkpointId: string | null
  stepsCompleted: number
  latencyMs: number
}

export interface DeepWorkResult {
  mode: 'deep_work'
  ticketId: string
  phase: 'planning' | 'awaiting_approval' | 'executing' | 'completed'
  plan?: ExecutionPlan
  completedSteps?: number
  totalSteps?: number
  latencyMs: number
}

export type ExecutionResult = QuickResult | AutonomousResult | DeepWorkResult

export interface ModeRouterOptions {
  /** Override auto-detected mode */
  forceMode?: ExecutionMode
  /** For deep_work: pre-approved plan (skips approval gate) */
  approvedPlan?: ExecutionPlan
  /** Agent performing the execution */
  agentId?: string
  /** Trace ID for observability */
  traceId?: string
}

/** Check-in interval for deep_work: every 5 steps or 5 minutes */
const DEEP_WORK_CHECKIN_STEPS = 5
const DEEP_WORK_CHECKIN_MS = 5 * 60 * 1000

export class ModeRouter {
  constructor(private db: Database) {}

  /**
   * Auto-detect the best execution mode for a ticket.
   */
  async detectMode(ticketId: string): Promise<ExecutionMode> {
    const ticket = await this.db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    })
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`)

    // Explicit override wins
    if (ticket.executionMode && ticket.executionMode !== 'autonomous') {
      return ticket.executionMode as ExecutionMode
    }

    const complexity = (ticket.complexity ?? 'medium') as TicketComplexity
    const isProjectLevel = !!ticket.projectId

    if (complexity === 'critical' || isProjectLevel) return 'deep_work'
    if (complexity === 'easy') return 'quick'
    return 'autonomous'
  }

  /**
   * Update a ticket's execution mode in the DB.
   */
  async setMode(ticketId: string, mode: ExecutionMode): Promise<void> {
    await this.db
      .update(tickets)
      .set({ executionMode: mode })
      .where(eq(tickets.id, ticketId))
  }

  /**
   * Execute a ticket in quick mode.
   * Single LLM call, no tools, no receipt, no checkpoint.
   */
  async executeQuick(
    ticketId: string,
    prompt: string,
    options: ModeRouterOptions = {}
  ): Promise<QuickResult> {
    const start = Date.now()

    const ticket = await this.db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    })
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`)

    // Simulate single-shot LLM response (real impl wires to gateway)
    const response = await this.singleLLMCall(prompt, ticket.title ?? '')

    const latencyMs = Date.now() - start

    // Update ticket to done
    await this.db
      .update(tickets)
      .set({ status: 'done', executionMode: 'quick' } as Record<string, unknown>)
      .where(eq(tickets.id, ticketId))

    return { mode: 'quick', ticketId, response, latencyMs }
  }

  /**
   * Execute a ticket in autonomous mode.
   * Full pipeline: lease → guardrails → LLM with tools → receipt → checkpoint.
   * Returns references to receipt and checkpoint for traceability.
   */
  async executeAutonomous(
    ticketId: string,
    options: ModeRouterOptions = {}
  ): Promise<AutonomousResult> {
    const start = Date.now()

    const ticket = await this.db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    })
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`)

    // Mark in_progress
    await this.db
      .update(tickets)
      .set({ status: 'in_progress', executionMode: 'autonomous' } as Record<string, unknown>)
      .where(eq(tickets.id, ticketId))

    // Simulate pipeline steps (real impl delegates to TicketExecutionEngine,
    // ReceiptManager, CheckpointManager, GuardrailsEngine)
    const receiptId = crypto.randomUUID()
    const stepsCompleted = await this.runAutonomousPipeline(ticketId, options)

    // Mark done
    await this.db
      .update(tickets)
      .set({ status: 'done' } as Record<string, unknown>)
      .where(eq(tickets.id, ticketId))

    return {
      mode: 'autonomous',
      ticketId,
      receiptId,
      checkpointId: null, // set by CheckpointManager in full impl
      stepsCompleted,
      latencyMs: Date.now() - start,
    }
  }

  /**
   * Start deep work mode — Phase 1: generate a plan.
   * Returns plan for user review. Does NOT execute yet.
   */
  async startDeepWork(
    ticketId: string,
    options: ModeRouterOptions = {}
  ): Promise<DeepWorkResult> {
    const start = Date.now()

    const ticket = await this.db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    })
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`)

    await this.db
      .update(tickets)
      .set({ executionMode: 'deep_work' } as Record<string, unknown>)
      .where(eq(tickets.id, ticketId))

    // If plan already approved, go straight to execution
    if (options.approvedPlan) {
      return this.executeDeepWork(ticketId, options.approvedPlan, options)
    }

    // Generate plan
    const plan = await this.generatePlan(ticketId, ticket.title ?? '', ticket.description ?? '')

    // Store plan in ticket metadata
    await this.db
      .update(tickets)
      .set({ metadata: { plan } } as Record<string, unknown>)
      .where(eq(tickets.id, ticketId))

    return {
      mode: 'deep_work',
      ticketId,
      phase: 'awaiting_approval',
      plan,
      latencyMs: Date.now() - start,
    }
  }

  /**
   * Execute an approved deep work plan — Phase 3: autonomous execution with check-ins.
   */
  async executeDeepWork(
    ticketId: string,
    plan: ExecutionPlan,
    options: ModeRouterOptions = {}
  ): Promise<DeepWorkResult> {
    const start = Date.now()

    await this.db
      .update(tickets)
      .set({ status: 'in_progress' } as Record<string, unknown>)
      .where(eq(tickets.id, ticketId))

    let completedSteps = 0
    let lastCheckinAt = Date.now()

    for (const step of plan.steps) {
      if (step.status === 'skipped') continue

      // Execute step
      await this.executeStep(ticketId, step, options)
      completedSteps++

      // Check-in: every DEEP_WORK_CHECKIN_STEPS or DEEP_WORK_CHECKIN_MS
      const timeSinceCheckin = Date.now() - lastCheckinAt
      if (
        completedSteps % DEEP_WORK_CHECKIN_STEPS === 0 ||
        timeSinceCheckin >= DEEP_WORK_CHECKIN_MS
      ) {
        await this.deepWorkCheckin(ticketId, completedSteps, plan.steps.length, options)
        lastCheckinAt = Date.now()
      }
    }

    await this.db
      .update(tickets)
      .set({ status: 'done' } as Record<string, unknown>)
      .where(eq(tickets.id, ticketId))

    return {
      mode: 'deep_work',
      ticketId,
      phase: 'completed',
      plan,
      completedSteps,
      totalSteps: plan.steps.length,
      latencyMs: Date.now() - start,
    }
  }

  /**
   * Route a ticket to the correct execution pipeline based on mode.
   */
  async route(
    ticketId: string,
    prompt: string,
    options: ModeRouterOptions = {}
  ): Promise<ExecutionResult> {
    const mode = options.forceMode ?? (await this.detectMode(ticketId))

    switch (mode) {
      case 'quick':
        return this.executeQuick(ticketId, prompt, options)
      case 'autonomous':
        return this.executeAutonomous(ticketId, options)
      case 'deep_work':
        return this.startDeepWork(ticketId, options)
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async singleLLMCall(prompt: string, context: string): Promise<string> {
    // Stub — real impl calls GatewayRouter with quick model (haiku)
    return `[Quick] Responded to: ${prompt.slice(0, 80)} (context: ${context.slice(0, 40)})`
  }

  private async runAutonomousPipeline(
    ticketId: string,
    options: ModeRouterOptions
  ): Promise<number> {
    // Stub — real impl: GuardrailsEngine.check → GatewayRouter.chat (with tools)
    // → ReceiptManager.record → CheckpointManager.save
    return 3
  }

  private async generatePlan(
    ticketId: string,
    title: string,
    description: string
  ): Promise<ExecutionPlan> {
    // Stub — real impl calls LLM with system prompt asking for step-by-step plan
    const steps: PlanStep[] = [
      {
        index: 0,
        title: 'Analyze requirements',
        description: `Review the ticket: "${title}" and gather context`,
        estimatedMs: 30_000,
        toolsRequired: ['memory.search'],
        status: 'pending',
      },
      {
        index: 1,
        title: 'Design approach',
        description: 'Outline the implementation strategy',
        estimatedMs: 60_000,
        toolsRequired: [],
        status: 'pending',
      },
      {
        index: 2,
        title: 'Execute implementation',
        description: 'Carry out the planned changes',
        estimatedMs: 300_000,
        toolsRequired: ['integrations.run', 'orchestration.ticket.create'],
        status: 'pending',
      },
      {
        index: 3,
        title: 'Verify and report',
        description: 'Validate results and summarize outcomes',
        estimatedMs: 30_000,
        toolsRequired: ['evals.run'],
        status: 'pending',
      },
    ]

    return {
      ticketId,
      steps,
      totalEstimatedMs: steps.reduce((acc, s) => acc + (s.estimatedMs ?? 0), 0),
      generatedAt: new Date(),
    }
  }

  private async executeStep(
    ticketId: string,
    step: PlanStep,
    options: ModeRouterOptions
  ): Promise<void> {
    // Stub — real impl runs autonomous pipeline for a single step
    // and updates step.status in ticket.metadata.plan
  }

  private async deepWorkCheckin(
    ticketId: string,
    completedSteps: number,
    totalSteps: number,
    options: ModeRouterOptions
  ): Promise<void> {
    // Stub — real impl sends notification to agent/user with progress summary
    // and awaits optional human intervention before continuing
  }
}

/**
 * Suggest an execution mode icon for UI display.
 */
export function modeIcon(mode: ExecutionMode): string {
  switch (mode) {
    case 'quick':
      return '⚡'
    case 'autonomous':
      return '⚙️'
    case 'deep_work':
      return '🧠'
  }
}

/**
 * Suggest an execution mode label.
 */
export function modeLabel(mode: ExecutionMode): string {
  switch (mode) {
    case 'quick':
      return 'Quick'
    case 'autonomous':
      return 'Autonomous'
    case 'deep_work':
      return 'Deep Work'
  }
}
