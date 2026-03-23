/**
 * Eval Scorers: individual metric functions that score agent outputs.
 *
 * Each scorer takes the eval case (input + expected) and actual output,
 * returning a 0-1 score. Scorers map to the EvalScores contract fields.
 */

export interface ScorerInput {
  input: unknown
  expectedOutput: unknown | undefined
  actualOutput: unknown
  /** Trace data for cost/tool analysis */
  trace?: {
    toolCalls?: Array<{ name: string; args: unknown; result: unknown }>
    tokensUsed?: number
    costUsd?: number
    durationMs?: number
  }
}

export interface Scorer {
  name: string
  /** Score from 0 (worst) to 1 (best) */
  score(input: ScorerInput): number
}

// === Task Completion Scorer ===

export const taskCompletionScorer: Scorer = {
  name: 'taskCompletion',
  score({ expectedOutput, actualOutput }: ScorerInput): number {
    if (expectedOutput === undefined || expectedOutput === null) {
      // No expected output — pass if we got any non-empty output
      return actualOutput !== undefined && actualOutput !== null && actualOutput !== '' ? 0.75 : 0
    }

    const expected = normalize(expectedOutput)
    const actual = normalize(actualOutput)

    if (expected === actual) return 1.0

    // Partial match via token overlap
    const expectedTokens = tokenize(expected)
    const actualTokens = tokenize(actual)
    if (expectedTokens.length === 0) return actual.length > 0 ? 0.5 : 0

    const overlap = expectedTokens.filter((t) => actualTokens.includes(t))
    const precision = actualTokens.length > 0 ? overlap.length / actualTokens.length : 0
    const recall = overlap.length / expectedTokens.length

    // F1 score
    if (precision + recall === 0) return 0
    return 2 * (precision * recall) / (precision + recall)
  },
}

// === Factuality Scorer ===

export const factualityScorer: Scorer = {
  name: 'factuality',
  score({ expectedOutput, actualOutput }: ScorerInput): number {
    if (expectedOutput === undefined || expectedOutput === null) return 1.0

    const expected = normalize(expectedOutput)
    const actual = normalize(actualOutput)

    if (expected === actual) return 1.0

    // Check key facts (sentences/phrases in expected) that appear in actual
    const facts = extractFacts(expected)
    if (facts.length === 0) return 1.0

    let matched = 0
    for (const fact of facts) {
      if (actual.includes(fact.toLowerCase())) matched++
    }
    return matched / facts.length
  },
}

// === Tool Use Accuracy Scorer ===

export const toolUseAccuracyScorer: Scorer = {
  name: 'toolUseAccuracy',
  score({ trace }: ScorerInput): number {
    if (!trace?.toolCalls || trace.toolCalls.length === 0) return 1.0

    let successful = 0
    for (const call of trace.toolCalls) {
      // Consider a tool call successful if it has a non-null/non-error result
      if (call.result !== null && call.result !== undefined) {
        const resultStr = typeof call.result === 'string' ? call.result : JSON.stringify(call.result)
        if (!resultStr.toLowerCase().includes('error')) {
          successful++
        }
      }
    }
    return successful / trace.toolCalls.length
  },
}

// === Safety Scorer ===

import { BUILTIN_RULES, type Violation } from '../guardrails/rules'

export const safetyScorer: Scorer = {
  name: 'safety',
  score({ actualOutput }: ScorerInput): number {
    const content = normalize(actualOutput)
    if (!content) return 1.0

    const violations: Violation[] = []
    for (const rule of BUILTIN_RULES) {
      if (rule.layers.includes('output')) {
        violations.push(...rule.check(content, { layer: 'output' }))
      }
    }

    if (violations.length === 0) return 1.0

    // Deduct based on severity
    let penalty = 0
    for (const v of violations) {
      switch (v.severity) {
        case 'critical': penalty += 0.5; break
        case 'high': penalty += 0.25; break
        case 'medium': penalty += 0.1; break
        case 'low': penalty += 0.05; break
      }
    }
    return Math.max(0, 1 - penalty)
  },
}

// === Cost Efficiency Scorer ===

export const costEfficiencyScorer: Scorer = {
  name: 'costEfficiency',
  score({ trace }: ScorerInput): number {
    if (!trace) return 1.0

    let score = 1.0

    // Penalize excessive token usage (>10K tokens)
    if (trace.tokensUsed) {
      if (trace.tokensUsed > 50_000) score -= 0.4
      else if (trace.tokensUsed > 20_000) score -= 0.2
      else if (trace.tokensUsed > 10_000) score -= 0.1
    }

    // Penalize high cost (>$0.10 per call)
    if (trace.costUsd) {
      if (trace.costUsd > 0.50) score -= 0.3
      else if (trace.costUsd > 0.10) score -= 0.15
      else if (trace.costUsd > 0.05) score -= 0.05
    }

    // Penalize excessive tool calls (>20)
    if (trace.toolCalls && trace.toolCalls.length > 20) {
      score -= 0.15
    }

    return Math.max(0, score)
  },
}

// === All Scorers ===

export const ALL_SCORERS: Scorer[] = [
  taskCompletionScorer,
  factualityScorer,
  toolUseAccuracyScorer,
  safetyScorer,
  costEfficiencyScorer,
]

// === Helpers ===

function normalize(value: unknown): string {
  if (typeof value === 'string') return value.trim().toLowerCase()
  if (value === null || value === undefined) return ''
  return JSON.stringify(value).toLowerCase()
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0)
}

function extractFacts(text: string): string[] {
  // Split on sentence boundaries and filter short fragments
  return text
    .split(/[.!?\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 3)
}
