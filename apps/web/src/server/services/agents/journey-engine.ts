/**
 * Journey Engine — Declarative Agent Behavior via State Machines
 *
 * Based on the Parlant pattern: journeys, transitions, glossaries,
 * and condition-action guidelines. Better than prompt-only agents
 * for constrained domains.
 *
 * Sits between:
 * - Flow Engine (deterministic orchestration)
 * - Crew Engine (autonomous reasoning)
 *
 * The journey engine enforces state transitions deterministically
 * while allowing LLM reasoning within each state.
 */

import { logger } from '../../../lib/logger'

export interface JourneyDefinition {
  id: string
  name: string
  description: string
  /** Domain-specific vocabulary */
  glossary: Record<string, string>
  /** Starting state */
  initialState: string
  /** State definitions */
  states: Record<string, StateDefinition>
  /** Which agent executes this journey */
  agentId?: string
  /** Domain this journey belongs to */
  domain?: string
}

export interface StateDefinition {
  /** Human-readable name */
  name?: string
  /** Condition-action guidelines for the LLM within this state */
  guidelines: Guideline[]
  /** Deterministic transitions to other states */
  transitions: Record<string, string>
  /** Tools available in this state */
  availableTools?: string[]
  /** Whether this is a terminal state */
  terminal?: boolean
}

export interface Guideline {
  when: string
  action: string
  tool?: string
  priority?: number
}

export interface JourneyExecution {
  id: string
  journeyId: string
  currentState: string
  history: StateTransition[]
  context: Record<string, unknown>
  status: 'active' | 'completed' | 'failed' | 'paused'
  startedAt: Date
  completedAt?: Date
}

export interface StateTransition {
  fromState: string
  toState: string
  trigger: string
  timestamp: Date
  /** LLM reasoning for this transition */
  reasoning?: string
  /** Tool calls made in the source state */
  toolCalls?: Array<{ tool: string; result: unknown }>
}

// ── Journey Builder (fluent API) ────────────────────────────────────────

export function journey(id: string): JourneyBuilder {
  return new JourneyBuilder(id)
}

class JourneyBuilder {
  private def: JourneyDefinition

  constructor(id: string) {
    this.def = {
      id,
      name: id,
      description: '',
      glossary: {},
      initialState: '',
      states: {},
    }
  }

  name(name: string): this {
    this.def.name = name
    return this
  }

  description(desc: string): this {
    this.def.description = desc
    return this
  }

  glossary(terms: Record<string, string>): this {
    this.def.glossary = { ...this.def.glossary, ...terms }
    return this
  }

  agent(agentId: string): this {
    this.def.agentId = agentId
    return this
  }

  domain(domain: string): this {
    this.def.domain = domain
    return this
  }

  initialState(stateId: string): this {
    this.def.initialState = stateId
    return this
  }

  state(
    id: string,
    definition: {
      name?: string
      guidelines: Array<{ when: string; action: string; tool?: string }>
      transitions?: Record<string, string>
      tools?: string[]
      terminal?: boolean
    },
  ): this {
    this.def.states[id] = {
      name: definition.name,
      guidelines: definition.guidelines.map((g, i) => ({ ...g, priority: i })),
      transitions: definition.transitions ?? {},
      availableTools: definition.tools,
      terminal: definition.terminal,
    }
    if (!this.def.initialState) this.def.initialState = id
    return this
  }

  build(): JourneyDefinition {
    if (!this.def.initialState) throw new Error('Journey must have at least one state')
    return this.def
  }
}

// ── Journey Engine ──────────────────────────────────────────────────────

const activeExecutions = new Map<string, JourneyExecution>()
let _dbLoaded = false

export class JourneyEngine {
  private db: unknown = null

  constructor(db?: unknown) {
    this.db = db ?? null
    if (this.db && !_dbLoaded) {
      _dbLoaded = true
      this.loadFromDb().catch((err) => {
        logger.error(
          { err: err instanceof Error ? err : undefined },
          '[JourneyEngine] Failed to load from DB',
        )
      })
    }
  }

