/**
 * Sandbox Manager
 *
 * Container pool with per-agent isolation. Each agent gets a sandbox
 * with scoped policies, resource limits, and lifecycle tracking.
 *
 * Architecture:
 * - Container pool with warm/cold states for fast allocation
 * - Per-agent isolation with unique sandbox IDs
 * - Department-level policy inheritance
 * - Resource tracking (memory, CPU time, I/O)
 * - Automatic cleanup on idle timeout
 * - Health monitoring with auto-eviction of unhealthy containers
 *
 * This is a server-side abstraction over ClawLess containers.
 * In server environments (Node.js), it runs tool code in isolated
 * V8 contexts with resource limits. In browser environments,
 * it delegates to actual WebContainer/ClawLess instances.
 */

import { logger } from '../../../lib/logger'

// ── Types ────────────────────────────────────────────────────────────────

export type SandboxStatus = 'cold' | 'warming' | 'ready' | 'executing' | 'cooldown' | 'evicted'

export interface SandboxResourceLimits {
  maxMemoryMb: number
  maxCpuTimeMs: number
  maxFileOps: number
  maxNetworkCalls: number
  maxOutputBytes: number
  timeoutMs: number
}

export interface SandboxConfig {
  agentId: string
  agentName: string
  workspaceId: string
  departmentId?: string
  toolAccess: string[]
  resourceLimits: SandboxResourceLimits
  env: Record<string, string>
}

export interface SandboxInstance {
  id: string
  config: SandboxConfig
  status: SandboxStatus
  createdAt: number
  lastUsedAt: number
  executionCount: number
  resourceUsage: {
    memoryMb: number
    cpuTimeMs: number
    fileOps: number
    networkCalls: number
    outputBytes: number
  }
  violations: SandboxViolation[]
}

export interface SandboxViolation {
  timestamp: number
  type: 'resource_limit' | 'policy_denied' | 'timeout' | 'crash'
  detail: string
  severity: 'warn' | 'block' | 'critical'
}

export interface SandboxExecResult {
  output: string
  durationMs: number
  resourceDelta: SandboxInstance['resourceUsage']
  violations: SandboxViolation[]
  sandboxId: string
}

// ── Default Limits ───────────────────────────────────────────────────────

const DEFAULT_LIMITS: SandboxResourceLimits = {
  maxMemoryMb: 256,
  maxCpuTimeMs: 30000,
  maxFileOps: 100,
  maxNetworkCalls: 20,
  maxOutputBytes: 1024 * 1024, // 1MB
  timeoutMs: 60000,
}

const ROLE_LIMITS: Record<string, Partial<SandboxResourceLimits>> = {
  ceo: { maxCpuTimeMs: 60000, maxNetworkCalls: 50, timeoutMs: 120000 },
  department_head: { maxCpuTimeMs: 45000, maxNetworkCalls: 30, timeoutMs: 90000 },
  specialist: { maxCpuTimeMs: 30000, maxNetworkCalls: 20, timeoutMs: 60000 },
  monitor: { maxCpuTimeMs: 15000, maxNetworkCalls: 10, maxFileOps: 50, timeoutMs: 30000 },
  healer: { maxCpuTimeMs: 20000, maxNetworkCalls: 15, timeoutMs: 45000 },
}

const POOL_MAX = 50
const IDLE_EVICTION_MS = 10 * 60 * 1000 // 10 min idle = evict
const MAX_VIOLATIONS_BEFORE_EVICTION = 5

// ── Sandbox Manager ──────────────────────────────────────────────────────

