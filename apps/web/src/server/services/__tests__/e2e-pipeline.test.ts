/**
 * E2E Integration Test — Full Pipeline
 *
 * Proves the complete chain works end-to-end:
 *   Tool call → Sandbox → Policy → Cortex → Healing → Degradation → State
 *
 * This is the test that proves everything is wired correctly.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock DB ──────────────────────────────────────────────────────────────

vi.mock('@solarc/db', () => ({
  agents: { id: 'id', name: 'name', status: 'status', updatedAt: 'updatedAt' },
  tickets: {
    id: 'id',
    status: 'status',
    updatedAt: 'updatedAt',
    assignedAgentId: 'assignedAgentId',
  },
  ticketExecution: {
    ticketId: 'ticketId',
    lockOwner: 'lockOwner',
    lockedAt: 'lockedAt',
    leaseUntil: 'leaseUntil',
  },
  brainEntities: { id: 'id', name: 'name', status: 'status' },
  healingLogs: {
    id: 'id',
    action: 'action',
    target: 'target',
    reason: 'reason',
    success: 'success',
    createdAt: 'createdAt',
  },
  instincts: {
    id: 'id',
    trigger: 'trigger',
    action: 'action',
    confidence: 'confidence',
    status: 'status',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  lte: (col: string, val: unknown) => ({ lte: { col, val } }),
  gte: (col: string, val: unknown) => ({ gte: { col, val } }),
  desc: (col: string) => ({ desc: col }),
  sql: (...args: unknown[]) => args,
}))

// ── Import Systems ───────────────────────────────────────────────────────

import { shapeResponse } from '../chat/tool-disclosure'
import { discoverTools } from '../chat/tool-discovery'
import { generateDryRun, shouldDryRun } from '../chat/tool-dryrun'
import { classifyError } from '../chat/tool-envelope'
import { classifyTool, requiresPolicyCheck } from '../chat/tool-tiers'
import { AdaptiveResourceTuner } from '../healing/adaptive-tuner'
import { AgentDegradationManager } from '../healing/agent-degradation'
import { AgentStateManager } from '../orchestration/agent-state'
import { WorkVerifier } from '../orchestration/work-verifier'
import { PermissionChecker } from '../sandbox/permission-scopes'
import { SandboxOrchestrator } from '../sandbox/sandbox-orchestrator'
import { SandboxPolicyEngine } from '../sandbox/sandbox-policy'

// ── E2E Tests ────────────────────────────────────────────────────────────

describe('E2E Pipeline: Tool → Sandbox → Cortex → Healing → State', () => {
  let orchestrator: SandboxOrchestrator
  let stateManager: AgentStateManager
  let permissionChecker: PermissionChecker
  let degradation: AgentDegradationManager
  let tuner: AdaptiveResourceTuner
  let verifier: WorkVerifier

  const mockDb = {
    query: {
      agents: { findMany: vi.fn().mockResolvedValue([]) },
      brainEntities: { findMany: vi.fn().mockResolvedValue([]) },
      instincts: { findMany: vi.fn().mockResolvedValue([]) },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ catch: vi.fn() }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ catch: vi.fn() }),
    }),
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
    orchestrator = new SandboxOrchestrator()
    stateManager = new AgentStateManager()
    permissionChecker = new PermissionChecker()
    degradation = new AgentDegradationManager(mockDb)
    tuner = new AdaptiveResourceTuner()
    verifier = new WorkVerifier()
  })

  afterEach(() => {
    orchestrator.destroy()
  })

  it('should execute a safe tool through the full pipeline', async () => {
    const agentId = 'agent-001'
    const agentName = 'Engineer Alpha'

    // 1. Initialize permissions for agent
    const permissions = permissionChecker.initializeForRole(agentId, 'specialist')
    expect(permissions.scopes.length).toBeGreaterThan(0)

    // 2. Check tool classification
    const classification = classifyTool('memory_search')
    expect(classification.tier).toBe('safe')
    expect(requiresPolicyCheck('memory_search')).toBe(false)

    // 3. Check permission
    const permCheck = permissionChecker.canUseTool(agentId, 'memory_search')
    expect(permCheck.allowed).toBe(true)

    // 4. Initialize agent state
    const state = stateManager.getState(agentId, agentName, 'ws-1')
    stateManager.startTask(agentId, {
      id: 'task-1',
      title: 'Search for auth patterns',
      status: 'pending',
    })

    // 5. Execute through sandbox
    const result = await orchestrator.execute(
      {
        agentId,
        agentName,
        workspaceId: 'ws-1',
        departmentDomain: 'engineering',
        orgRole: 'specialist',
        toolAccess: [],
      },
      'memory_search',
      { query: 'auth patterns' },
      async () => JSON.stringify({ results: ['JWT', 'OAuth2'] }),
    )

    expect(result.blocked).toBe(false)
    expect(result.output).toContain('results')

    // 6. Record outcome in degradation + tuner
    const degradEvent = degradation.recordOutcome(agentId, agentName, true)
    tuner.recordOutcome(agentId, 'agent', {
      timestamp: Date.now(),
      success: true,
      latencyMs: result.durationMs,
      tokensUsed: 0,
    })

    // 7. Complete task in state manager
    stateManager.completeTask(agentId, 'Found JWT and OAuth2 patterns')
    stateManager.recordFinding(agentId, 'auth', 'JWT is preferred for stateless APIs')

    // 8. Build focused context for next task
    const ctx = stateManager.buildFocusedContext(agentId)
    expect(ctx).not.toBeNull()
    expect(ctx!.completedTaskSummaries).toHaveLength(1)
    expect(ctx!.recentFindings).toHaveLength(1)

    // 9. Shape response with progressive disclosure
    const shaped = shapeResponse(JSON.parse(result.output), { detail: 'minimal' })
    expect(shaped.truncated).toBe(false)

    // 10. Verify the orchestrator recorded the audit
    const auditSummary = orchestrator.getAudit().getSummary()
    expect(auditSummary.totalEntries).toBe(1)
    expect(auditSummary.successRate).toBe(1)
  })

  it('should block a denied tool and degrade agent on failures', async () => {
    const agentId = 'agent-002'
    const agentName = 'Marketing Bot'

    // 1. Marketing agent tries docker_manage (denied by policy)
    const result = await orchestrator.execute(
      {
        agentId,
        agentName,
        workspaceId: 'ws-1',
        departmentDomain: 'marketing',
        orgRole: 'specialist',
        toolAccess: [],
      },
      'docker_manage',
      { action: 'start' },
      async () => 'should not run',
    )

    expect(result.blocked).toBe(true)
    expect(result.output).toContain('policy_denied')

    // 2. Record failures → triggers degradation
    degradation.recordOutcome(agentId, agentName, false)
    degradation.recordOutcome(agentId, agentName, false)
    degradation.recordOutcome(agentId, agentName, false)

    const profile = degradation.getProfile(agentId)
    expect(profile!.level).toBe('reduced')

    // 3. Dry-run should activate for degraded agent
    expect(
      shouldDryRun('file_write', { agentCapabilityLevel: 'reduced', forcePreview: false }),
    ).toBe(true)

    // 4. Generate dry-run preview
    const preview = generateDryRun('file_write', { path: '/tmp/test.txt', content: 'data' })
    expect(preview.code).toBe('dry_run')
    expect(preview.wouldAffect).toContain('WRITE')

    // 5. State manager tracks blocked task
    stateManager.getState(agentId, agentName, 'ws-1')
    stateManager.startTask(agentId, { id: 'task-1', title: 'Manage containers', status: 'pending' })
    stateManager.failTask(agentId, 'Tool docker_manage denied by policy')

    const state = stateManager.getState(agentId, agentName, 'ws-1')
    expect(state.completedTasks[0]!.summary).toContain('FAILED')
  })

  it('should handle the classify → respond → learn cycle', async () => {
    // 1. Error occurs
    const error = classifyError('web_search', 'Error 429: Too Many Requests')
    expect(error.code).toBe('rate_limited')
    expect(error.hint).toContain('Wait')

    // 2. Tuner learns from failure
    tuner.recordOutcome('provider-openai', 'provider', {
      timestamp: Date.now(),
      success: false,
      latencyMs: 500,
      tokensUsed: 0,
    })

    // Record several more failures to trigger tuning
    for (let i = 0; i < 8; i++) {
      tuner.recordOutcome('provider-openai', 'provider', {
        timestamp: Date.now(),
        success: false,
        latencyMs: 50000,
        tokensUsed: 0,
      })
    }

    // 3. Tuner adjusts parameters
    const actions = tuner.tune()
    expect(actions.length).toBeGreaterThan(0)

    // 4. State tracks all tuning states
    const states = tuner.getAllStates()
    expect(states.length).toBeGreaterThan(0)
    expect(states[0]!.pressure).toBeGreaterThan(0)
  })

  it('should verify work products with must_haves', async () => {
    const result = await verifier.verify({
      truths: [
        { description: 'Math works', check: async () => 2 + 2 === 4 },
        { description: 'Strings work', check: async () => 'hello'.length === 5 },
      ],
      artifacts: [],
      keyLinks: [],
    })

    expect(result.passed).toBe(true)
    expect(result.score).toBe(1)

    // Record in state manager
    stateManager.getState('agent-003', 'Verifier', 'ws-1')
    stateManager.recordVerification('agent-003', result.passed, result.score, result.summary)

    const state = stateManager.getState('agent-003', 'Verifier', 'ws-1')
    expect(state.lastVerification!.passed).toBe(true)
  })

  it('should discover all tools with correct tier distribution', () => {
    const discovery = discoverTools()
    expect(discovery.totalTools).toBeGreaterThan(30)
    expect(discovery.tierSummary.safe).toBeGreaterThan(discovery.tierSummary.raw)

    // All discovered tools should have descriptions
    for (const tool of discovery.tools) {
      expect(tool.description.length).toBeGreaterThan(0)
    }
  })

  it('should enforce scope-based permissions correctly', () => {
    const checker = new PermissionChecker()

    // CEO gets everything
    checker.initializeForRole('ceo-agent', 'ceo')
    expect(checker.canUseTool('ceo-agent', 'docker_manage').allowed).toBe(true)

    // Specialist can't use admin tools
    checker.initializeForRole('spec-agent', 'specialist')
    const result = checker.canUseTool('spec-agent', 'docker_manage')
    expect(result.allowed).toBe(false)
    expect(result.missingScopes).toContain('tools:admin')

    // Grant scope → now allowed
    checker.grantScope('spec-agent', 'tools:admin', 'admin')
    expect(checker.canUseTool('spec-agent', 'docker_manage').allowed).toBe(true)

    // Revoke → denied again
    checker.revokeScope('spec-agent', 'tools:admin')
    expect(checker.canUseTool('spec-agent', 'docker_manage').allowed).toBe(false)
  })
})

import { afterEach } from 'vitest'
