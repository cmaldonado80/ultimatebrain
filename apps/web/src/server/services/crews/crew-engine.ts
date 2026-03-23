/**
 * Crew Engine — Autonomous Multi-Agent Reasoning
 *
 * Crews handle the HOW of execution — autonomous reasoning using a ReAct loop.
 * Flows handle the WHEN — deterministic orchestration that invokes Crews.
 *
 * Each agent in a crew has:
 * - role: what it is (e.g. "Senior Frontend Engineer")
 * - goal: what it's trying to achieve
 * - backstory: context that shapes its reasoning
 * - tools: what it can call
 * - allow_delegation: whether it can delegate to other agents
 *
 * Auto-generated delegation tools (when allow_delegation: true):
 * - delegate_work(to_agent, task_description) — async delegation
 * - ask_question(to_agent, question)          — sync Q&A
 */

import type { Database } from '@solarc/db'
import { GatewayRouter } from '../gateway'

// ── Types ─────────────────────────────────────────────────────────────────

export interface AgentDefinition {
  id: string
  role: string
  goal: string
  backstory: string
  tools?: ToolDefinition[]
  allowDelegation?: boolean
  maxIterations?: number
  verbose?: boolean
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, { type: string; description: string; required?: boolean }>
  execute: (args: Record<string, unknown>, ctx: CrewContext) => Promise<unknown>
}

export interface CrewDefinition {
  name: string
  agents: AgentDefinition[]
  task: string
  verbose?: boolean
}

export interface CrewContext {
  crewId: string
  crewName: string
  task: string
  agentId: string
  iteration: number
  memory: Record<string, unknown>
  delegations: DelegationRecord[]
}

export interface DelegationRecord {
  fromAgentId: string
  toAgentId: string
  task: string
  result?: unknown
  timestamp: Date
}

export interface ReActStep {
  iteration: number
  thought: string
  action: string | null
  actionInput: Record<string, unknown> | null
  observation: string | null
  isFinal: boolean
  finalAnswer?: string
}

export interface AgentRunResult {
  agentId: string
  role: string
  task: string
  steps: ReActStep[]
  finalAnswer: string
  iterationsUsed: number
  toolsUsed: string[]
  delegationsMade: DelegationRecord[]
  durationMs: number
}

export interface CrewRunResult {
  crewId: string
  crewName: string
  task: string
  agentResults: AgentRunResult[]
  finalOutput: string
  durationMs: number
  status: 'completed' | 'failed' | 'max_iterations_reached'
}

const DEFAULT_MAX_ITERATIONS = 10

// ── Crew Engine ───────────────────────────────────────────────────────────

export class CrewEngine {
  private gateway: GatewayRouter

  constructor(_db: Database) {
    this.gateway = new GatewayRouter(_db)
  }

  /**
   * Run a crew on a task. Each agent executes its role via ReAct loop.
   * Agents with allow_delegation get auto-generated delegation tools.
   */
  async run(definition: CrewDefinition): Promise<CrewRunResult> {
    const crewId = crypto.randomUUID()
    const start = Date.now()

    const agentResults: AgentRunResult[] = []
    let lastOutput = ''

    for (const agentDef of definition.agents) {
      const tools = this.buildTools(agentDef, definition.agents)
      const result = await this.runAgent(agentDef, definition.task, crewId, tools, definition.name)
      agentResults.push(result)
      lastOutput = result.finalAnswer
    }

    return {
      crewId,
      crewName: definition.name,
      task: definition.task,
      agentResults,
      finalOutput: lastOutput,
      durationMs: Date.now() - start,
      status: 'completed',
    }
  }

