/**
 * Model Strategy — Opus / Sonnet / Haiku Division of Labor
 *
 * Routes tasks to the right model tier based on complexity/cost tradeoffs:
 * - Opus (~5%): architecture, security, eval judging, instinct evolution
 * - Sonnet (~85%): ticket execution, code gen, chat, flows
 * - Haiku (~10%): routing, scoring, guardrails, compaction
 *
 * Expected cost: ~$8.13 per 1K tickets (before caching).
 * With 20-30% semantic cache hit rate: ~$6 per 1K tickets.
 */

export type ModelTier = 'opus' | 'sonnet' | 'haiku'

export type TaskType =
  // Opus tasks
  | 'architecture-review'
  | 'security-scan-deep'
  | 'multi-file-refactor'
  | 'eval-judge'
  | 'instinct-evolve'
  | 'debug-complex'
  | 'debate-arbitrate'
  | 'documentation-synthesis'
  // Sonnet tasks
  | 'ticket-execute'
  | 'code-generate'
  | 'chat-respond'
  | 'agent-yield'
  | 'flow-step'
  | 'memory-search'
  | 'deep-work-plan'
  | 'guardrail-output'
  | 'receipt-create'
  // Haiku tasks
  | 'instinct-observe'
  | 'route-classify'
  | 'context-score'
  | 'guardrail-input'
  | 'rag-grade'
  | 'query-rewrite'
  | 'session-compact'
  | 'health-check'
  | 'notification-format'
  | 'trust-score'

/** Task → Model tier mapping */
const TASK_TIERS: Record<TaskType, ModelTier> = {
  // Opus — Heavy thinking (~5% of calls)
  'architecture-review': 'opus',
  'security-scan-deep': 'opus',
  'multi-file-refactor': 'opus',
  'eval-judge': 'opus',
  'instinct-evolve': 'opus',
  'debug-complex': 'opus',
  'debate-arbitrate': 'opus',
  'documentation-synthesis': 'opus',

  // Sonnet — Daily driver (~85% of calls)
  'ticket-execute': 'sonnet',
  'code-generate': 'sonnet',
  'chat-respond': 'sonnet',
  'agent-yield': 'sonnet',
  'flow-step': 'sonnet',
  'memory-search': 'sonnet',
  'deep-work-plan': 'sonnet',
  'guardrail-output': 'sonnet',
  'receipt-create': 'sonnet',

  // Haiku — Fast + cheap (~10% of calls)
  'instinct-observe': 'haiku',
  'route-classify': 'haiku',
  'context-score': 'haiku',
  'guardrail-input': 'haiku',
  'rag-grade': 'haiku',
  'query-rewrite': 'haiku',
  'session-compact': 'haiku',
  'health-check': 'haiku',
  'notification-format': 'haiku',
  'trust-score': 'haiku',
}

/** Model tier → actual model ID resolution */
interface ModelConfig {
  primary: string
  fallback: string
}

const MODEL_RESOLUTION: Record<ModelTier, ModelConfig> = {
  opus: { primary: 'claude-opus-4-6', fallback: 'gpt-4o' },
  sonnet: { primary: 'claude-sonnet-4-6', fallback: 'gpt-4o-mini' },
  haiku: { primary: 'claude-haiku-4-5', fallback: 'groq/llama-3.3-70b' },
}

/** Cost per 1K tokens (input/output) by tier */
const TIER_COSTS: Record<ModelTier, { inputPer1K: number; outputPer1K: number }> = {
  opus: { inputPer1K: 0.015, outputPer1K: 0.075 },
  sonnet: { inputPer1K: 0.003, outputPer1K: 0.015 },
  haiku: { inputPer1K: 0.0008, outputPer1K: 0.004 },
}

// ── Strategy Engine ─────────────────────────────────────────────────────

export class ModelStrategy {
  private overrides = new Map<TaskType, ModelTier>()

  /** Get the recommended model tier for a task type */
  getTier(task: TaskType): ModelTier {
    return this.overrides.get(task) ?? TASK_TIERS[task] ?? 'sonnet'
  }

  /** Resolve a task type to an actual model ID */
  resolveModel(task: TaskType, useFallback = false): string {
    const tier = this.getTier(task)
    const config = MODEL_RESOLUTION[tier]
    return useFallback ? config.fallback : config.primary
  }

  /** Override the tier for a specific task */
  setOverride(task: TaskType, tier: ModelTier): void {
    this.overrides.set(task, tier)
  }

  /** Clear all overrides */
  clearOverrides(): void {
    this.overrides.clear()
  }

  /** Estimate cost for a task given token counts */
  estimateCost(task: TaskType, inputTokens: number, outputTokens: number): number {
    const tier = this.getTier(task)
    const costs = TIER_COSTS[tier]
    return (inputTokens / 1000) * costs.inputPer1K + (outputTokens / 1000) * costs.outputPer1K
  }

  /** Get cost breakdown for a batch of tasks */
  estimateBatchCost(
    tasks: Array<{ task: TaskType; inputTokens: number; outputTokens: number }>
  ): { total: number; byTier: Record<ModelTier, { calls: number; cost: number }> } {
    const byTier: Record<ModelTier, { calls: number; cost: number }> = {
      opus: { calls: 0, cost: 0 },
      sonnet: { calls: 0, cost: 0 },
      haiku: { calls: 0, cost: 0 },
    }

    let total = 0
    for (const { task, inputTokens, outputTokens } of tasks) {
      const tier = this.getTier(task)
      const cost = this.estimateCost(task, inputTokens, outputTokens)
      byTier[tier].calls++
      byTier[tier].cost += cost
      total += cost
    }

    return { total, byTier }
  }

  /** Get all task-to-tier mappings */
  getAllMappings(): Record<TaskType, ModelTier> {
    const result = { ...TASK_TIERS }
    for (const [task, tier] of this.overrides) {
      result[task] = tier
    }
    return result
  }

  /** Get model resolution config */
  getModelConfig(): Record<ModelTier, ModelConfig> {
    return { ...MODEL_RESOLUTION }
  }
}
