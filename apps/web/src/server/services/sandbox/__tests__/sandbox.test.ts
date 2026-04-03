import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SandboxAuditBridge } from '../sandbox-audit-bridge'
import { SandboxExecutor } from '../sandbox-executor'
import { SandboxManager } from '../sandbox-manager'
import { SandboxOrchestrator } from '../sandbox-orchestrator'
import { SandboxPolicyEngine } from '../sandbox-policy'

// ── Mock healing imports ─────────────────────────────────────────────────

vi.mock('../../healing/index', () => ({
  getCortex: () => null,
}))

vi.mock('../../orchestration/event-bus', () => ({
  eventBus: { emit: vi.fn().mockResolvedValue(undefined) },
}))

// ── SandboxManager Tests ─────────────────────────────────────────────────

describe('SandboxManager', () => {
  let manager: SandboxManager

  beforeEach(() => {
    manager = new SandboxManager()
  })

  afterEach(() => {
    manager.destroy()
  })

  const baseConfig = {
    agentId: 'agent-1',
    agentName: 'Agent 1',
    workspaceId: 'ws-1',
    toolAccess: ['web_search', 'memory_search'],
    resourceLimits: SandboxManager.limitsForRole('specialist'),
    env: {},
  }

  it('should create a sandbox on acquire', () => {
    const sandbox = manager.acquire(baseConfig)
    expect(sandbox.id).toMatch(/^sbx_/)
    expect(sandbox.status).toBe('ready')
    expect(sandbox.config.agentId).toBe('agent-1')
  })

  it('should return existing sandbox for same agent', () => {
    const first = manager.acquire(baseConfig)
    const second = manager.acquire(baseConfig)
    expect(first.id).toBe(second.id)
  })

  it('should execute tools through sandbox', async () => {
    manager.acquire(baseConfig)
    const result = await manager.execute(
      'agent-1',
      'web_search',
      { query: 'test' },
      async () => '{"results": []}',
    )
    expect(result.output).toBe('{"results": []}')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('should block tools not in toolAccess', async () => {
    manager.acquire(baseConfig)
    const result = await manager.execute(
      'agent-1',
      'docker_manage',
      {},
      async () => 'should not run',
    )
    expect(result.output).toContain('tool_denied')
    expect(result.violations).toHaveLength(1)
  })

  it('should handle execution timeout', async () => {
    const config = {
      ...baseConfig,
      resourceLimits: { ...baseConfig.resourceLimits, timeoutMs: 50 },
    }
    manager.acquire(config)
    const result = await manager.execute(
      'agent-1',
      'web_search',
      {},
      () => new Promise((r) => setTimeout(() => r('late'), 200)),
    )
    expect(result.output).toContain('sandbox_timeout')
    expect(result.violations.some((v) => v.type === 'timeout')).toBe(true)
  })

  it('should track resource usage across executions', async () => {
    manager.acquire(baseConfig)
    await manager.execute('agent-1', 'web_search', {}, async () => 'result1')
    await manager.execute('agent-1', 'web_search', {}, async () => 'result2')

    const sandbox = manager.getSandbox('agent-1')
    expect(sandbox!.executionCount).toBe(2)
    expect(sandbox!.resourceUsage.cpuTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('should provide pool stats', () => {
    manager.acquire(baseConfig)
    const stats = manager.getStats()
    expect(stats.total).toBe(1)
    expect(stats.ready).toBe(1)
  })

  it('should return role-based limits', () => {
    const ceoLimits = SandboxManager.limitsForRole('ceo')
    const specialistLimits = SandboxManager.limitsForRole('specialist')
    expect(ceoLimits.maxCpuTimeMs).toBeGreaterThan(specialistLimits.maxCpuTimeMs)
    expect(ceoLimits.timeoutMs).toBeGreaterThan(specialistLimits.timeoutMs)
  })
})

// ── SandboxPolicyEngine Tests ────────────────────────────────────────────

describe('SandboxPolicyEngine', () => {
  let engine: SandboxPolicyEngine

  beforeEach(() => {
    engine = new SandboxPolicyEngine()
  })

  it('should generate policy with org defaults', () => {
    const policy = engine.generatePolicy('agent-1', 'Agent 1')
    expect(policy.id).toMatch(/^policy_/)
    expect(policy.deniedTools).toContain('docker_manage')
    expect(policy.deniedTools).toContain('shell_exec')
  })

  it('should layer department overrides', () => {
    const engPolicy = engine.generatePolicy('agent-1', 'Agent 1', 'engineering')
    // Engineering inherits org-level denied tools (most restrictive wins)
    expect(engPolicy.deniedTools).toContain('docker_manage')
    expect(engPolicy.resourceOverrides.maxCpuTimeMs).toBe(60000)
  })

  it('should block denied tools', () => {
    const policy = engine.generatePolicy('agent-1', 'Agent 1')
    const check = engine.checkTool(policy, 'docker_manage')
    expect(check.allowed).toBe(false)
    expect(check.verdict).toBe('block')
  })

  it('should allow non-denied tools', () => {
    const policy = engine.generatePolicy('agent-1', 'Agent 1')
    const check = engine.checkTool(policy, 'web_search')
    expect(check.allowed).toBe(true)
  })

  it('should block dangerous commands', () => {
    const policy = engine.generatePolicy('agent-1', 'Agent 1')
    const check = engine.checkCommand(policy, 'rm -rf /')
    expect(check.allowed).toBe(false)
    expect(check.verdict).toBe('block')
  })

  it('should pass safe commands', () => {
    const policy = engine.generatePolicy('agent-1', 'Agent 1')
    const check = engine.checkCommand(policy, 'SELECT * FROM users WHERE id = 1')
    expect(check.allowed).toBe(true)
  })

  it('should block denied domains', () => {
    const policy = engine.generatePolicy('agent-1', 'Agent 1', 'healthcare')
    const check = engine.checkDomain(policy, 'example.dating')
    expect(check.allowed).toBe(false)
  })

  it('should allow non-denied domains', () => {
    const policy = engine.generatePolicy('agent-1', 'Agent 1')
    const check = engine.checkDomain(policy, 'api.example.com')
    expect(check.allowed).toBe(true)
  })
})

// ── SandboxExecutor Tests ────────────────────────────────────────────────

describe('SandboxExecutor', () => {
  let executor: SandboxExecutor

  beforeEach(() => {
    executor = new SandboxExecutor()
  })

  afterEach(() => {
    executor.destroy()
  })

  const ctx = {
    agentId: 'agent-1',
    agentName: 'Agent 1',
    workspaceId: 'ws-1',
    departmentDomain: 'engineering',
    orgRole: 'specialist',
    toolAccess: ['web_search', 'memory_search'],
  }

  it('should execute tools through policy + sandbox', async () => {
    const result = await executor.execute(
      ctx,
      'web_search',
      { query: 'test' },
      async () => '{"results": []}',
    )
    expect(result.blocked).toBe(false)
    expect(result.output).toBe('{"results": []}')
    expect(result.policyChecks.length).toBeGreaterThan(0)
  })

  it('should block tools denied by policy', async () => {
    const marketingCtx = { ...ctx, departmentDomain: 'marketing' }
    const result = await executor.execute(
      marketingCtx,
      'docker_manage',
      {},
      async () => 'should not run',
    )
    expect(result.blocked).toBe(true)
    expect(result.output).toContain('policy_denied')
  })

  it('should block dangerous commands', async () => {
    const result = await executor.execute(
      ctx,
      'db_query',
      { sql: 'DROP TABLE users' },
      async () => 'should not run',
    )
    expect(result.blocked).toBe(true)
    expect(result.output).toContain('command_blocked')
  })

  it('should track stats', async () => {
    await executor.execute(ctx, 'web_search', {}, async () => 'ok')
    await executor.execute(
      { ...ctx, departmentDomain: 'marketing' },
      'docker_manage',
      {},
      async () => 'blocked',
    )

    const stats = executor.getStats()
    expect(stats.totalExecutions).toBe(2)
    expect(stats.blockedByPolicy).toBe(1)
  })
})

// ── SandboxAuditBridge Tests ─────────────────────────────────────────────

describe('SandboxAuditBridge', () => {
  let bridge: SandboxAuditBridge

  beforeEach(() => {
    bridge = new SandboxAuditBridge()
  })

  it('should record audit entries', () => {
    bridge.record({
      timestamp: Date.now(),
      sandboxId: 'sbx-1',
      agentId: 'agent-1',
      agentName: 'Agent 1',
      toolName: 'web_search',
      durationMs: 100,
      success: true,
      policyVerdict: 'pass',
      violations: [],
      policyChecks: [],
      outputSizeBytes: 50,
    })

    const entries = bridge.getRecentEntries()
    expect(entries).toHaveLength(1)
  })

  it('should generate summary', () => {
    // Add some entries
    for (let i = 0; i < 5; i++) {
      bridge.record({
        timestamp: Date.now(),
        sandboxId: 'sbx-1',
        agentId: 'agent-1',
        agentName: 'Agent 1',
        toolName: 'web_search',
        durationMs: 100,
        success: true,
        policyVerdict: 'pass',
        violations: [],
        policyChecks: [],
        outputSizeBytes: 50,
      })
    }

    // Add a blocked entry
    bridge.record({
      timestamp: Date.now(),
      sandboxId: '',
      agentId: 'agent-2',
      agentName: 'Agent 2',
      toolName: 'docker_manage',
      durationMs: 0,
      success: false,
      policyVerdict: 'block',
      violations: [],
      policyChecks: [],
      outputSizeBytes: 0,
    })

    const summary = bridge.getSummary()
    expect(summary.totalEntries).toBe(6)
    expect(summary.policyBlocks).toBe(1)
    expect(summary.successRate).toBeCloseTo(5 / 6, 2)
  })

  it('should filter by agent', () => {
    bridge.record({
      timestamp: Date.now(),
      sandboxId: 'sbx-1',
      agentId: 'agent-1',
      agentName: 'Agent 1',
      toolName: 'web_search',
      durationMs: 100,
      success: true,
      policyVerdict: 'pass',
      violations: [],
      policyChecks: [],
      outputSizeBytes: 50,
    })
    bridge.record({
      timestamp: Date.now(),
      sandboxId: 'sbx-2',
      agentId: 'agent-2',
      agentName: 'Agent 2',
      toolName: 'web_search',
      durationMs: 100,
      success: true,
      policyVerdict: 'pass',
      violations: [],
      policyChecks: [],
      outputSizeBytes: 50,
    })

    expect(bridge.getAgentEntries('agent-1')).toHaveLength(1)
    expect(bridge.getAgentEntries('agent-2')).toHaveLength(1)
  })
})

// ── SandboxOrchestrator Tests ────────────────────────────────────────────

describe('SandboxOrchestrator', () => {
  let orchestrator: SandboxOrchestrator

  beforeEach(() => {
    orchestrator = new SandboxOrchestrator()
  })

  afterEach(() => {
    orchestrator.destroy()
  })

  const ctx = {
    agentId: 'agent-1',
    agentName: 'Agent 1',
    workspaceId: 'ws-1',
    departmentDomain: 'engineering',
    orgRole: 'specialist',
    toolAccess: ['web_search'],
  }

  it('should execute tools and record audit', async () => {
    const result = await orchestrator.execute(
      ctx,
      'web_search',
      { query: 'test' },
      async () => '{"results": []}',
    )
    expect(result.blocked).toBe(false)

    const summary = orchestrator.getAudit().getSummary()
    expect(summary.totalEntries).toBe(1)
  })

  it('should enforce department quotas', async () => {
    orchestrator.setQuota('engineering', { maxTotalExecutionsPerHour: 2 })

    await orchestrator.execute(ctx, 'web_search', {}, async () => 'ok')
    await orchestrator.execute(ctx, 'web_search', {}, async () => 'ok')
    const third = await orchestrator.execute(ctx, 'web_search', {}, async () => 'should block')

    expect(third.blocked).toBe(true)
    expect(third.output).toContain('department_quota_exceeded')
  })

  it('should block dangerous tools in cross-department delegation', async () => {
    const result = await orchestrator.delegate(
      {
        fromAgentId: 'agent-1',
        fromDepartment: 'engineering',
        toAgentId: 'agent-2',
        toDepartment: 'marketing',
        toolName: 'db_query',
        toolInput: { sql: 'SELECT 1' },
        reason: 'Need data',
      },
      async () => 'should not run',
    )
    expect(result.approved).toBe(false)
    expect(result.reason).toContain('cannot be delegated')
  })

  it('should allow safe tools in cross-department delegation', async () => {
    const result = await orchestrator.delegate(
      {
        fromAgentId: 'agent-1',
        fromDepartment: 'engineering',
        toAgentId: 'agent-2',
        toDepartment: 'marketing',
        toolName: 'web_search',
        toolInput: { query: 'test' },
        reason: 'Research',
      },
      async () => '{"results": []}',
    )
    expect(result.approved).toBe(true)
  })

  it('should provide full status', () => {
    const status = orchestrator.getStatus()
    expect(status).toHaveProperty('departments')
    expect(status).toHaveProperty('executor')
    expect(status).toHaveProperty('audit')
    expect(status).toHaveProperty('poolStats')
  })
})

// Need afterEach import
import { afterEach } from 'vitest'
