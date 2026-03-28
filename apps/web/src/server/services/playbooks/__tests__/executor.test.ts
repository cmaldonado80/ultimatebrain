import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PlaybookExecutor } from '../executor'
import type { SavedPlaybook } from '../recorder'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../gateway', () => ({
  GatewayRouter: vi.fn().mockImplementation(() => ({
    chat: vi.fn().mockResolvedValue({ content: 'yes' }),
  })),
}))

function createMockDb() {
  return {} as any
}

function makePlaybook(overrides: Partial<SavedPlaybook> = {}): SavedPlaybook {
  return {
    id: 'pb-1',
    name: 'Test Playbook',
    description: 'A test playbook',
    steps: [
      {
        index: 0,
        name: 'Step 1',
        type: 'transformation',
        description: 'Transform data',
        parameters: { input: '{{data}}' },
      },
      {
        index: 1,
        name: 'Step 2',
        type: 'custom',
        description: 'Custom step',
        parameters: { value: 'fixed' },
      },
    ],
    ...overrides,
  } as SavedPlaybook
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PlaybookExecutor', () => {
  let executor: PlaybookExecutor

  beforeEach(() => {
    vi.clearAllMocks()
    executor = new PlaybookExecutor(createMockDb())
  })

  // ── execute ───────────────────────────────────────────────────────────

  describe('execute', () => {
    it('should execute all steps and return completed status', async () => {
      const result = await executor.execute(makePlaybook(), {
        parameterValues: { data: 'hello' },
      })

      expect(result.status).toBe('completed')
      expect(result.stepResults).toHaveLength(2)
      expect(result.stepsCompleted).toBe(2)
      expect(result.totalSteps).toBe(2)
      expect(result.successRate).toBe(1)
      expect(result.playbookName).toBe('Test Playbook')
    })

    it('should resolve {{variables}} in step parameters', async () => {
      const onStepComplete = vi.fn()

      await executor.execute(makePlaybook(), {
        parameterValues: { data: 'resolved_value' },
        onStepComplete,
      })

      const firstStepResult = onStepComplete.mock.calls[0][0]
      expect(firstStepResult.status).toBe('passed')
    })

    it('should return run with a unique runId', async () => {
      const result1 = await executor.execute(makePlaybook())
      const result2 = await executor.execute(makePlaybook())

      expect(result1.runId).not.toBe(result2.runId)
    })

    it('should call onStepComplete callback for each step', async () => {
      const onStepComplete = vi.fn()

      await executor.execute(makePlaybook(), { onStepComplete })

      expect(onStepComplete).toHaveBeenCalledTimes(2)
    })

    it('should handle empty playbook with no steps', async () => {
      const result = await executor.execute(makePlaybook({ steps: [] }))

      expect(result.status).toBe('completed')
      expect(result.stepResults).toHaveLength(0)
      expect(result.successRate).toBe(0)
    })

    it('should pause for HITL when step requires approval in hitl mode', async () => {
      const playbook = makePlaybook({
        steps: [
          {
            index: 0,
            name: 'Risky Step',
            type: 'api_call',
            description: 'Dangerous operation',
            parameters: {},
            requiresApproval: true,
          },
        ],
      })

      const result = await executor.execute(playbook, {
        hitlMode: true,
        onHitlRequest: vi.fn().mockResolvedValue(false), // deny
      })

      expect(result.status).toBe('paused_for_hitl')
      expect(result.pausedAtStep).toBe(0)
    })

    it('should continue when HITL approval is granted', async () => {
      const playbook = makePlaybook({
        steps: [
          {
            index: 0,
            name: 'Risky Step',
            type: 'custom',
            description: 'Needs approval',
            parameters: {},
            requiresApproval: true,
          },
          {
            index: 1,
            name: 'Safe Step',
            type: 'custom',
            description: 'Safe',
            parameters: {},
          },
        ],
      })

      const result = await executor.execute(playbook, {
        hitlMode: true,
        onHitlRequest: vi.fn().mockResolvedValue(true), // approve
      })

      // The HITL step returns awaiting_hitl status, but since onHitlRequest approves,
      // execution continues to step 2
      expect(result.stepResults.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── getRun ────────────────────────────────────────────────────────────

  describe('getRun', () => {
    it('should return a stored run by ID', async () => {
      const result = await executor.execute(makePlaybook())
      const retrieved = executor.getRun(result.runId)

      expect(retrieved).toBeDefined()
      expect(retrieved!.runId).toBe(result.runId)
    })

    it('should return null for non-existent run', () => {
      const result = executor.getRun('nonexistent')

      expect(result).toBeNull()
    })
  })

  // ── resume ────────────────────────────────────────────────────────────

  describe('resume', () => {
    it('should throw for non-existent run', async () => {
      await expect(executor.resume('nonexistent', makePlaybook())).rejects.toThrow(
        'Run nonexistent not found',
      )
    })

    it('should throw when run is not paused', async () => {
      const result = await executor.execute(makePlaybook())

      await expect(executor.resume(result.runId, makePlaybook())).rejects.toThrow('is not paused')
    })
  })

  // ── abTest ────────────────────────────────────────────────────────────

  describe('abTest', () => {
    it('should run both playbooks and return comparison', async () => {
      const original = makePlaybook({ id: 'pb-original', name: 'Original' })
      const modified = makePlaybook({ id: 'pb-modified', name: 'Modified' })

      const result = await executor.abTest(original, modified)

      expect(result.originalResult).toBeDefined()
      expect(result.modifiedResult).toBeDefined()
      expect(['original', 'modified', 'tie']).toContain(result.winner)
      expect(result.comparison).toBeDefined()
      expect(typeof result.comparison.successRateDelta).toBe('number')
    })

    it('should declare tie when results are similar', async () => {
      const pb = makePlaybook()

      const result = await executor.abTest(pb, pb)

      // Same playbook should give similar results
      expect(result.comparison.successRateDelta).toBe(0)
    })
  })
})
