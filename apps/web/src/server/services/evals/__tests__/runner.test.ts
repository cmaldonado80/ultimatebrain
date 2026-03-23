import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EvalRunner } from '../runner'
import type { Scorer, ScorerInput } from '../scorers'

// --- Mock DB ---

function createMockDb() {
  return {
    query: {
      evalCases: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      evalRuns: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  } as any
}

// --- Simple test scorers ---

const alwaysPassScorer: Scorer = {
  name: 'taskCompletion',
  score: () => 1.0,
}

const alwaysFailScorer: Scorer = {
  name: 'taskCompletion',
  score: () => 0.0,
}

const allPassScorers: Scorer[] = [
  { name: 'taskCompletion', score: () => 1.0 },
  { name: 'factuality', score: () => 1.0 },
  { name: 'toolUseAccuracy', score: () => 1.0 },
  { name: 'safety', score: () => 1.0 },
  { name: 'costEfficiency', score: () => 1.0 },
]

describe('EvalRunner', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    db = createMockDb()
  })

  describe('scoreCase', () => {
    it('should return a passing result when all scorers return high scores', () => {
      const runner = new EvalRunner(db, allPassScorers)

      const result = runner.scoreCase(
        'case-1',
        'What is 2+2?',
        '4',
        '4',
      )

      expect(result.caseId).toBe('case-1')
      expect(result.passed).toBe(true)
      expect(result.aggregate).toBe(1.0)
      expect(result.scores.taskCompletion).toBe(1.0)
      expect(result.scores.factuality).toBe(1.0)
      expect(result.scores.safety).toBe(1.0)
    })

    it('should return a failing result when scorers return low scores', () => {
      const lowScorers: Scorer[] = [
        { name: 'taskCompletion', score: () => 0.1 },
        { name: 'factuality', score: () => 0.1 },
        { name: 'toolUseAccuracy', score: () => 0.1 },
        { name: 'safety', score: () => 0.1 },
        { name: 'costEfficiency', score: () => 0.1 },
      ]
      const runner = new EvalRunner(db, lowScorers)

      const result = runner.scoreCase('case-2', 'input', 'expected', 'wrong')

      expect(result.passed).toBe(false)
      expect(result.aggregate).toBeLessThan(0.7)
    })

    it('should respect custom passThreshold', () => {
      const midScorers: Scorer[] = [
        { name: 'taskCompletion', score: () => 0.5 },
        { name: 'factuality', score: () => 0.5 },
        { name: 'toolUseAccuracy', score: () => 0.5 },
        { name: 'safety', score: () => 0.5 },
        { name: 'costEfficiency', score: () => 0.5 },
      ]
      const runner = new EvalRunner(db, midScorers)

      const withHighThreshold = runner.scoreCase('case-3', 'in', 'out', 'out', undefined, {
        passThreshold: 0.9,
      })
      expect(withHighThreshold.passed).toBe(false)

      const withLowThreshold = runner.scoreCase('case-3', 'in', 'out', 'out', undefined, {
        passThreshold: 0.3,
      })
      expect(withLowThreshold.passed).toBe(true)
    })

    it('should filter to specific scorerNames when provided', () => {
      const spyScorer: Scorer = {
        name: 'taskCompletion',
        score: vi.fn().mockReturnValue(0.8),
      }
      const excludedScorer: Scorer = {
        name: 'safety',
        score: vi.fn().mockReturnValue(0.0),
      }
      const runner = new EvalRunner(db, [spyScorer, excludedScorer])

      runner.scoreCase('case-4', 'in', 'out', 'actual', undefined, {
        scorerNames: ['taskCompletion'],
      })

      expect(spyScorer.score).toHaveBeenCalled()
      expect(excludedScorer.score).not.toHaveBeenCalled()
    })
  })

  describe('runDataset', () => {
    it('should run all cases and return aggregate results', async () => {
      db.query.evalCases.findMany.mockResolvedValue([
        { id: 'c1', datasetId: 'ds-1', input: 'Q1', expectedOutput: 'A1' },
        { id: 'c2', datasetId: 'ds-1', input: 'Q2', expectedOutput: 'A2' },
      ])
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'run-1' }]),
        }),
      })

      const runner = new EvalRunner(db, allPassScorers)

      const result = await runner.runDataset('ds-1', {
        outputs: new Map([
          ['c1', { output: 'A1' }],
          ['c2', { output: 'A2' }],
        ]),
      })

      expect(result.runId).toBe('run-1')
      expect(result.datasetId).toBe('ds-1')
      expect(result.caseResults).toHaveLength(2)
      expect(result.passRate).toBe(1.0)
      expect(result.overallScore).toBe(1.0)
    })

    it('should throw when dataset has no cases', async () => {
      db.query.evalCases.findMany.mockResolvedValue([])

      const runner = new EvalRunner(db, allPassScorers)

      await expect(runner.runDataset('empty-ds')).rejects.toThrow(
        'No eval cases found for dataset empty-ds',
      )
    })

    it('should use executor function to produce outputs', async () => {
      db.query.evalCases.findMany.mockResolvedValue([
        { id: 'c1', datasetId: 'ds-2', input: 'What is 1+1?', expectedOutput: '2' },
      ])
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'run-2' }]),
        }),
      })

      const executor = vi.fn().mockResolvedValue({ output: '2' })
      const runner = new EvalRunner(db, allPassScorers)

      const result = await runner.runDataset('ds-2', { executor })

      expect(executor).toHaveBeenCalledWith('What is 1+1?')
      expect(result.caseResults).toHaveLength(1)
      expect(result.caseResults[0]!.passed).toBe(true)
    })

    it('should skip cases with no outputs and no executor', async () => {
      db.query.evalCases.findMany.mockResolvedValue([
        { id: 'c1', datasetId: 'ds-3', input: 'Q', expectedOutput: 'A' },
      ])
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'run-3' }]),
        }),
      })

      const runner = new EvalRunner(db, allPassScorers)

      const result = await runner.runDataset('ds-3', {})

      expect(result.caseResults).toHaveLength(0)
      expect(result.passRate).toBe(0)
    })
  })
})
