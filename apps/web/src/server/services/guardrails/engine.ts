/**
 * Guardrail Engine: runs content through configured rules by layer,
 * logs violations to guardrail_logs, and optionally sanitizes content.
 */

import type { Database } from '@solarc/db'
import { guardrailLogs } from '@solarc/db'
import type { GuardrailCheckOutput } from '@solarc/engine-contracts'

import { logger } from '../../../lib/logger'
import { BUILTIN_RULES, type GuardrailLayer, type GuardrailRule, type Violation } from './rules'

export interface GuardrailEngineConfig {
  /** Block request on critical violations (default: true) */
  blockOnCritical: boolean
  /** Auto-sanitize content when possible (default: false) */
  autoSanitize: boolean
  /** Custom rules to add on top of built-ins */
  customRules: GuardrailRule[]
  /** Rules to disable by name */
  disabledRules: Set<string>
}

const DEFAULT_CONFIG: GuardrailEngineConfig = {
  blockOnCritical: true,
  autoSanitize: false,
  customRules: [],
  disabledRules: new Set(),
}

export class GuardrailEngine {
  private rules: GuardrailRule[]
  private config: GuardrailEngineConfig

  constructor(
    private db: Database,
    config?: Partial<GuardrailEngineConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.rules = [...BUILTIN_RULES, ...this.config.customRules].filter(
      (r) => !this.config.disabledRules.has(r.name),
    )
  }

  /** Register a custom rule at runtime */
  addRule(rule: GuardrailRule): void {
    this.rules.push(rule)
  }

  /**
   * Check content against all rules for a given layer.
   * Returns pass/fail with violations and optional sanitized content.
   */
  async check(
    content: string,
    layer: GuardrailLayer,
    options?: { agentId?: string; ticketId?: string; policies?: string[] },
  ): Promise<GuardrailCheckOutput> {
    const ctx = { agentId: options?.agentId, ticketId: options?.ticketId, layer }

    // Filter rules to those matching this layer (and optional policy filter)
    let activeRules = this.rules.filter((r) => r.layers.includes(layer))
    if (options?.policies && options.policies.length > 0) {
      const policySet = new Set(options.policies)
      activeRules = activeRules.filter((r) => policySet.has(r.name))
    }

    // Collect violations from all rules
    const violations: Violation[] = []
    for (const rule of activeRules) {
      const ruleViolations = rule.check(content, ctx)
      violations.push(...ruleViolations)
    }

    // Log violations to DB (fire-and-forget)
    this.logViolations(violations, layer, options?.agentId, options?.ticketId).catch((err) => {
      logger.error(
        { err: err instanceof Error ? err : undefined },
        '[Guardrails] Failed to log violations',
      )
    })

    const hasCritical = violations.some((v) => v.severity === 'critical')
    const passed = this.config.blockOnCritical ? !hasCritical : true

    // Sanitize if configured and rules support it
    let modifiedContent: string | undefined
    if (this.config.autoSanitize && violations.length > 0) {
      // Create a copy to avoid mutating the original content
      let sanitized = String(content)
      for (const rule of activeRules) {
        if (rule.sanitize) {
          sanitized = rule.sanitize(sanitized, ctx)
        }
      }
      // Only include if actually different
      modifiedContent = sanitized !== content ? sanitized : undefined
    }

    return { passed, violations, modifiedContent }
  }

  /**
   * Convenience: check input layer (pre-LLM call)
   */
  async checkInput(
    content: string,
    options?: { agentId?: string; ticketId?: string },
  ): Promise<GuardrailCheckOutput> {
    return this.check(content, 'input', options)
  }

  /**
   * Convenience: check output layer (post-LLM call)
   */
  async checkOutput(
    content: string,
    options?: { agentId?: string; ticketId?: string },
  ): Promise<GuardrailCheckOutput> {
    return this.check(content, 'output', options)
  }

  /**
   * Convenience: check tool layer (before tool execution)
   */
  async checkTool(
    toolCallJson: string,
    options?: { agentId?: string; ticketId?: string },
  ): Promise<GuardrailCheckOutput> {
    return this.check(toolCallJson, 'tool', options)
  }

  /** Persist violations to guardrail_logs */
  private async logViolations(
    violations: Violation[],
    layer: GuardrailLayer,
    agentId?: string,
    ticketId?: string,
  ): Promise<void> {
    if (violations.length === 0) return

    const rows = violations.map((v) => ({
      layer: layer as 'input' | 'tool' | 'output',
      agentId,
      ticketId,
      ruleName: v.rule,
      passed: v.severity !== 'critical',
      violationDetail: v.detail,
    }))

    await this.db.insert(guardrailLogs).values(rows)
  }

  /**
   * Wrap an OpenClaw skill/MCP tool invocation with guardrail checks.
   * Runs tool-layer check before invocation and output-layer check after.
   */
  async wrapToolCall(
    toolName: string,
    params: Record<string, unknown>,
    invoke: () => Promise<unknown>,
    context?: { agentId?: string; ticketId?: string },
  ): Promise<{ result: unknown; violations: Violation[] }> {
    const allViolations: Violation[] = []

    // Pre-flight: check tool call
    const inputCheck = await this.checkTool(JSON.stringify({ tool: toolName, params }), {
      agentId: context?.agentId,
      ticketId: context?.ticketId,
    })
    allViolations.push(...inputCheck.violations)
    if (!inputCheck.passed) {
      throw new Error(
        `Guardrail blocked tool "${toolName}": ${inputCheck.violations.map((v) => v.detail).join(', ')}`,
      )
    }

    // Execute the tool
    const result = await invoke()

    // Post-flight: check output
    const outputStr = typeof result === 'string' ? result : JSON.stringify(result)
    const outputCheck = await this.checkOutput(outputStr, {
      agentId: context?.agentId,
      ticketId: context?.ticketId,
    })
    allViolations.push(...outputCheck.violations)

    return { result: outputCheck.modifiedContent ?? result, violations: allViolations }
  }

  /** Get all registered rule names */
  listRules(): Array<{ name: string; layers: GuardrailLayer[] }> {
    return this.rules.map((r) => ({ name: r.name, layers: r.layers }))
  }
}
