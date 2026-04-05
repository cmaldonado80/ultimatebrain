import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EmergentRoleCreator } from '../emergent-roles'
import { GoalCascadeEngine } from '../goal-cascade'
import { KnowledgeMesh } from '../knowledge-mesh'
import { WorkMarket } from '../work-market'

// ── Knowledge Mesh Tests ─────────────────────────────────────────────────

describe('KnowledgeMesh', () => {
  let mesh: KnowledgeMesh

  beforeEach(() => {
    mesh = new KnowledgeMesh()
  })

  const agentStates = [
    {
      agentId: 'agent-1',
      agentName: 'Auth Expert',
      workspaceId: 'engineering',
      context: {
        decisions: [
          {
            id: 'D1',
            decision: 'Use JWT for stateless auth',
            reason: 'Scales better than sessions',
            timestamp: Date.now(),
          },
        ],
        findings: [
          {
            topic: 'auth',
            insight: 'JWT has 15min token lifetime best practice',
            timestamp: Date.now(),
          },
        ],
        recentFiles: ['src/auth/jwt.ts'],
      },
      completedTasks: [
        { title: 'Implement JWT auth', summary: 'Added JWT signing and verification' },
      ],
    },
    {
      agentId: 'agent-2',
      agentName: 'DB Expert',
      workspaceId: 'engineering',
      context: {
        decisions: [
          {
            id: 'D2',
            decision: 'Use PostgreSQL with Drizzle',
            reason: 'Type-safe ORM',
            timestamp: Date.now(),
          },
        ],
        findings: [
          {
            topic: 'database',
            insight: 'Connection pooling improves throughput 3x',
            timestamp: Date.now(),
          },
        ],
        recentFiles: ['src/db/schema.ts'],
      },
      completedTasks: [
        { title: 'Setup database schema', summary: 'Created tables with Drizzle ORM' },
      ],
    },
  ]

  it('should find relevant knowledge from peers', async () => {
    const findings = await mesh.query(
      {
        askingAgentId: 'agent-3',
        question: 'How should I implement authentication?',
        context: '',
        scope: 'organization',
      },
      agentStates,
    )

    expect(findings.length).toBeGreaterThan(0)
    expect(findings.some((f) => f.sourceAgentId === 'agent-1')).toBe(true)
    expect(findings.some((f) => f.content.includes('JWT'))).toBe(true)
  })

  it('should not return results from the asking agent', async () => {
    const findings = await mesh.query(
      {
        askingAgentId: 'agent-1',
        question: 'Tell me about JWT',
        context: '',
        scope: 'organization',
      },
      agentStates,
    )

    expect(findings.every((f) => f.sourceAgentId !== 'agent-1')).toBe(true)
  })

  it('should filter by department scope', async () => {
    const findings = await mesh.query(
      {
        askingAgentId: 'agent-3',
        question: 'database setup',
        context: '',
        scope: 'department',
        departmentDomain: 'marketing',
      },
      agentStates,
    )

    // No agents in 'marketing' workspace
    expect(findings).toHaveLength(0)
  })

  it('should track statistics', async () => {
    await mesh.query(
      { askingAgentId: 'agent-3', question: 'auth patterns', context: '', scope: 'organization' },
      agentStates,
    )

    const stats = mesh.getStats()
    expect(stats.totalQueries).toBe(1)
    expect(stats.totalFindings).toBeGreaterThan(0)
  })
})

// ── Goal Cascade Tests ───────────────────────────────────────────────────

