/**
 * Sandbox Orchestrator
 *
 * Multi-container coordination for the AI Corporation OS.
 * Manages cross-department tool delegation, shared resource pools,
 * and department-level sandbox isolation.
 *
 * Architecture:
 * - Each department gets an isolated sandbox namespace
 * - Cross-department delegation requires explicit approval
 * - Resource quotas enforced at department level
 * - Centralized audit across all sandboxes
 */

import type { SandboxAuditEntry } from './sandbox-audit-bridge'
import { SandboxAuditBridge } from './sandbox-audit-bridge'
import type { ExecutionContext, SandboxedExecResult } from './sandbox-executor'
import { SandboxExecutor } from './sandbox-executor'

// ── Types ────────────────────────────────────────────────────────────────

export interface DepartmentQuota {
  departmentId: string
  maxConcurrentSandboxes: number
  maxTotalExecutionsPerHour: number
  currentSandboxes: number
  currentExecutionsThisHour: number
  hourStartedAt: number
}

export interface DelegationRequest {
  fromAgentId: string
  fromDepartment: string
  toAgentId: string
  toDepartment: string
  toolName: string
  toolInput: Record<string, unknown>
  reason: string
}

export interface DelegationResult {
  approved: boolean
  result?: SandboxedExecResult
  reason: string
}

export interface OrchestratorStatus {
  departments: DepartmentQuota[]
  executor: ReturnType<typeof SandboxExecutor.prototype.getStats>
  audit: ReturnType<typeof SandboxAuditBridge.prototype.getSummary>
  poolStats: ReturnType<typeof SandboxExecutor.prototype.manager.getStats>
}

// ── Configuration ────────────────────────────────────────────────────────

const DEFAULT_DEPT_QUOTA: Omit<DepartmentQuota, 'departmentId'> = {
  maxConcurrentSandboxes: 10,
  maxTotalExecutionsPerHour: 500,
  currentSandboxes: 0,
  currentExecutionsThisHour: 0,
  hourStartedAt: Date.now(),
}

// Tools that are never allowed in cross-department delegation
const DELEGATION_BLOCKED_TOOLS = new Set([
  'db_query',
  'docker_manage',
  'shell_exec',
  'file_write',
  'git_operations',
])

// ── Sandbox Orchestrator ─────────────────────────────────────────────────

export class SandboxOrchestrator {
  readonly executor: SandboxExecutor
  readonly audit: SandboxAuditBridge
  private quotas = new Map<string, DepartmentQuota>()

  constructor() {
    this.executor = new SandboxExecutor()
    this.audit = new SandboxAuditBridge()
  }

  /**
   * Execute a tool call with full orchestration.
   */
  async execute(
    ctx: ExecutionContext,
    toolName: string,
    toolInput: Record<string, unknown>,
    executeFn: (name: string, input: Record<string, unknown>) => Promise<string>,
  ): Promise<SandboxedExecResult> {
    // Check department quota
    if (ctx.departmentDomain) {
      const quotaCheck = this.checkQuota(ctx.departmentDomain)
      if (!quotaCheck.allowed) {
        return {
          output: JSON.stringify({
            error: 'department_quota_exceeded',
            message: quotaCheck.reason,
          }),
          sandboxId: '',
          durationMs: 0,
          policyChecks: [],
          violations: [],
          blocked: true,
        }
      }
    }

    // Execute through sandbox
    const result = await this.executor.execute(ctx, toolName, toolInput, executeFn)

    // Record audit
    const auditEntry: SandboxAuditEntry = {
      timestamp: Date.now(),
      sandboxId: result.sandboxId,
      agentId: ctx.agentId,
      agentName: ctx.agentName,
      toolName,
      durationMs: result.durationMs,
      success: !result.blocked && result.violations.length === 0,
      policyVerdict: result.blocked ? 'block' : result.violations.length > 0 ? 'warn' : 'pass',
      violations: result.violations,
      policyChecks: result.policyChecks,
      outputSizeBytes: Buffer.byteLength(result.output, 'utf-8'),
    }
    this.audit.record(auditEntry)

    // Track department quota
    if (ctx.departmentDomain) {
      this.incrementQuota(ctx.departmentDomain)
    }

    return result
  }

  /**
   * Handle cross-department tool delegation.
   */
  async delegate(
    request: DelegationRequest,
    executeFn: (name: string, input: Record<string, unknown>) => Promise<string>,
  ): Promise<DelegationResult> {
    // Block dangerous tools in cross-department delegation
    if (DELEGATION_BLOCKED_TOOLS.has(request.toolName)) {
      return {
        approved: false,
        reason: `Tool '${request.toolName}' cannot be delegated across departments`,
      }
    }

    // Check source department quota
    const quotaCheck = this.checkQuota(request.fromDepartment)
    if (!quotaCheck.allowed) {
      return {
        approved: false,
        reason: `Source department quota exceeded: ${quotaCheck.reason}`,
      }
    }

    // Execute in target department's context
    const ctx: ExecutionContext = {
      agentId: request.toAgentId,
      agentName: `delegated:${request.fromAgentId.slice(0, 8)}`,
      workspaceId: request.toDepartment,
      departmentDomain: request.toDepartment,
      toolAccess: [request.toolName], // only the delegated tool
    }

    const result = await this.execute(ctx, request.toolName, request.toolInput, executeFn)

    return {
      approved: !result.blocked,
      result,
      reason: result.blocked ? 'Blocked by target department policy' : 'Delegation successful',
    }
  }

  /**
   * Set custom quota for a department.
   */
  setQuota(departmentId: string, quota: Partial<DepartmentQuota>) {
    const existing = this.quotas.get(departmentId) ?? {
      departmentId,
      ...DEFAULT_DEPT_QUOTA,
    }
    this.quotas.set(departmentId, { ...existing, ...quota, departmentId })
  }

  /**
   * Get full orchestrator status.
   */
  getStatus(): OrchestratorStatus {
    return {
      departments: Array.from(this.quotas.values()),
      executor: this.executor.getStats(),
      audit: this.audit.getSummary(),
      poolStats: this.executor.manager.getStats(),
    }
  }

  /**
   * Get audit bridge (for direct queries).
   */
  getAudit(): SandboxAuditBridge {
    return this.audit
  }

  /**
   * Destroy orchestrator and release resources.
   */
  destroy() {
    this.executor.destroy()
  }

  private checkQuota(departmentId: string): { allowed: boolean; reason: string } {
    const quota = this.quotas.get(departmentId) ?? {
      departmentId,
      ...DEFAULT_DEPT_QUOTA,
    }

    // Reset hourly counter if needed
    const now = Date.now()
    if (now - quota.hourStartedAt > 60 * 60 * 1000) {
      quota.currentExecutionsThisHour = 0
      quota.hourStartedAt = now
    }

    if (quota.currentExecutionsThisHour >= quota.maxTotalExecutionsPerHour) {
      return {
        allowed: false,
        reason: `Hourly execution limit (${quota.maxTotalExecutionsPerHour}) reached`,
      }
    }

    // Save updated quota
    this.quotas.set(departmentId, quota)
    return { allowed: true, reason: '' }
  }

  private incrementQuota(departmentId: string) {
    const quota = this.quotas.get(departmentId)
    if (quota) {
      quota.currentExecutionsThisHour++
    }
  }
}
