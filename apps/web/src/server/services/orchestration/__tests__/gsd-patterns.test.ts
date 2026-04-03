import { describe, expect, it } from 'vitest'

import { AgentStateManager } from '../agent-state'
import { type MustHaves, WorkVerifier } from '../work-verifier'

// ── Work Verifier Tests (stolen from GSD must_haves) ─────────────────────

describe('WorkVerifier (stolen from GSD must_haves)', () => {
  const verifier = new WorkVerifier()

  it('should pass when all truths are true', async () => {
    const mustHaves: MustHaves = {
      truths: [
        { description: '1 + 1 = 2', check: async () => 1 + 1 === 2 },
        { description: 'String is not empty', check: async () => 'hello'.length > 0 },
      ],
      artifacts: [],
      keyLinks: [],
    }

    const result = await verifier.verify(mustHaves)
    expect(result.passed).toBe(true)
    expect(result.score).toBe(1)
    expect(result.truthResults).toHaveLength(2)
    expect(result.truthResults.every((r) => r.passed)).toBe(true)
  })

  it('should fail when a truth is false', async () => {
    const mustHaves: MustHaves = {
      truths: [
        { description: 'Always true', check: async () => true },
        { description: 'Always false', check: async () => false },
      ],
      artifacts: [],
      keyLinks: [],
    }

    const result = await verifier.verify(mustHaves)
    expect(result.passed).toBe(false)
    expect(result.score).toBe(0.5)
    expect(result.summary).toContain('Always false')
  })

  it('should handle truth check exceptions gracefully', async () => {
    const mustHaves: MustHaves = {
      truths: [
        {
          description: 'Throws error',
          check: async () => {
            throw new Error('boom')
          },
        },
      ],
      artifacts: [],
      keyLinks: [],
    }

    const result = await verifier.verify(mustHaves)
    expect(result.passed).toBe(false)
    expect(result.truthResults[0]!.error).toBe('boom')
  })

  it('should detect missing artifacts', async () => {
    const mustHaves: MustHaves = {
      truths: [],
      artifacts: [
        {
          path: '/tmp/nonexistent_file_xyz_12345.ts',
          provides: 'Some module',
          minLines: 10,
        },
      ],
      keyLinks: [],
    }

    const result = await verifier.verify(mustHaves)
    expect(result.passed).toBe(false)
    expect(result.artifactResults[0]!.reason).toBe('File does not exist')
  })

  it('should return perfect score for empty must_haves', async () => {
    const result = await verifier.verify({ truths: [], artifacts: [], keyLinks: [] })
    expect(result.passed).toBe(true)
    expect(result.score).toBe(1)
    expect(result.summary).toContain('0 checks passed')
  })

  it('should include summary with failure details', async () => {
    const mustHaves: MustHaves = {
      truths: [{ description: 'Check A', check: async () => false }],
      artifacts: [],
      keyLinks: [],
    }

    const result = await verifier.verify(mustHaves)
    expect(result.summary).toContain('0/1')
    expect(result.summary).toContain('Truth: Check A')
  })
})

// ── Agent State Manager Tests (stolen from GSD .planning/STATE.md) ───────

