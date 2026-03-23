import { describe, it, expect } from 'vitest'

// Scoring utilities — these will be exported from the eval engine once
// implemented.  For now we define the expected behaviour inline so the
// tests serve as a living spec.

/** Exact-match scorer: 1 if equal, 0 otherwise */
function exactMatch(expected: string, actual: string): number {
  return expected === actual ? 1 : 0
}

/** Case-insensitive match scorer */
function fuzzyMatch(expected: string, actual: string): number {
  return expected.toLowerCase() === actual.toLowerCase() ? 1 : 0
}

/** Numeric closeness scorer — returns a value in [0, 1] */
function numericCloseness(expected: number, actual: number, tolerance: number): number {
  if (tolerance <= 0) throw new Error('Tolerance must be positive')
  const distance = Math.abs(expected - actual)
  return Math.max(0, 1 - distance / tolerance)
}

/** Substring inclusion scorer */
function containsSubstring(expected: string, actual: string): number {
  return actual.includes(expected) ? 1 : 0
}

/** Aggregate scorer: weighted average of individual scores */
function weightedAverage(scores: { score: number; weight: number }[]): number {
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0)
  if (totalWeight === 0) return 0
  const weightedSum = scores.reduce((sum, s) => sum + s.score * s.weight, 0)
  return weightedSum / totalWeight
}

/** Latency scorer — penalises responses above a target duration */
function latencyScore(actualMs: number, targetMs: number): number {
  if (actualMs <= targetMs) return 1
  // Linear decay up to 2x the target, then 0
  return Math.max(0, 1 - (actualMs - targetMs) / targetMs)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Eval Scorers', () => {
  describe('exactMatch', () => {
    it('returns 1 for identical strings', () => {
      expect(exactMatch('hello', 'hello')).toBe(1)
    })

    it('returns 0 for different strings', () => {
      expect(exactMatch('hello', 'world')).toBe(0)
    })

    it('is case-sensitive', () => {
      expect(exactMatch('Hello', 'hello')).toBe(0)
    })

    it('handles empty strings', () => {
      expect(exactMatch('', '')).toBe(1)
    })
  })

  describe('fuzzyMatch', () => {
    it('returns 1 for case-insensitive match', () => {
      expect(fuzzyMatch('Hello', 'hello')).toBe(1)
    })

    it('returns 0 when strings differ beyond casing', () => {
      expect(fuzzyMatch('Hello', 'world')).toBe(0)
    })
  })

  describe('numericCloseness', () => {
    it('returns 1 when values are equal', () => {
      expect(numericCloseness(10, 10, 5)).toBe(1)
    })

    it('returns 0.5 when distance is half the tolerance', () => {
      expect(numericCloseness(10, 12.5, 5)).toBe(0.5)
    })

    it('returns 0 when distance exceeds tolerance', () => {
      expect(numericCloseness(10, 20, 5)).toBe(0)
    })

    it('clamps negative scores to 0', () => {
      expect(numericCloseness(0, 100, 5)).toBe(0)
    })

    it('throws when tolerance is zero or negative', () => {
      expect(() => numericCloseness(1, 2, 0)).toThrow('Tolerance must be positive')
      expect(() => numericCloseness(1, 2, -1)).toThrow('Tolerance must be positive')
    })
  })

  describe('containsSubstring', () => {
    it('returns 1 when substring is present', () => {
      expect(containsSubstring('world', 'hello world')).toBe(1)
    })

    it('returns 0 when substring is absent', () => {
      expect(containsSubstring('xyz', 'hello world')).toBe(0)
    })
  })

  describe('weightedAverage', () => {
    it('computes correct weighted average', () => {
      const scores = [
        { score: 1, weight: 2 },
        { score: 0.5, weight: 1 },
      ]
      // (1*2 + 0.5*1) / (2+1) = 2.5 / 3 ≈ 0.8333
      expect(weightedAverage(scores)).toBeCloseTo(0.8333, 3)
    })

    it('returns 0 when total weight is 0', () => {
      expect(weightedAverage([{ score: 1, weight: 0 }])).toBe(0)
    })

    it('returns exact score when a single item has weight', () => {
      expect(weightedAverage([{ score: 0.7, weight: 1 }])).toBeCloseTo(0.7)
    })
  })

  describe('latencyScore', () => {
    it('returns 1 when under target', () => {
      expect(latencyScore(50, 100)).toBe(1)
    })

    it('returns 1 when exactly at target', () => {
      expect(latencyScore(100, 100)).toBe(1)
    })

    it('returns 0.5 when 50% over target', () => {
      expect(latencyScore(150, 100)).toBe(0.5)
    })

    it('returns 0 when at 2x target', () => {
      expect(latencyScore(200, 100)).toBe(0)
    })

    it('clamps to 0 beyond 2x target', () => {
      expect(latencyScore(500, 100)).toBe(0)
    })
  })
})