  /**
   * Run a single agent through the ReAct loop.
   * Thought → Action → Observation → repeat until final answer.
   */
  async runAgent(
    agent: AgentDefinition,
    task: string,
    crewId: string,
    tools: ToolDefinition[],
    crewName = ''
  ): Promise<AgentRunResult> {
    const start = Date.now()
    const maxIterations = agent.maxIterations ?? DEFAULT_MAX_ITERATIONS
    const steps: ReActStep[] = []
    const delegations: DelegationRecord[] = []
    const toolsUsed: Set<string> = new Set()

    const ctx: CrewContext = {
      crewId,
      crewName,
      task,
      agentId: agent.id,
      iteration: 0,
      memory: {},
      delegations,
    }

    let iteration = 0
    let finalAnswer = ''

    while (iteration < maxIterations) {
      const step = await this.reactStep(agent, task, steps, tools, ctx, iteration)
      steps.push(step)

      if (step.action) toolsUsed.add(step.action)

      if (step.isFinal) {
        finalAnswer = step.finalAnswer ?? step.observation ?? ''
        break
      }

      iteration++
      ctx.iteration = iteration
    }

    if (!finalAnswer && steps.length > 0) {
      finalAnswer = steps[steps.length - 1].observation ?? 'No final answer produced'
    }

    return {
      agentId: agent.id,
      role: agent.role,
      task,
      steps,
      finalAnswer,
      iterationsUsed: iteration + 1,
      toolsUsed: Array.from(toolsUsed),
      delegationsMade: delegations,
      durationMs: Date.now() - start,
    }
  }

  // ── ReAct Step ────────────────────────────────────────────────────────

  private async reactStep(
    agent: AgentDefinition,
    task: string,
    previousSteps: ReActStep[],
    tools: ToolDefinition[],
    ctx: CrewContext,
    iteration: number
  ): Promise<ReActStep> {
    // Build prompt with agent persona + scratchpad
    const scratchpad = previousSteps
      .map((s) => [
        `Thought: ${s.thought}`,
        s.action ? `Action: ${s.action}` : null,
        s.actionInput ? `Action Input: ${JSON.stringify(s.actionInput)}` : null,
        s.observation ? `Observation: ${s.observation}` : null,
      ]
        .filter(Boolean)
        .join('\n'))
      .join('\n\n')

    const toolDescriptions = tools
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n')

    // Stub LLM call — real impl calls GatewayRouter with agent system prompt
    const llmResponse = await this.callLLM({
      systemPrompt: this.buildSystemPrompt(agent, toolDescriptions),
      userPrompt: `Task: ${task}\n\n${scratchpad}`,
      iteration,
    })

    // Parse the LLM response into thought/action/observation
    const parsed = this.parseReActResponse(llmResponse, tools)

    // Execute the action if one was chosen
    let observation: string | null = null
    if (parsed.action && !parsed.isFinal) {
      const tool = tools.find((t) => t.name === parsed.action)
      if (tool) {
        try {
          const result = await tool.execute(parsed.actionInput ?? {}, ctx)
          observation = typeof result === 'string' ? result : JSON.stringify(result)
        } catch (err) {
          observation = `Error executing ${parsed.action}: ${err instanceof Error ? err.message : String(err)}`
        }
      } else {
        observation = `Unknown tool: ${parsed.action}. Available: ${tools.map((t) => t.name).join(', ')}`
      }
    }

    return {
      iteration,
      thought: parsed.thought,
      action: parsed.action,
      actionInput: parsed.actionInput,
      observation,
      isFinal: parsed.isFinal,
      finalAnswer: parsed.finalAnswer,
    }
  }

  // ── Tool Building ─────────────────────────────────────────────────────