  /** Load active journey executions from database on startup */
  private async loadFromDb(): Promise<void> {
    if (!this.db) return
    try {
      const { journeyExecutions } = await import('@solarc/db')
      const { eq } = await import('drizzle-orm')
      const db = this.db as import('@solarc/db').Database
      const rows = await db.query.journeyExecutions.findMany({
        where: eq(journeyExecutions.status, 'active'),
      })
      for (const row of rows) {
        activeExecutions.set(row.id, {
          id: row.id,
          journeyId: row.journeyId,
          currentState: row.currentState,
          context: (row.context as Record<string, unknown>) ?? {},
          history: (row.history as Array<StateTransition>) ?? [],
          status: row.status as JourneyExecution['status'],
          startedAt: row.startedAt,
        })
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err : undefined }, '[JourneyEngine] DB load failed')
    }
  }

  /** Persist journey execution to DB */
  private persistExecution(execution: JourneyExecution): void {
    if (!this.db) return
    import('@solarc/db')
      .then(async ({ journeyExecutions }) => {
        const db = this.db as import('@solarc/db').Database
        await db
          .insert(journeyExecutions)
          .values({
            id: execution.id,
            journeyId: execution.journeyId,
            status: execution.status as 'active' | 'paused' | 'completed' | 'failed',
            currentState: execution.currentState,
            context: execution.context,
            history: execution.history as unknown as Record<string, unknown>,
            startedAt: execution.startedAt,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: journeyExecutions.id,
            set: {
              status: execution.status as 'active' | 'paused' | 'completed' | 'failed',
              currentState: execution.currentState,
              context: execution.context,
              history: execution.history as unknown as Record<string, unknown>,
              updatedAt: new Date(),
            },
          })
      })
      .catch((err) => {
        logger.error(
          { err: err instanceof Error ? err : undefined },
          '[JourneyEngine] DB persist failed',
        )
      })
  }

  /**
   * Start a new journey execution.
   */
  start(journeyDef: JourneyDefinition, context: Record<string, unknown> = {}): JourneyExecution {
    const execution: JourneyExecution = {
      id: crypto.randomUUID(),
      journeyId: journeyDef.id,
      currentState: journeyDef.initialState,
      history: [],
      context,
      status: 'active',
      startedAt: new Date(),
    }

    activeExecutions.set(execution.id, execution)
    this.persistExecution(execution)
    return execution
  }

  /**
   * Process an event in a running journey — determines if a transition should occur.
   */
  async processEvent(
    executionId: string,
    journeyDef: JourneyDefinition,
    trigger: string,
    eventData?: Record<string, unknown>,
  ): Promise<{ transitioned: boolean; newState?: string; execution: JourneyExecution }> {
    const execution = activeExecutions.get(executionId)
    if (!execution) throw new Error(`Execution not found: ${executionId}`)
    if (execution.status !== 'active') {
      return { transitioned: false, execution }
    }

    const currentStateDef = journeyDef.states[execution.currentState]
    if (!currentStateDef) throw new Error(`State not found: ${execution.currentState}`)

    // Check if trigger matches any transition
    const nextStateId = currentStateDef.transitions[trigger]
    if (!nextStateId) {
      return { transitioned: false, execution }
    }

    // Execute transition
    const transition: StateTransition = {
      fromState: execution.currentState,
      toState: nextStateId,
      trigger,
      timestamp: new Date(),
    }

    execution.history.push(transition)
    execution.currentState = nextStateId

    // Update context with event data
    if (eventData) {
      Object.assign(execution.context, eventData)
    }

    // Check if new state is terminal
    const nextStateDef = journeyDef.states[nextStateId]
    if (nextStateDef?.terminal) {
      execution.status = 'completed'
      execution.completedAt = new Date()
    }

    this.persistExecution(execution)
    return { transitioned: true, newState: nextStateId, execution }
  }

  /**
   * Get the current state's guidelines formatted for LLM injection.
   */
  getStatePrompt(journeyDef: JourneyDefinition, execution: JourneyExecution): string {
    const stateDef = journeyDef.states[execution.currentState]
    if (!stateDef) return ''

    const lines: string[] = [
      `## Current Journey: ${journeyDef.name}`,
      `**State**: ${stateDef.name ?? execution.currentState}`,
      '',
    ]

    // Add glossary
    if (Object.keys(journeyDef.glossary).length > 0) {
      lines.push('### Glossary')
      for (const [term, definition] of Object.entries(journeyDef.glossary)) {
        lines.push(`- **${term}**: ${definition}`)
      }
      lines.push('')
    }

    // Add guidelines
    lines.push('### Guidelines (follow in order)')
    for (const guideline of stateDef.guidelines) {
      const toolHint = guideline.tool ? ` → use tool: \`${guideline.tool}\`` : ''
      lines.push(`- When ${guideline.when}: ${guideline.action}${toolHint}`)
    }
    lines.push('')

    // Add available transitions
    const transitions = Object.entries(stateDef.transitions)
    if (transitions.length > 0) {
      lines.push('### Possible Transitions')
      for (const [trigger, target] of transitions) {
        lines.push(`- "${trigger}" → moves to state: ${target}`)
      }
    }

    // Add available tools
    if (stateDef.availableTools?.length) {
      lines.push('', '### Available Tools')
      lines.push(stateDef.availableTools.map((t) => `- \`${t}\``).join('\n'))
    }

    return lines.join('\n')
  }

  /**
   * Get execution status.
   */
  getExecution(id: string): JourneyExecution | null {
    return activeExecutions.get(id) ?? null
  }

  /**
   * List all active executions.
   */
  listActive(): JourneyExecution[] {
    return Array.from(activeExecutions.values()).filter((e) => e.status === 'active')
  }

  /**
   * Pause an execution (for HITL).
   */
  pause(executionId: string): void {
    const execution = activeExecutions.get(executionId)
    if (execution) {
      execution.status = 'paused'
      this.persistExecution(execution)
    }
  }

  /**
   * Resume a paused execution.
   */
  resume(executionId: string): void {
    const execution = activeExecutions.get(executionId)
    if (execution && execution.status === 'paused') {
      execution.status = 'active'
      this.persistExecution(execution)
    }
  }

  /**
   * Fail an execution.
   */
  fail(executionId: string): void {
    const execution = activeExecutions.get(executionId)
    if (execution) {
      execution.status = 'failed'
      execution.completedAt = new Date()
      this.persistExecution(execution)
    }
  }
}