describe('GoalCascadeEngine', () => {
  let engine: GoalCascadeEngine

  beforeEach(() => {
    engine = new GoalCascadeEngine()
  })

  it('should set OKRs and compute progress', () => {
    engine.setOKRs([
      {
        id: 'okr-1',
        objective: 'Grow revenue',
        quarter: '2026-Q2',
        owner: 'corporation',
        keyResults: [
          {
            id: 'kr-1',
            description: 'Increase engineering output',
            metric: 'tickets_completed',
            target: 100,
            current: 45,
            unit: 'tickets',
            weight: 0.6,
          },
          {
            id: 'kr-2',
            description: 'Reduce design iteration time',
            metric: 'avg_design_cycle',
            target: 3,
            current: 5,
            unit: 'days',
            weight: 0.4,
          },
        ],
      },
    ])

    const progress = engine.getOKRProgress()
    expect(progress).toHaveLength(1)
    expect(progress[0]!.progress).toBeGreaterThan(0)
    expect(progress[0]!.keyResultProgress).toHaveLength(2)
  })

  it('should derive department KPIs from OKRs', () => {
    engine.setOKRs([
      {
        id: 'okr-1',
        objective: 'Improve platform',
        quarter: '2026-Q2',
        owner: 'corporation',
        keyResults: [
          {
            id: 'kr-1',
            description: 'Engineering velocity',
            metric: 'velocity',
            target: 100,
            current: 30,
            unit: 'points',
            weight: 1,
          },
        ],
      },
    ])

    const kpis = engine.deriveDepartmentKPIs([
      { id: 'dept-1', name: 'Engineering', domain: 'engineering' },
      { id: 'dept-2', name: 'Design', domain: 'design' },
    ])

    const engKpis = kpis.filter((k) => k.departmentName === 'Engineering')
    expect(engKpis.length).toBeGreaterThan(0)
  })

  it('should identify at-risk goals', () => {
    engine.setOKRs([
      {
        id: 'okr-1',
        objective: 'Ship v2',
        quarter: '2026-Q2',
        owner: 'corporation',
        keyResults: [
          {
            id: 'kr-1',
            description: 'Complete engineering features',
            metric: 'features',
            target: 50,
            current: 10,
            unit: 'features',
            weight: 1,
          },
        ],
      },
    ])

    engine.deriveDepartmentKPIs([{ id: 'dept-1', name: 'Engineering', domain: 'engineering' }])

    const atRisk = engine.getAtRiskGoals()
    expect(atRisk.length).toBeGreaterThan(0)
    expect(atRisk[0]!.progress).toBeLessThan(0.4)
  })

  it('should record goal alignments', () => {
    engine.recordAlignment({
      taskTitle: 'Implement auth',
      agentId: 'agent-1',
      departmentKpiId: 'kpi-1',
      okrId: 'okr-1',
      contribution: 'Adds one feature toward v2 goal',
    })

    const snapshot = engine.getSnapshot()
    expect(snapshot.alignments).toHaveLength(1)
  })
})

// ── Emergent Role Creator Tests ──────────────────────────────────────────

describe('EmergentRoleCreator', () => {
  let creator: EmergentRoleCreator

  beforeEach(() => {
    creator = new EmergentRoleCreator()
  })

  it('should not propose roles with insufficient patterns', () => {
    creator.recordPattern({
      agentId: 'a1',
      agentName: 'Agent 1',
      tools: ['web_scrape', 'db_query'],
      taskKeywords: ['integration'],
      timestamp: Date.now(),
    })

    const proposals = creator.analyze()
    expect(proposals).toHaveLength(0)
  })

  it('should propose roles when patterns are sustained', () => {
    // 5 patterns from 2 agents with same tool combo
    for (let i = 0; i < 3; i++) {
      creator.recordPattern({
        agentId: 'a1',
        agentName: 'Agent 1',
        tools: ['web_scrape', 'db_query'],
        taskKeywords: ['integration', 'api'],
        timestamp: Date.now(),
      })
    }
    for (let i = 0; i < 3; i++) {
      creator.recordPattern({
        agentId: 'a2',
        agentName: 'Agent 2',
        tools: ['web_scrape', 'db_query'],
        taskKeywords: ['integration', 'sync'],
        timestamp: Date.now(),
      })
    }

    const proposals = creator.analyze()
    expect(proposals.length).toBeGreaterThan(0)
    expect(proposals[0]!.suggestedSkills).toContain('db_query')
    expect(proposals[0]!.supportingAgents).toContain('Agent 1')
  })

  it('should approve and track proposal status', () => {
    for (let i = 0; i < 6; i++) {
      creator.recordPattern({
        agentId: `a${i % 3}`,
        agentName: `Agent ${i % 3}`,
        tools: ['vision_analyze'],
        taskKeywords: ['review'],
        timestamp: Date.now(),
      })
    }

    const proposals = creator.analyze()
    if (proposals.length > 0) {
      const approved = creator.approveProposal(proposals[0]!.id)
      expect(approved!.status).toBe('approved')
    }
  })

  it('should track statistics', () => {
    for (let i = 0; i < 5; i++) {
      creator.recordPattern({
        agentId: 'a1',
        agentName: 'Agent 1',
        tools: ['git_operations'],
        taskKeywords: ['deploy'],
        timestamp: Date.now(),
      })
    }

    const stats = creator.getStats()
    expect(stats.totalPatterns).toBe(5)
  })
})

