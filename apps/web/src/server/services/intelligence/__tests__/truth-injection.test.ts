import { describe, expect, it, vi } from 'vitest'

import { buildGroundedContext, classifyMode } from '../truth-injection'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../snapshot-builders', () => ({
  buildWorkspaceSnapshot: vi.fn(() => ({
    cwd: '/test/apps/web',
    projectRoot: '/test/apps/web',
    servicesPath: 'src/server/services',
    servicesExist: true,
    serviceDirectories: ['healing', 'sandbox', 'chat', 'intelligence'],
    totalServiceDirs: 4,
  })),
  buildHealthSnapshot: vi.fn(() => ({
    status: 'healthy',
    cortexCycles: 10,
    totalHealingActions: 5,
    totalRecoveries: 3,
    totalDegradations: 1,
    riskLevel: 'low',
    agentProfiles: [],
  })),
  buildSandboxSnapshot: vi.fn(() => ({
    totalExecutions: 100,
    blockedByPolicy: 2,
    timeouts: 1,
    crashes: 0,
    poolSize: 4,
    successRate: 0.97,
  })),
  buildDelegationSnapshot: vi.fn(() => ({
    totalAgents: 5,
    idleAgents: 3,
    busyAgents: 2,
    activeAgents: [{ name: 'Agent-1', status: 'idle' }],
  })),
  buildModelGovernanceSnapshot: vi.fn(() => ({
    defaultModel: 'qwen3-coder:480b-cloud',
    primaryRoute: 'ollama',
    providersConfigured: ['ollama'],
  })),
  buildSubsystemSnapshot: vi.fn(() => ({
    generatedAt: new Date().toISOString(),
    cwd: '/test',
    subsystems: [],
    totalFiles: 0,
    totalDirectories: 0,
  })),
  buildTaskTriageSnapshot: vi.fn(() => ({
    totalTickets: 0,
    blockedCount: 0,
    byStatus: {},
    byPriority: {},
    oldestUnassigned: null,
  })),
}))

// ── classifyMode Tests ──────────────────────────────────────────────────────

describe('classifyMode', () => {
  describe('agent role priority', () => {
    it('should return "operations" for monitoring/healing agent roles', () => {
      expect(classifyMode('anything', 'SOC Analyst')).toBe('operations')
      expect(classifyMode('anything', 'Security Ops')).toBe('operations')
    })

    it('should return "engineering" for code/build agent roles', () => {
      expect(classifyMode('anything', 'Software Engineer')).toBe('engineering')
      expect(classifyMode('anything', 'Dev Lead')).toBe('engineering')
      expect(classifyMode('anything', 'Code Reviewer')).toBe('engineering')
    })

    it('should return "research" for analysis/investigation agent roles', () => {
      expect(classifyMode('anything', 'Research Lead')).toBe('research')
      expect(classifyMode('anything', 'Data Analyst')).toBe('research')
    })

    it('should return "design" for UI/UX agent roles', () => {
      expect(classifyMode('anything', 'UI Designer')).toBe('design')
      expect(classifyMode('anything', 'UX Lead')).toBe('design')
    })

    it('should return "governance" for policy/compliance agent roles', () => {
      expect(classifyMode('anything', 'CEO')).toBe('governance')
      expect(classifyMode('anything', 'Head of Product')).toBe('governance')
      expect(classifyMode('anything', 'Governance Officer')).toBe('governance')
    })
  })

  describe('message-based fallback', () => {
    it('should return "operations" for monitoring/healing intents', () => {
      expect(classifyMode('check system health status')).toBe('operations')
      expect(classifyMode('there is an incident')).toBe('operations')
      expect(classifyMode('monitor the deploy')).toBe('operations')
    })

    it('should return "engineering" for code/build intents', () => {
      expect(classifyMode('review this code')).toBe('engineering')
      expect(classifyMode('refactor the module')).toBe('engineering')
      expect(classifyMode('fix the bug in tests')).toBe('engineering')
    })

    it('should return "research" for analysis/investigation intents', () => {
      expect(classifyMode('research this topic')).toBe('research')
      expect(classifyMode('investigate the issue')).toBe('research')
      expect(classifyMode('analyze the benchmark results')).toBe('research')
    })

    it('should return "design" for UI/UX intents', () => {
      expect(classifyMode('update the design')).toBe('design')
      expect(classifyMode('fix the layout')).toBe('design')
      expect(classifyMode('change the color scheme')).toBe('design')
    })

    it('should return "governance" for policy/compliance intents', () => {
      expect(classifyMode('update the policy')).toBe('governance')
      expect(classifyMode('check permission scopes')).toBe('governance')
      expect(classifyMode('review governance rules')).toBe('governance')
    })

    it('should default to "engineering" for unknown intents', () => {
      expect(classifyMode('hello world')).toBe('engineering')
      expect(classifyMode('what is the meaning of life')).toBe('engineering')
    })
  })
})

// ── buildGroundedContext Tests ───────────────────────────────────────────────

describe('buildGroundedContext', () => {
  it('should return a GroundedContext with expected shape', () => {
    const ctx = buildGroundedContext('check system health')

    expect(ctx).toHaveProperty('mode')
    expect(ctx).toHaveProperty('intent')
    expect(ctx).toHaveProperty('truth')
    expect(ctx).toHaveProperty('memoryHints')
    expect(ctx).toHaveProperty('systemRules')
    expect(ctx).toHaveProperty('influence')
  })

  it('should contain anti-hallucination rules', () => {
    const ctx = buildGroundedContext('hello')

    expect(ctx.systemRules).toContain('CRITICAL SYSTEM RULES')
    expect(ctx.systemRules).toContain('NEVER VIOLATE')
    expect(ctx.systemRules).toContain('Do NOT invent')
  })

  it('should include memory influence tracking', () => {
    const ctx = buildGroundedContext('hello')

    expect(ctx.influence).toHaveProperty('used')
    expect(ctx.influence).toHaveProperty('influenceLevel')
    expect(ctx.influence).toHaveProperty('memoryCount')
    expect(ctx.influence).toHaveProperty('memoryTiers')
    expect(ctx.influence).toHaveProperty('truthSnapshotsUsed')
    expect(ctx.influence).toHaveProperty('explanation')
    // Snapshots are always used (at least workspace)
    expect(ctx.influence.used).toBe(true)
    expect(ctx.influence.truthSnapshotsUsed.length).toBeGreaterThan(0)
  })

  it('should include workspace truth in all modes', () => {
    const ctx = buildGroundedContext('hello')
    expect(ctx.truth).toContain('Project Structure')
  })

  it('should include health/sandbox snapshots for operations mode', () => {
    const ctx = buildGroundedContext('check system health status')
    expect(ctx.mode).toBe('operations')
    expect(ctx.truth).toContain('System Health')
    expect(ctx.truth).toContain('Sandbox')
  })

  it('should include model governance for engineering mode', () => {
    const ctx = buildGroundedContext('refactor the code')
    expect(ctx.mode).toBe('engineering')
    expect(ctx.truth).toContain('Model Governance')
  })

  it('should include role-based memory hints when agentRole is provided', () => {
    const ctx = buildGroundedContext('hello', 'Agent-1', 'Security Ops')
    expect(ctx.memoryHints).toContain('Agent-1')
    expect(ctx.memoryHints).toContain('Security Ops')
  })

  it('should return empty memory hints when agentRole is not provided', () => {
    const ctx = buildGroundedContext('hello')
    expect(ctx.memoryHints).toBe('')
  })
})