describe('AgentStateManager (stolen from GSD persistent state)', () => {
  it('should create state for new agent', () => {
    const manager = new AgentStateManager()
    const state = manager.getState('agent-1', 'Agent 1', 'ws-1')

    expect(state.agentId).toBe('agent-1')
    expect(state.currentTask).toBeNull()
    expect(state.taskQueue).toHaveLength(0)
    expect(state.completedTasks).toHaveLength(0)
    expect(state.sessionCount).toBe(0)
  })

  it('should return existing state for same agent', () => {
    const manager = new AgentStateManager()
    const first = manager.getState('agent-1', 'Agent 1', 'ws-1')
    first.sessionCount = 5
    const second = manager.getState('agent-1', 'Agent 1', 'ws-1')
    expect(second.sessionCount).toBe(5)
  })

  it('should start a task', () => {
    const manager = new AgentStateManager()
    manager.getState('agent-1', 'Agent 1', 'ws-1')
    const state = manager.startTask('agent-1', {
      id: 'task-1',
      title: 'Build feature',
      status: 'pending',
    })

    expect(state!.currentTask!.status).toBe('in_progress')
    expect(state!.currentTask!.startedAt).toBeGreaterThan(0)
    expect(state!.context.currentFocus).toBe('Build feature')
  })

  it('should complete a task and advance to next', () => {
    const manager = new AgentStateManager()
    manager.getState('agent-1', 'Agent 1', 'ws-1')

    // Queue two tasks
    manager.startTask('agent-1', { id: 'task-1', title: 'Task 1', status: 'pending' })
    // Starting task-2 moves task-1 to queue
    manager.startTask('agent-1', { id: 'task-2', title: 'Task 2', status: 'pending' })

    // Complete task-2
    const state = manager.completeTask('agent-1', 'Done with task 2')

    expect(state!.completedTasks).toHaveLength(1)
    expect(state!.completedTasks[0]!.summary).toBe('Done with task 2')
    expect(state!.totalTasksCompleted).toBe(1)

    // Task 1 should be auto-advanced
    expect(state!.currentTask!.id).toBe('task-1')
    expect(state!.currentTask!.status).toBe('in_progress')
  })

  it('should fail a task', () => {
    const manager = new AgentStateManager()
    manager.getState('agent-1', 'Agent 1', 'ws-1')
    manager.startTask('agent-1', { id: 'task-1', title: 'Task 1', status: 'pending' })

    const state = manager.failTask('agent-1', 'API timeout')
    expect(state!.currentTask).toBeNull()
    expect(state!.completedTasks[0]!.summary).toContain('FAILED')
  })

  it('should block a task', () => {
    const manager = new AgentStateManager()
    manager.getState('agent-1', 'Agent 1', 'ws-1')
    manager.startTask('agent-1', { id: 'task-1', title: 'Task 1', status: 'pending' })

    const state = manager.blockTask('agent-1', 'Waiting for approval')
    expect(state!.currentTask!.status).toBe('blocked')
    expect(state!.currentTask!.blockedBy).toBe('Waiting for approval')
  })

  it('should record decisions', () => {
    const manager = new AgentStateManager()
    manager.getState('agent-1', 'Agent 1', 'ws-1')
    manager.recordDecision('agent-1', 'AUTH-01', 'Use JWT', 'Stateless, scalable')

    const state = manager.getState('agent-1', 'Agent 1', 'ws-1')
    expect(state.context.decisions).toHaveLength(1)
    expect(state.context.decisions[0]!.decision).toBe('Use JWT')
  })

  it('should record findings', () => {
    const manager = new AgentStateManager()
    manager.getState('agent-1', 'Agent 1', 'ws-1')
    manager.recordFinding('agent-1', 'Auth', 'OAuth2 has better mobile support')

    const state = manager.getState('agent-1', 'Agent 1', 'ws-1')
    expect(state.context.findings).toHaveLength(1)
  })

  it('should track files with deduplication', () => {
    const manager = new AgentStateManager()
    manager.getState('agent-1', 'Agent 1', 'ws-1')

    manager.trackFile('agent-1', 'src/a.ts')
    manager.trackFile('agent-1', 'src/b.ts')
    manager.trackFile('agent-1', 'src/a.ts') // duplicate

    const state = manager.getState('agent-1', 'Agent 1', 'ws-1')
    expect(state.context.recentFiles).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('should build focused context (fresh context pattern)', () => {
    const manager = new AgentStateManager()
    manager.getState('agent-1', 'Agent 1', 'ws-1')
    manager.startTask('agent-1', { id: 'task-1', title: 'Build auth', status: 'pending' })
    manager.recordDecision('agent-1', 'D1', 'Use JWT', 'Scalable')
    manager.recordFinding('agent-1', 'Auth', 'JWT is lightweight')
    manager.trackFile('agent-1', 'src/auth.ts')

    const ctx = manager.buildFocusedContext('agent-1')

    expect(ctx).not.toBeNull()
    expect(ctx!.currentTask!.title).toBe('Build auth')
    expect(ctx!.recentDecisions).toHaveLength(1)
    expect(ctx!.recentFindings).toHaveLength(1)
    expect(ctx!.recentFiles).toContain('src/auth.ts')
  })

  it('should record verification results', () => {
    const manager = new AgentStateManager()
    manager.getState('agent-1', 'Agent 1', 'ws-1')
    manager.recordVerification('agent-1', true, 1.0, 'All 5 checks passed')

    const state = manager.getState('agent-1', 'Agent 1', 'ws-1')
    expect(state.lastVerification!.passed).toBe(true)
    expect(state.lastVerification!.score).toBe(1.0)
  })

  it('should start a new session', () => {
    const manager = new AgentStateManager()
    manager.getState('agent-1', 'Agent 1', 'ws-1')
    manager.startSession('agent-1')
    manager.startSession('agent-1')

    const state = manager.getState('agent-1', 'Agent 1', 'ws-1')
    expect(state.sessionCount).toBe(2)
  })

  it('should list all states', () => {
    const manager = new AgentStateManager()
    manager.getState('agent-1', 'Agent 1', 'ws-1')
    manager.getState('agent-2', 'Agent 2', 'ws-1')

    expect(manager.getAllStates()).toHaveLength(2)
  })

  it('should filter by workspace', () => {
    const manager = new AgentStateManager()
    manager.getState('agent-1', 'Agent 1', 'ws-1')
    manager.getState('agent-2', 'Agent 2', 'ws-2')

    expect(manager.getWorkspaceStates('ws-1')).toHaveLength(1)
    expect(manager.getWorkspaceStates('ws-2')).toHaveLength(1)
  })
})