  /**
   * Build the full tool set for an agent, including auto-generated
   * delegation tools if allow_delegation is true.
   */
  private buildTools(agent: AgentDefinition, allAgents: AgentDefinition[]): ToolDefinition[] {
    const tools: ToolDefinition[] = [...(agent.tools ?? [])]

    if (!agent.allowDelegation) return tools

    const otherAgents = allAgents.filter((a) => a.id !== agent.id)

    // Auto-generate: delegate_work
    tools.push({
      name: 'delegate_work',
      description: `Delegate a subtask to another agent. Available agents: ${otherAgents.map((a) => `${a.id} (${a.role})`).join(', ')}`,
      parameters: {
        to_agent: { type: 'string', description: 'Agent ID to delegate to', required: true },
        task_description: { type: 'string', description: 'The task to delegate', required: true },
      },
      execute: async (args, ctx) => {
        const targetAgent = otherAgents.find((a) => a.id === args.to_agent)
        if (!targetAgent) return `Agent ${args.to_agent} not found`

        const targetTools = this.buildTools(targetAgent, allAgents)
        const result = await this.runAgent(
          targetAgent,
          String(args.task_description),
          ctx.crewId,
          targetTools
        )

        ctx.delegations.push({
          fromAgentId: agent.id,
          toAgentId: String(args.to_agent),
          task: String(args.task_description),
          result: result.finalAnswer,
          timestamp: new Date(),
        })

        return result.finalAnswer
      },
    })

    // Auto-generate: ask_question
    tools.push({
      name: 'ask_question',
      description: `Ask another agent a question and get a synchronous answer. Available agents: ${otherAgents.map((a) => `${a.id} (${a.role})`).join(', ')}`,
      parameters: {
        to_agent: { type: 'string', description: 'Agent ID to ask', required: true },
        question: { type: 'string', description: 'The question to ask', required: true },
      },
      execute: async (args, ctx) => {
        const targetAgent = otherAgents.find((a) => a.id === args.to_agent)
        if (!targetAgent) return `Agent ${args.to_agent} not found`

        const targetTools = this.buildTools(targetAgent, allAgents)
        const result = await this.runAgent(
          { ...targetAgent, maxIterations: 3 }, // single-shot Q&A
          String(args.question),
          ctx.crewId,
          targetTools
        )

        ctx.delegations.push({
          fromAgentId: agent.id,
          toAgentId: String(args.to_agent),
          task: `Q: ${args.question}`,
          result: result.finalAnswer,
          timestamp: new Date(),
        })

        return result.finalAnswer
      },
    })

    return tools
  }

  // ── LLM + Parsing stubs ───────────────────────────────────────────────

  private async callLLM(params: {
    systemPrompt: string
    userPrompt: string
    iteration: number
  }): Promise<string> {
    const result = await this.gateway.chat({
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
    })
    return result.content
  }

  private parseReActResponse(
    response: string,
    _tools: ToolDefinition[]
  ): {
    thought: string
    action: string | null
    actionInput: Record<string, unknown> | null
    isFinal: boolean
    finalAnswer?: string
  } {
    const lines = response.split('\n').map((l) => l.trim())

    let thought = ''
    let action: string | null = null
    let actionInput: Record<string, unknown> | null = null
    let isFinal = false
    let finalAnswer: string | undefined

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (line.startsWith('Thought:')) {
        thought = line.slice('Thought:'.length).trim()
      } else if (line.startsWith('Final Answer:')) {
        isFinal = true
        finalAnswer = lines.slice(i).join('\n').slice('Final Answer:'.length).trim()
        break
      } else if (line.startsWith('Action:')) {
        action = line.slice('Action:'.length).trim()
      } else if (line.startsWith('Action Input:')) {
        const raw = line.slice('Action Input:'.length).trim()
        try {
          actionInput = JSON.parse(raw)
        } catch {
          actionInput = { input: raw }
        }
      }
    }

    return { thought, action, actionInput, isFinal, finalAnswer }
  }

  private buildSystemPrompt(agent: AgentDefinition, toolDescriptions: string): string {
    return `You are ${agent.role}.
Goal: ${agent.goal}
Backstory: ${agent.backstory}

You have access to the following tools:
${toolDescriptions}

Use the following format strictly:
Thought: your reasoning about what to do next
Action: the tool name to use (must be one of the available tools)
Action Input: {"param": "value"} (JSON object with tool parameters)
Observation: (this will be filled by the system with the tool result)
... (repeat Thought/Action/Observation as needed)
Thought: I now have enough information
Final Answer: your complete final answer to the task`
  }
}

// ── Factory ───────────────────────────────────────────────────────────────

/** Create a crew definition */
export function crew(definition: CrewDefinition): CrewDefinition {
  return definition
}