// ── Work Market Tests ────────────────────────────────────────────────────

describe('WorkMarket', () => {
  let market: WorkMarket

  beforeEach(() => {
    market = new WorkMarket()
  })

  it('should list a ticket', async () => {
    const listing = await market.list({
      ticketId: 't1',
      title: 'Build auth',
      requiredSkills: ['typescript', 'jwt'],
      priority: 'high',
    })

    expect(listing.status).toBe('open')
    expect(listing.bids).toHaveLength(0)
  })

  it('should accept bids from qualified agents', async () => {
    await market.list({
      ticketId: 't1',
      title: 'Build auth',
      requiredSkills: ['typescript'],
      priority: 'high',
    })

    const bid = await market.bid('t1', {
      agentId: 'a1',
      agentName: 'Agent 1',
      skills: ['typescript', 'react'],
      currentTaskCount: 0,
      maxConcurrency: 3,
    })

    expect(bid).not.toBeNull()
    expect(bid!.skillMatch).toBeGreaterThan(0)
    expect(bid!.score).toBeGreaterThan(0)
  })

  it('should award to highest-scoring bidder', async () => {
    await market.list({
      ticketId: 't1',
      title: 'Build auth',
      requiredSkills: ['typescript'],
      priority: 'high',
    })

    // Agent 1: good skill match, idle
    await market.bid('t1', {
      agentId: 'a1',
      agentName: 'Agent 1',
      skills: ['typescript'],
      currentTaskCount: 0,
      maxConcurrency: 3,
    })

    // Agent 2: no skill match, busy
    await market.bid('t1', {
      agentId: 'a2',
      agentName: 'Agent 2',
      skills: ['python'],
      currentTaskCount: 2,
      maxConcurrency: 3,
    })

    const winner = await market.award('t1')
    expect(winner).not.toBeNull()
    expect(winner!.agentId).toBe('a1') // better skill match + lower load
  })

  it('should prevent duplicate bids', async () => {
    await market.list({ ticketId: 't1', title: 'Task', requiredSkills: [], priority: 'medium' })

    await market.bid('t1', {
      agentId: 'a1',
      agentName: 'Agent 1',
      skills: [],
      currentTaskCount: 0,
      maxConcurrency: 3,
    })
    const dup = await market.bid('t1', {
      agentId: 'a1',
      agentName: 'Agent 1',
      skills: [],
      currentTaskCount: 0,
      maxConcurrency: 3,
    })

    expect(dup).toBeNull()
  })

  it('should track reputation from completions', async () => {
    await market.list({ ticketId: 't1', title: 'Task', requiredSkills: [], priority: 'medium' })
    await market.bid('t1', {
      agentId: 'a1',
      agentName: 'Agent 1',
      skills: [],
      currentTaskCount: 0,
      maxConcurrency: 3,
    })
    await market.award('t1')

    await market.recordCompletion('a1', true, 5000)
    await market.recordCompletion('a1', true, 3000)
    await market.recordCompletion('a1', false, 10000)

    const rep = await market.getReputation('a1')
    expect(rep).not.toBeNull()
    expect(rep!.totalCompletions).toBe(2)
    expect(rep!.totalFailures).toBe(1)
    expect(rep!.successRate).toBeCloseTo(2 / 3, 2)
  })

  it('should return open listings filtered by skills', async () => {
    await market.list({
      ticketId: 't1',
      title: 'TS task',
      requiredSkills: ['typescript'],
      priority: 'high',
    })
    await market.list({
      ticketId: 't2',
      title: 'Python task',
      requiredSkills: ['python'],
      priority: 'medium',
    })

    const tsListings = await market.getOpenListings(['typescript'])
    const pyListings = await market.getOpenListings(['python'])

    expect(tsListings.some((l) => l.ticketId === 't1')).toBe(true)
    expect(pyListings.some((l) => l.ticketId === 't2')).toBe(true)
  })

  it('should provide market statistics', async () => {
    await market.list({ ticketId: 't1', title: 'Task', requiredSkills: [], priority: 'medium' })
    await market.bid('t1', {
      agentId: 'a1',
      agentName: 'Agent 1',
      skills: [],
      currentTaskCount: 0,
      maxConcurrency: 3,
    })

    const stats = await market.getStats()
    expect(stats.totalListings).toBe(1)
    expect(stats.openListings).toBe(1)
    expect(stats.avgBidsPerListing).toBe(1)
  })
})
