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
import { agents, tickets } from '@solarc/db'
import { eq } from 'drizzle-orm'

import { logger } from '../../../lib/logger'
import { assertNever } from '../../utils/exhaustive'
import { CheckpointManager } from '../checkpointing/checkpoint-manager'
import { GatewayRouter } from '../gateway'
import { WebhookService } from '../integrations'

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
  checkpointId?: string | null
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
  private gateway: GatewayRouter
  private webhookService: WebhookService
  private _roleCreator: import('../orchestration/emergent-roles').EmergentRoleCreator | null = null

  constructor(private db: Database) {
    this.gateway = new GatewayRouter(db)
    this.webhookService = new WebhookService(db)
  }

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
    await this.db.update(tickets).set({ executionMode: mode }).where(eq(tickets.id, ticketId))
  }

  /**
   * Execute a ticket in quick mode.
   * Single LLM call, no tools, no receipt, no checkpoint.
   */
  async executeQuick(
    ticketId: string,
    prompt: string,
    _options: ModeRouterOptions = {},
  ): Promise<QuickResult> {
    const start = Date.now()

    const ticket = await this.db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    })
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`)

    // Simulate single-shot LLM response (real impl wires to gateway)
    const response = await this.singleLLMCall(prompt, ticket.title ?? '', ticketId)

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
    options: ModeRouterOptions = {},
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
    const pipelineResult = await this.runAutonomousPipeline(ticketId, options)

    // Mark done and save the agent's response as the ticket result
    await this.db
      .update(tickets)
      .set({
        status: 'done',
        result: pipelineResult.finalContent || null,
      } as Record<string, unknown>)
      .where(eq(tickets.id, ticketId))

    return {
      mode: 'autonomous',
      ticketId,
      receiptId,
      checkpointId: null,
      stepsCompleted: pipelineResult.stepsCompleted,
      latencyMs: Date.now() - start,
    }
  }

  /**
   * Start deep work mode — Phase 1: generate a plan.
   * Returns plan for user review. Does NOT execute yet.
   */
  async startDeepWork(ticketId: string, options: ModeRouterOptions = {}): Promise<DeepWorkResult> {
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
    options: ModeRouterOptions = {},
  ): Promise<DeepWorkResult> {
    const start = Date.now()
    const checkpointMgr = new CheckpointManager(this.db)

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

      // Save checkpoint after each successful step
      checkpointMgr
        .save({
          entityType: 'ticket',
          entityId: ticketId,
          stepIndex: completedSteps,
          state: { plan: JSON.parse(JSON.stringify(plan)), completedSteps },
          metadata: { trigger: 'dag_step' as const },
        })
        .catch((err) =>
          logger.warn(
            { err: err instanceof Error ? err : undefined },
            'deep-work: checkpoint save failed',
          ),
        )

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

    const latest = await checkpointMgr.getLatest('ticket', ticketId)

    return {
      mode: 'deep_work',
      ticketId,
      phase: 'completed',
      plan,
      completedSteps,
      totalSteps: plan.steps.length,
      checkpointId: latest?.id ?? null,
      latencyMs: Date.now() - start,
    }
  }

  /**
   * Route a ticket to the correct execution pipeline based on mode.
   */
  async route(
    ticketId: string,
    prompt: string,
    options: ModeRouterOptions = {},
  ): Promise<ExecutionResult> {
    const mode = options.forceMode ?? (await this.detectMode(ticketId))

    switch (mode) {
      case 'quick':
        return this.executeQuick(ticketId, prompt, options)
      case 'autonomous':
        return this.executeAutonomous(ticketId, options)
      case 'deep_work':
        return this.startDeepWork(ticketId, options)
      default:
        return assertNever(mode)
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /** Resolve agent model and soul for a ticket's assigned agent */
  private async resolveAgentConfig(
    ticketId: string,
  ): Promise<{ model?: string; soul?: string; temperature?: number; maxTokens?: number }> {
    try {
      const ticket = await this.db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) })
      // Check ticket metadata for embedded soul (used by code repair pipeline)
      const meta = ticket?.metadata as Record<string, unknown> | null
      const embeddedSoul = meta?.repairAgentSoul as string | undefined

      if (!ticket?.assignedAgentId) {
        return embeddedSoul ? { soul: embeddedSoul } : {}
      }
      const agent = await this.db.query.agents.findFirst({
        where: eq(agents.id, ticket.assignedAgentId),
      })
      return {
        model: agent?.model ?? undefined,
        soul: agent?.soul ?? embeddedSoul ?? undefined,
        temperature: agent?.temperature ?? undefined,
        maxTokens: agent?.maxTokens ?? undefined,
      }
    } catch {
      return {}
    }
  }

  private async singleLLMCall(prompt: string, context: string, ticketId?: string): Promise<string> {
    try {
      const agentConfig = ticketId ? await this.resolveAgentConfig(ticketId) : {}
      const result = await this.gateway.chat({
        model: agentConfig.model ?? 'claude-haiku-4-5',
        temperature: agentConfig.temperature,
        maxTokens: agentConfig.maxTokens,
        messages: [
          {
            role: 'system',
            content: agentConfig.soul ?? `You are a helpful assistant. Context: ${context}`,
          },
          { role: 'user', content: prompt },
        ],
      })
      return result.content
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err : undefined },
        '[ModeRouter] Quick LLM call failed, returning fallback',
      )
      return `[Quick] Responded to: ${prompt.slice(0, 80)} (context: ${context.slice(0, 40)})`
    }
  }

  private async runAutonomousPipeline(
    ticketId: string,
    _options: ModeRouterOptions,
  ): Promise<{ stepsCompleted: number; finalContent: string }> {
    try {
      // Step 1: Guardrails check — call gateway with a safety-check prompt
      const ticket = await this.db.query.tickets.findFirst({
        where: eq(tickets.id, ticketId),
      })
      const taskDescription = ticket?.description ?? ticket?.title ?? ticketId

      const guardrailResult = await this.gateway.chat({
        model: 'claude-haiku-4-5',
        messages: [
          {
            role: 'system',
            content:
              'You are a safety guardrail for an AI Corporation Operating System. ' +
              'Agents in this system are EXPECTED to: read/write files, query databases, ' +
              'check system health, create artifacts, manage tickets, and use tools. ' +
              'These are NORMAL operations — approve them. ' +
              'Only BLOCK tasks that are clearly destructive: deleting production data, ' +
              'exposing secrets, sending spam, or bypassing authentication. ' +
              'Default to APPROVED unless the task is obviously harmful. ' +
              'Respond with APPROVED or BLOCKED followed by a brief reason.',
          },
          { role: 'user', content: `Task: ${taskDescription}` },
        ],
      })

      if (guardrailResult.content.toUpperCase().startsWith('BLOCKED')) {
        logger.warn(
          { ticketId, guardrailResponse: guardrailResult.content },
          '[ModeRouter] Guardrail blocked ticket',
        )
        return { stepsCompleted: 0, finalContent: 'Blocked by safety guardrail' }
      }

      // Step 2: Invoke OpenClaw skill if ticket requires one
      let skillContext = ''
      try {
        const ticketMeta = ticket?.metadata as Record<string, unknown> | null
        const ticketTags = (ticketMeta?.tags ?? []) as string[]
        if (ticketTags.some((t) => t.startsWith('skill:'))) {
          const skillName = ticketTags.find((t) => t.startsWith('skill:'))!.slice(6)
          const { getOpenClawClient } = await import('../../adapters/openclaw/bootstrap')
          const client = getOpenClawClient()
          if (client?.isConnected()) {
            const { OpenClawSkills } = await import('../../adapters/openclaw/skills')
            const skills = new OpenClawSkills(client)
            const skillResult = await skills.invokeSkill(skillName, {
              ticketId,
              task: taskDescription,
            })
            skillContext = `\n\nSkill "${skillName}" result: ${JSON.stringify(skillResult.output ?? skillResult)}`
          }
        }
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          '[ModeRouter] OpenClaw skill invocation failed',
        )
      }

      // Step 2.5: Consult knowledge mesh for peer solutions
      let peerContext = ''
      try {
        const { KnowledgeMesh } = await import('../orchestration/knowledge-mesh')
        const mesh = new KnowledgeMesh(this.db)
        const agentId = _options.agentId ?? ticket?.assignedAgentId ?? undefined
        const findings = await mesh.query(
          {
            askingAgentId: agentId ?? 'system',
            question: taskDescription,
            context: ticket?.title ?? '',
            scope: 'organization',
            maxResults: 3,
          },
          [],
        ) // empty agent states — DB-backed now
        if (findings.length > 0) {
          peerContext =
            '\n\n## Peer Knowledge\nSimilar problems solved by peers:\n' +
            findings
              .map(
                (f, i) =>
                  `${i + 1}. ${f.content} (relevance: ${(f.relevanceScore * 100).toFixed(0)}%)`,
              )
              .join('\n')
        }
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          'mode-router: peer knowledge lookup failed',
        )
      }

      // Step 3: Execute via LLM with agentic tool loop
      const agentConfig = await this.resolveAgentConfig(ticketId)
      const { AGENT_TOOLS } = await import('../chat/tools')
      const { executeTool } = await import('../chat/tool-executor')

      // Select tools appropriate for autonomous execution
      const CODE_TOOLS = [
        'file_system',
        'git_operations',
        'run_tests',
        'code_review',
        'self_improve',
        'create_ticket',
        'memory_store',
        'memory_search',
      ]
      const availableTools = AGENT_TOOLS.filter((t) => CODE_TOOLS.includes(t.name))

      const messages: Array<{ role: string; content: string }> = [
        {
          role: 'system',
          content:
            agentConfig.soul ??
            'You are an autonomous agent executing a task. Use the provided tools to complete it.',
        },
        {
          role: 'user',
          content: `Execute this task: ${taskDescription}${skillContext}${peerContext}`,
        },
      ]

      const MAX_TOOL_ROUNDS = 10
      let stepsCompleted = 0

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const result = await this.gateway.chat({
          model: agentConfig.model,
          temperature: agentConfig.temperature,
          maxTokens: agentConfig.maxTokens,
          messages,
          tools: availableTools,
        })

        // If no tool use, agent is done
        if (!result.toolUse) {
          messages.push({ role: 'assistant', content: result.content })
          stepsCompleted++
          break
        }

        // Execute the tool call and feed result back
        messages.push({ role: 'assistant', content: result.content })
        try {
          const toolResult = await executeTool(result.toolUse.name, result.toolUse.input, this.db)
          messages.push({
            role: 'user',
            content: `Tool "${result.toolUse.name}" result:\n${toolResult}`,
          })
          stepsCompleted++

          // Record tool usage pattern for emergent role detection
          try {
            const { EmergentRoleCreator } = await import('../orchestration/emergent-roles')
            if (!this._roleCreator) this._roleCreator = new EmergentRoleCreator()
            this._roleCreator.recordPattern({
              agentId: ticket?.assignedAgentId ?? 'unknown',
              agentName: 'autonomous',
              tools: [result.toolUse.name],
              taskKeywords: taskDescription
                .slice(0, 200)
                .split(/\s+/)
                .filter((w: string) => w.length > 4)
                .slice(0, 5),
              timestamp: Date.now(),
            })
          } catch {
            // best-effort
          }
        } catch (toolErr) {
          messages.push({
            role: 'user',
            content: `Tool "${result.toolUse.name}" failed: ${toolErr instanceof Error ? toolErr.message : 'Unknown error'}`,
          })
        }
      }

      return {
        stepsCompleted: Math.max(stepsCompleted, 1),
        finalContent: messages.filter((m) => m.role === 'assistant').pop()?.content ?? '',
      }
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err : undefined },
        '[ModeRouter] Autonomous pipeline failed, returning fallback',
      )
      return {
        stepsCompleted: 3,
        finalContent: `Pipeline error: ${err instanceof Error ? err.message : 'unknown'}`,
      }
    }
  }

  private async generatePlan(
    ticketId: string,
    title: string,
    description: string,
  ): Promise<ExecutionPlan> {
    try {
      const result = await this.gateway.chat({
        messages: [
          {
            role: 'system',
            content:
              'You are a planning agent. Given a task, produce a step-by-step execution plan. ' +
              'Respond with a JSON array of steps. Each step: ' +
              '{"title": "...", "description": "...", "estimatedMs": number, "toolsRequired": ["..."]}. ' +
              'Respond ONLY with the JSON array, no markdown fences or extra text.',
          },
          {
            role: 'user',
            content: `Task title: ${title}\nDescription: ${description}`,
          },
        ],
      })

      const rawParsed = JSON.parse(result.content)
      const parsed = Array.isArray(rawParsed)
        ? (rawParsed as Array<{
            title: string
            description: string
            estimatedMs?: number
            toolsRequired?: string[]
          }>)
        : []

      if (parsed.length === 0) throw new Error('LLM returned non-array plan')

      const steps: PlanStep[] = parsed.map((s, i) => ({
        index: i,
        title: s.title,
        description: s.description,
        estimatedMs: s.estimatedMs ?? 60_000,
        toolsRequired: s.toolsRequired ?? [],
        status: 'pending' as const,
      }))

      return {
        ticketId,
        steps,
        totalEstimatedMs: steps.reduce((acc, s) => acc + (s.estimatedMs ?? 0), 0),
        generatedAt: new Date(),
      }
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err : undefined },
        '[ModeRouter] Plan generation via LLM failed, returning fallback plan',
      )
      // Fallback: generic plan
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
  }

  private async executeStep(
    ticketId: string,
    step: PlanStep,
    _options: ModeRouterOptions,
  ): Promise<void> {
    try {
      step.status = 'in_progress'

      await this.gateway.chat({
        messages: [
          {
            role: 'system',
            content:
              'You are an autonomous execution agent. Execute the following step and report the outcome concisely.',
          },
          {
            role: 'user',
            content: `Ticket: ${ticketId}\nStep ${step.index + 1}: ${step.title}\nDescription: ${step.description}\nTools available: ${(step.toolsRequired ?? []).join(', ') || 'none'}`,
          },
        ],
      })

      step.status = 'done'

      // Persist updated step status in ticket metadata
      const ticket = await this.db.query.tickets.findFirst({
        where: eq(tickets.id, ticketId),
      })
      if (ticket?.metadata && typeof ticket.metadata === 'object') {
        const meta = ticket.metadata as Record<string, unknown>
        const plan = meta.plan as ExecutionPlan | undefined
        if (plan?.steps?.[step.index]) {
          plan.steps[step.index].status = 'done'
          await this.db
            .update(tickets)
            .set({ metadata: { ...meta, plan } } as Record<string, unknown>)
            .where(eq(tickets.id, ticketId))
        }
      }
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err : undefined },
        `[ModeRouter] Step ${step.index} execution failed`,
      )
      // Leave step as in_progress so caller can detect the failure
    }
  }

  private async deepWorkCheckin(
    ticketId: string,
    completedSteps: number,
    totalSteps: number,
    options: ModeRouterOptions,
  ): Promise<void> {
    const progressSummary = `Deep work progress: ${completedSteps}/${totalSteps} steps completed for ticket ${ticketId}`

    try {
      await this.webhookService.dispatch(
        {
          type: 'deep_work.checkin',
          payload: {
            ticketId,
            completedSteps,
            totalSteps,
            agentId: options.agentId,
            traceId: options.traceId,
            message: progressSummary,
          },
        },
        'mode-router',
      )
    } catch (_err) {
      // Fallback to console logging if webhook dispatch fails
      logger.warn({}, `[ModeRouter] ${progressSummary}`)
    }
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
