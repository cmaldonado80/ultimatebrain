import type { Database } from '@solarc/db'
import { describe, expect, it } from 'vitest'

import { createMockDb } from '../../../../../../../test/helpers/db-mock'
import { CostTracker } from '../cost-tracker'

describe('CostTracker', () => {
  describe('calculateCost', () => {
    const db = createMockDb()
    const tracker = new CostTracker(db as unknown as Database)

    it('calculates cost for Claude Opus 4.6', () => {
      // $15/M input + $75/M output
      const cost = tracker.calculateCost('claude-opus-4-6', 1_000_000, 1_000_000)
      expect(cost).toBe(15 + 75)
    })

    it('calculates cost for Claude Sonnet 4.6', () => {
      // $3/M input + $15/M output
      const cost = tracker.calculateCost('claude-sonnet-4-6', 1_000, 1_000)
      expect(cost).toBeCloseTo(0.018, 5)
    })

    it('calculates cost for GPT-4o', () => {
      // $2.50/M input + $10/M output
      const cost = tracker.calculateCost('gpt-4o', 500_000, 100_000)
      expect(cost).toBeCloseTo(1.25 + 1.0, 5)
    })

    it('returns 0 for ollama models', () => {
      expect(tracker.calculateCost('ollama', 1_000_000, 1_000_000)).toBe(0)
    })

    it('treats local models (with colon) as free', () => {
      expect(tracker.calculateCost('llama3:8b', 1_000_000, 1_000_000)).toBe(0)
    })

    it('treats ollama/ prefixed models as free', () => {
      expect(tracker.calculateCost('ollama/mistral', 1_000_000, 1_000_000)).toBe(0)
    })

    it('falls back to sonnet pricing for unknown models', () => {
      const cost = tracker.calculateCost('unknown-model', 1_000_000, 1_000_000)
      expect(cost).toBe(3 + 15)
    })

    it('returns 0 for zero tokens', () => {
      expect(tracker.calculateCost('claude-opus-4-6', 0, 0)).toBe(0)
    })

    it('calculates Gemini 2.5 Pro correctly', () => {
      // $1.25/M input + $10/M output
      const cost = tracker.calculateCost('gemini-2.5-pro', 2_000_000, 500_000)
      expect(cost).toBeCloseTo(2.5 + 5.0, 5)
    })
  })

  describe('getPricing', () => {
    it('returns all pricing entries', () => {
      const pricing = CostTracker.getPricing()
      expect(pricing['claude-opus-4-6']).toBeDefined()
      expect(pricing['gpt-4o']).toBeDefined()
      expect(pricing['ollama']).toBeDefined()
    })

    it('returns a copy (not mutable reference)', () => {
      const pricing = CostTracker.getPricing()
      pricing['claude-opus-4-6'] = { input: 999, output: 999 }
      const freshPricing = CostTracker.getPricing()
      expect(freshPricing['claude-opus-4-6'].input).toBe(15)
    })
  })
})
