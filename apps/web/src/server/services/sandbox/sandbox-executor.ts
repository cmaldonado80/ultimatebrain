/**
 * Sandbox Executor
 *
 * Intercepts tool dispatch, routes through sandbox with policy enforcement,
 * resource tracking, and audit logging. This is the main integration point
 * between the existing tool-executor and the sandbox system.
 *
 * Flow:
 *   executeTool() → SandboxExecutor.execute()
 *     → policy check (tool allowed?)
 *     → command audit (if applicable)
 *     → resource limit check
 *     → sandbox.execute() (with timeout + isolation)
 *     → audit log
 *     → feed outcome to cortex (adaptive tuning + degradation)
 */

import type { SandboxInstance, SandboxViolation } from './sandbox-manager'
import { SandboxManager } from './sandbox-manager'
import type { PolicyCheckResult, SandboxPolicy } from './sandbox-policy'
import { SandboxPolicyEngine } from './sandbox-policy'

// ── Types ────────────────────────────────────────────────────────────────

export interface ExecutionContext {
  agentId: string
  agentName: string
  workspaceId: string
  departmentDomain?: string
  orgRole?: string
  toolAccess: string[]
}

export interface SandboxedExecResult {
  output: string
  sandboxId: string
  durationMs: number
  policyChecks: PolicyCheckResult[]
  violations: SandboxViolation[]
  blocked: boolean
}

export interface ExecutorStats {
  totalExecutions: number
  blockedByPolicy: number
  blockedByResource: number
  timeouts: number
  crashes: number
  avgDurationMs: number
}

// ── Sandbox Executor ─────────────────────────────────────────────────────

export class SandboxExecutor {
  readonly manager: SandboxManager
  readonly policyEngine: SandboxPolicyEngine

  private stats = {
    totalExecutions: 0,
    blockedByPolicy: 0,
    blockedByResource: 0,
    timeouts: 0,
    crashes: 0,
    totalDurationMs: 0,
  }

  constructor() {
    this.manager = new SandboxManager()
    this.policyEngine = new SandboxPolicyEngine()
  }

  /**
   * Execute a tool call through the sandbox.
   *
   * @param ctx - Agent/workspace context
   * @param toolName - Tool to execute
   * @param toolInput - Tool parameters
   * @param executeFn - The actual tool implementation (from executeToolInner)
   */
  async execute(
    ctx: ExecutionContext,
    toolName: string,
    toolInput: Record<string, unknown>,
    executeFn: (name: string, input: Record<string, unknown>) => Promise<string>,
  ): Promise<SandboxedExecResult> {
    this.stats.totalExecutions++
    const policyChecks: PolicyCheckResult[] = []

    // 1. Generate/retrieve policy for this agent
    const policy = this.policyEngine.generatePolicy(
      ctx.agentId,
      ctx.agentName,
      ctx.departmentDomain,
    )

    // 2. Check if tool is allowed
    const toolCheck = this.policyEngine.checkTool(policy, toolName)
    policyChecks.push(toolCheck)
    if (!toolCheck.allowed) {
      this.stats.blockedByPolicy++
      return {
        output: JSON.stringify({
          error: 'policy_denied',
          message: toolCheck.reason,
          tool: toolName,
        }),
        sandboxId: '',
        durationMs: 0,
        policyChecks,
        violations: [],
        blocked: true,
      }
    }

    // 3. Check command-level policy (for tools that take commands/queries)
    const commandInput = extractCommand(toolName, toolInput)
    if (commandInput) {
      const cmdCheck = this.policyEngine.checkCommand(policy, commandInput)
      policyChecks.push(cmdCheck)
      if (!cmdCheck.allowed) {
        this.stats.blockedByPolicy++
        return {
          output: JSON.stringify({
            error: 'command_blocked',
            message: cmdCheck.reason,
            command: commandInput.slice(0, 100),
          }),
          sandboxId: '',
          durationMs: 0,
          policyChecks,
          violations: [],
          blocked: true,
        }
      }
    }

    // 4. Acquire sandbox
    this.manager.acquire({
      agentId: ctx.agentId,
      agentName: ctx.agentName,
      workspaceId: ctx.workspaceId,
      departmentId: ctx.departmentDomain,
      toolAccess: ctx.toolAccess,
      resourceLimits: {
        ...SandboxManager.limitsForRole(ctx.orgRole),
        ...policy.resourceOverrides,
      },
      env: {},
    })

    // 5. Execute through sandbox
    const result = await this.manager.execute(ctx.agentId, toolName, toolInput, executeFn)

    // 6. Track stats
    this.stats.totalDurationMs += result.durationMs
    for (const v of result.violations) {
      if (v.type === 'timeout') this.stats.timeouts++
      if (v.type === 'crash') this.stats.crashes++
      if (v.type === 'resource_limit') this.stats.blockedByResource++
    }

    return {
      output: result.output,
      sandboxId: result.sandboxId,
      durationMs: result.durationMs,
      policyChecks,
      violations: result.violations,
      blocked: false,
    }
  }

  /**
   * Get executor statistics.
   */
  getStats(): ExecutorStats {
    return {
      totalExecutions: this.stats.totalExecutions,
      blockedByPolicy: this.stats.blockedByPolicy,
      blockedByResource: this.stats.blockedByResource,
      timeouts: this.stats.timeouts,
      crashes: this.stats.crashes,
      avgDurationMs:
        this.stats.totalExecutions > 0
          ? this.stats.totalDurationMs / this.stats.totalExecutions
          : 0,
    }
  }

  /**
   * Get sandbox for a specific agent.
   */
  getAgentSandbox(agentId: string): SandboxInstance | undefined {
    return this.manager.getSandbox(agentId)
  }

  /**
   * Get policy for a specific agent.
   */
  getAgentPolicy(agentId: string): SandboxPolicy | undefined {
    return this.policyEngine.getPolicy(`policy_${agentId.slice(0, 8)}`)
  }

  /**
   * Destroy executor and release resources.
   */
  destroy() {
    this.manager.destroy()
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Extract a command/query string from tool input for policy checking.
 */
function extractCommand(toolName: string, input: Record<string, unknown>): string | null {
  // SQL tools
  if (toolName === 'db_query' || toolName === 'sql_query') {
    return (input.sql as string) ?? (input.query as string) ?? null
  }
  // Shell/exec tools
  if (toolName === 'shell_exec' || toolName === 'run_command') {
    return (input.command as string) ?? null
  }
  // Git operations
  if (toolName === 'git_operations') {
    return (input.command as string) ?? null
  }
  // File system
  if (toolName === 'file_system' || toolName === 'file_write') {
    const path = (input.path as string) ?? ''
    const op = (input.operation as string) ?? 'read'
    return `${op} ${path}`
  }
  return null
}