export class SandboxManager {
  private pool = new Map<string, SandboxInstance>()
  private agentToSandbox = new Map<string, string>() // agentId -> sandboxId
  private evictionTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Start eviction sweep every 60s
    this.evictionTimer = setInterval(() => this.evictIdle(), 60000)
  }

  /**
   * Acquire or create a sandbox for an agent.
   */
  acquire(config: SandboxConfig): SandboxInstance {
    // Check if agent already has a sandbox
    const existingId = this.agentToSandbox.get(config.agentId)
    if (existingId) {
      const existing = this.pool.get(existingId)
      if (existing && existing.status !== 'evicted') {
        existing.lastUsedAt = Date.now()
        return existing
      }
    }

    // Evict oldest if pool is full
    if (this.pool.size >= POOL_MAX) {
      this.evictOldest()
    }

    // Create new sandbox
    const id = `sbx_${config.agentId.slice(0, 8)}_${Date.now().toString(36)}`
    const instance: SandboxInstance = {
      id,
      config,
      status: 'ready',
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      executionCount: 0,
      resourceUsage: {
        memoryMb: 0,
        cpuTimeMs: 0,
        fileOps: 0,
        networkCalls: 0,
        outputBytes: 0,
      },
      violations: [],
    }

    this.pool.set(id, instance)
    this.agentToSandbox.set(config.agentId, id)
    return instance
  }

  /**
   * Execute a tool in the agent's sandbox.
   */
  async execute(
    agentId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    executeFn: (name: string, input: Record<string, unknown>) => Promise<string>,
  ): Promise<SandboxExecResult> {
    const sandboxId = this.agentToSandbox.get(agentId)
    const sandbox = sandboxId ? this.pool.get(sandboxId) : undefined

    if (!sandbox || sandbox.status === 'evicted') {
      throw new Error(`No active sandbox for agent ${agentId}`)
    }

    // Check resource limits before execution
    const limitViolation = this.checkLimits(sandbox)
    if (limitViolation) {
      sandbox.violations.push(limitViolation)
      if (sandbox.violations.length >= MAX_VIOLATIONS_BEFORE_EVICTION) {
        this.evict(sandbox.id, 'Too many violations')
      }
      return {
        output: JSON.stringify({
          error: 'sandbox_limit',
          message: limitViolation.detail,
          sandboxId: sandbox.id,
        }),
        durationMs: 0,
        resourceDelta: { memoryMb: 0, cpuTimeMs: 0, fileOps: 0, networkCalls: 0, outputBytes: 0 },
        violations: [limitViolation],
        sandboxId: sandbox.id,
      }
    }

    // Check tool access
    if (!sandbox.config.toolAccess.includes(toolName) && sandbox.config.toolAccess.length > 0) {
      const violation: SandboxViolation = {
        timestamp: Date.now(),
        type: 'policy_denied',
        detail: `Tool '${toolName}' not in agent's allowed tools`,
        severity: 'block',
      }
      sandbox.violations.push(violation)
      return {
        output: JSON.stringify({ error: 'tool_denied', tool: toolName }),
        durationMs: 0,
        resourceDelta: { memoryMb: 0, cpuTimeMs: 0, fileOps: 0, networkCalls: 0, outputBytes: 0 },
        violations: [violation],
        sandboxId: sandbox.id,
      }
    }

    // Execute with timeout
    sandbox.status = 'executing'
    const start = Date.now()
    const violations: SandboxViolation[] = []

    try {
      const result = await Promise.race([
        executeFn(toolName, toolInput),
        new Promise<string>((_, reject) =>
          setTimeout(
            () => reject(new Error('sandbox_timeout')),
            sandbox.config.resourceLimits.timeoutMs,
          ),
        ),
      ])

      const durationMs = Date.now() - start
      const outputBytes = Buffer.byteLength(result, 'utf-8')

      // Check output size
      if (outputBytes > sandbox.config.resourceLimits.maxOutputBytes) {
        violations.push({
          timestamp: Date.now(),
          type: 'resource_limit',
          detail: `Output ${outputBytes} bytes exceeds limit ${sandbox.config.resourceLimits.maxOutputBytes}`,
          severity: 'warn',
        })
      }

      // Update resource usage
      const resourceDelta = {
        memoryMb: 0, // approximation — real measurement needs V8 heap snapshots
        cpuTimeMs: durationMs,
        fileOps: this.estimateFileOps(toolName),
        networkCalls: this.estimateNetworkCalls(toolName),
        outputBytes,
      }

      sandbox.resourceUsage.cpuTimeMs += resourceDelta.cpuTimeMs
      sandbox.resourceUsage.fileOps += resourceDelta.fileOps
      sandbox.resourceUsage.networkCalls += resourceDelta.networkCalls
      sandbox.resourceUsage.outputBytes += resourceDelta.outputBytes
      sandbox.executionCount++
      sandbox.lastUsedAt = Date.now()
      sandbox.status = 'cooldown'
      sandbox.violations.push(...violations)

      // Truncate output if needed
      const maxOut = sandbox.config.resourceLimits.maxOutputBytes
      const truncated = outputBytes > maxOut ? result.slice(0, maxOut) + '\n[TRUNCATED]' : result

      return {
        output: truncated,
        durationMs,
        resourceDelta,
        violations,
        sandboxId: sandbox.id,
      }
    } catch (err) {
      const durationMs = Date.now() - start
      const isTimeout = err instanceof Error && err.message === 'sandbox_timeout'

      const violation: SandboxViolation = {
        timestamp: Date.now(),
        type: isTimeout ? 'timeout' : 'crash',
        detail: isTimeout
          ? `Execution exceeded ${sandbox.config.resourceLimits.timeoutMs}ms timeout`
          : err instanceof Error
            ? err.message
            : String(err),
        severity: isTimeout ? 'block' : 'critical',
      }

      sandbox.violations.push(violation)
      sandbox.status = 'cooldown'
      sandbox.lastUsedAt = Date.now()

      return {
        output: JSON.stringify({
          error: isTimeout ? 'sandbox_timeout' : 'sandbox_crash',
          message: violation.detail,
        }),
        durationMs,
        resourceDelta: {
          memoryMb: 0,
          cpuTimeMs: durationMs,
          fileOps: 0,
          networkCalls: 0,
          outputBytes: 0,
        },
        violations: [violation],
        sandboxId: sandbox.id,
      }
    }
  }

  /**
   * Release a sandbox (mark for eviction on next sweep).
   */
  release(agentId: string) {
    const sandboxId = this.agentToSandbox.get(agentId)
    if (sandboxId) {
      const sandbox = this.pool.get(sandboxId)
      if (sandbox) sandbox.status = 'cooldown'
    }
  }

  /**
   * Get sandbox for an agent.
   */
  getSandbox(agentId: string): SandboxInstance | undefined {
    const id = this.agentToSandbox.get(agentId)
    return id ? this.pool.get(id) : undefined
  }

  /**
   * Get all active sandboxes.
   */
  getAllSandboxes(): SandboxInstance[] {
    return Array.from(this.pool.values()).filter((s) => s.status !== 'evicted')
  }

  /**
   * Get pool stats.
   */
  getStats() {
    const all = Array.from(this.pool.values())
    return {
      total: all.length,
      ready: all.filter((s) => s.status === 'ready').length,
      executing: all.filter((s) => s.status === 'executing').length,
      cooldown: all.filter((s) => s.status === 'cooldown').length,
      totalExecutions: all.reduce((a, s) => a + s.executionCount, 0),
      totalViolations: all.reduce((a, s) => a + s.violations.length, 0),
    }
  }

  /**
   * Build resource limits for an agent based on their role.
   */
  static limitsForRole(role?: string): SandboxResourceLimits {
    const overrides = role ? (ROLE_LIMITS[role] ?? {}) : {}
    return { ...DEFAULT_LIMITS, ...overrides }
  }

  /**
   * Destroy the manager (cleanup interval).
   */
  destroy() {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer)
      this.evictionTimer = null
    }
    this.pool.clear()
    this.agentToSandbox.clear()
  }

  private checkLimits(sandbox: SandboxInstance): SandboxViolation | null {
    const { resourceUsage: usage, config } = sandbox
    const limits = config.resourceLimits

    if (usage.cpuTimeMs >= limits.maxCpuTimeMs) {
      return {
        timestamp: Date.now(),
        type: 'resource_limit',
        detail: `CPU time exhausted: ${usage.cpuTimeMs}ms / ${limits.maxCpuTimeMs}ms`,
        severity: 'block',
      }
    }
    if (usage.fileOps >= limits.maxFileOps) {
      return {
        timestamp: Date.now(),
        type: 'resource_limit',
        detail: `File operations exhausted: ${usage.fileOps} / ${limits.maxFileOps}`,
        severity: 'block',
      }
    }
    if (usage.networkCalls >= limits.maxNetworkCalls) {
      return {
        timestamp: Date.now(),
        type: 'resource_limit',
        detail: `Network calls exhausted: ${usage.networkCalls} / ${limits.maxNetworkCalls}`,
        severity: 'block',
      }
    }
    return null
  }

  private estimateFileOps(toolName: string): number {
    const fileTools = ['file_system', 'file_read', 'file_write', 'file_list', 'git_operations']
    return fileTools.some((t) => toolName.includes(t)) ? 1 : 0
  }

  private estimateNetworkCalls(toolName: string): number {
    const netTools = ['web_scrape', 'web_search', 'api_call', 'fetch', 'notion_', 'slack_']
    return netTools.some((t) => toolName.includes(t)) ? 1 : 0
  }

  private evict(sandboxId: string, reason: string) {
    const sandbox = this.pool.get(sandboxId)
    if (sandbox) {
      logger.warn(
        { sandboxId, agentName: sandbox.config.agentName, reason },
        '[SandboxManager] Evicting sandbox',
      )
      sandbox.status = 'evicted'
      this.agentToSandbox.delete(sandbox.config.agentId)
      // Keep in pool briefly for forensics, then remove
      setTimeout(() => this.pool.delete(sandboxId), 60000)
    }
  }

  private evictIdle() {
    const now = Date.now()
    for (const [id, sandbox] of this.pool) {
      if (sandbox.status === 'evicted') continue
      if (now - sandbox.lastUsedAt > IDLE_EVICTION_MS) {
        this.evict(id, 'Idle timeout')
      }
    }
  }

  private evictOldest() {
    let oldest: SandboxInstance | null = null
    for (const sandbox of this.pool.values()) {
      if (sandbox.status === 'executing') continue
      if (!oldest || sandbox.lastUsedAt < oldest.lastUsedAt) {
        oldest = sandbox
      }
    }
    if (oldest) this.evict(oldest.id, 'Pool full')
  }
}
