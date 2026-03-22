/**
 * AI Gateway Router — the central nervous system for all LLM calls.
 *
 * Accept: { model, messages, agent_id, ticket_id, stream? }
 * 1. Resolve provider from model name
 * 2. Check circuit breaker state
 * 3. If open: try next in fallback chain
 * 4. Check rate limits
 * 5. Check semantic cache
 * 6. Route through OpenClaw (primary) or direct fallback
 * 7. Record metrics + cost
 * 8. Cache response if cacheable
 */

import type { LlmChatInput, LlmChatOutput } from '@solarc/engine-contracts'
import type { Database } from '@solarc/db'
import { CircuitBreakerRegistry } from './circuit-breaker'
import { CostTracker } from './cost-tracker'
import { RateLimiter } from './rate-limiter'
import { SemanticCache, shouldSkipCache } from './cache'
import { KeyVault } from './key-vault'

// === Provider Resolution ===

export type ProviderName = 'anthropic' | 'openai' | 'google' | 'ollama' | 'openclaw'

interface ResolvedProvider {
  provider: ProviderName
  model: string
}

const MODEL_TO_PROVIDER: Record<string, ProviderName> = {
  // Anthropic
  'claude-opus-4-6': 'anthropic',
  'claude-sonnet-4-6': 'anthropic',
  'claude-haiku-4-5': 'anthropic',
  // OpenAI
  'gpt-4o': 'openai',
  'gpt-4o-mini': 'openai',
  'gpt-4.1': 'openai',
  'gpt-4.1-mini': 'openai',
  'gpt-4.1-nano': 'openai',
  'o3': 'openai',
  'o3-mini': 'openai',
  'o4-mini': 'openai',
  // Google
  'gemini-2.5-pro': 'google',
  'gemini-2.5-flash': 'google',
  'gemini-2.0-flash': 'google',
}

/** Default fallback chains when a provider is down */
const DEFAULT_FALLBACKS: Record<ProviderName, ProviderName[]> = {
  anthropic: ['openai', 'google', 'ollama'],
  openai: ['anthropic', 'google', 'ollama'],
  google: ['anthropic', 'openai', 'ollama'],
  ollama: ['anthropic', 'openai'],
  openclaw: ['anthropic', 'openai', 'google'],
}

/** Map to equivalent model on fallback provider */
const MODEL_EQUIVALENTS: Record<string, Record<ProviderName, string>> = {
  'claude-sonnet-4-6': {
    anthropic: 'claude-sonnet-4-6',
    openai: 'gpt-4o',
    google: 'gemini-2.5-pro',
    ollama: 'qwen3:8b',
    openclaw: 'claude-sonnet-4-6',
  },
  'claude-opus-4-6': {
    anthropic: 'claude-opus-4-6',
    openai: 'gpt-4.1',
    google: 'gemini-2.5-pro',
    ollama: 'qwen3:32b',
    openclaw: 'claude-opus-4-6',
  },
  'claude-haiku-4-5': {
    anthropic: 'claude-haiku-4-5',
    openai: 'gpt-4o-mini',
    google: 'gemini-2.5-flash',
    ollama: 'qwen3:4b',
    openclaw: 'claude-haiku-4-5',
  },
  'gpt-4o': {
    anthropic: 'claude-sonnet-4-6',
    openai: 'gpt-4o',
    google: 'gemini-2.5-pro',
    ollama: 'qwen3:8b',
    openclaw: 'gpt-4o',
  },
}

function resolveProvider(model: string): ResolvedProvider {
  // Check for Ollama models (contain colon or ollama/ prefix)
  if (model.includes(':') || model.startsWith('ollama/')) {
    return { provider: 'ollama', model }
  }

  const provider = MODEL_TO_PROVIDER[model]
  if (!provider) {
    // Default to OpenClaw for unknown models (it supports 20+ providers)
    return { provider: 'openclaw', model }
  }

  return { provider, model }
}

function getEquivalentModel(originalModel: string, targetProvider: ProviderName): string {
  const equivalents = MODEL_EQUIVALENTS[originalModel]
  if (equivalents?.[targetProvider]) return equivalents[targetProvider]
  // No mapping — the target provider will use its default
  return originalModel
}

// === Provider Adapters ===

export interface ProviderAdapter {
  chat(params: {
    model: string
    messages: Array<{ role: string; content: string }>
    tools?: unknown[]
    apiKey?: string
  }): Promise<{
    content: string
    tokensIn: number
    tokensOut: number
  }>

  embed?(params: {
    text: string
    model?: string
    apiKey?: string
  }): Promise<{
    embedding: number[]
    dimensions: number
  }>
}

// === Gateway Router ===

export interface GatewayConfig {
  /** Primary routing strategy */
  primaryRoute: 'openclaw' | 'direct'
  /** Default model when none specified */
  defaultModel: string
  /** Enable semantic cache */
  cacheEnabled: boolean
}

const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  primaryRoute: 'openclaw',
  defaultModel: 'claude-sonnet-4-6',
  cacheEnabled: true,
}

export class GatewayRouter {
  readonly circuitBreaker: CircuitBreakerRegistry
  readonly costTracker: CostTracker
  readonly rateLimiter: RateLimiter
  readonly cache: SemanticCache
  readonly keyVault: KeyVault
  private adapters = new Map<ProviderName, ProviderAdapter>()
  private config: GatewayConfig

  constructor(
    private db: Database,
    config?: Partial<GatewayConfig>,
  ) {
    this.config = { ...DEFAULT_GATEWAY_CONFIG, ...config }
    this.circuitBreaker = new CircuitBreakerRegistry()
    this.costTracker = new CostTracker(db)
    this.rateLimiter = new RateLimiter()
    this.cache = new SemanticCache(db)
    this.keyVault = new KeyVault(db)
  }

  /** Register a provider adapter (OpenClaw, direct Anthropic, etc.) */
  registerAdapter(provider: ProviderName, adapter: ProviderAdapter): void {
    this.adapters.set(provider, adapter)
  }

  /**
   * Main entry point: route an LLM chat request through the gateway.
   */
  async chat(input: LlmChatInput): Promise<LlmChatOutput> {
    const startTime = Date.now()
    const model = input.model ?? this.config.defaultModel
    const messages = input.messages

    // 1. Check rate limits
    const rateCheck = this.rateLimiter.tryConsume({
      agentId: input.agentId,
      estimatedTokens: this.estimateTokens(messages),
    })
    if (!rateCheck.allowed) {
      throw new GatewayError(
        'RATE_LIMITED',
        `Rate limited. Retry after ${rateCheck.retryAfterMs}ms`,
        { retryAfterMs: rateCheck.retryAfterMs },
      )
    }

    // 2. Check budget
    if (input.agentId) {
      const budget = await this.costTracker.checkBudget(input.agentId)
      if (!budget.allowed) {
        throw new GatewayError('BUDGET_EXCEEDED', `Agent budget exceeded. Remaining: $${budget.remainingUsd.toFixed(2)}`)
      }
    }

    // 3. Check semantic cache (skip for streaming / tool-use)
    if (this.config.cacheEnabled && !shouldSkipCache({ stream: input.stream, tools: input.tools, messages })) {
      const cached = await this.cache.lookup(model, messages)
      if (cached) {
        // Record cache hit metric
        const latencyMs = Date.now() - startTime
        await this.costTracker.record({
          provider: 'cache',
          model: cached.model,
          agentId: input.agentId,
          ticketId: input.ticketId,
          tokensIn: cached.tokensIn,
          tokensOut: cached.tokensOut,
          latencyMs,
          cached: true,
        })

        return {
          content: cached.response,
          model: cached.model,
          provider: 'cache',
          tokensIn: cached.tokensIn,
          tokensOut: cached.tokensOut,
          latencyMs,
          costUsd: 0,
          cached: true,
        }
      }
    }

    // 4. Resolve provider + attempt with circuit breaking and fallbacks
    const resolved = resolveProvider(model)
    const providers = this.buildProviderChain(resolved.provider, model)

    let lastError: Error | null = null

    for (const { provider, targetModel } of providers) {
      // Check circuit breaker
      if (!this.circuitBreaker.canRequest(provider)) {
        continue
      }

      const adapter = this.adapters.get(provider)
      if (!adapter) continue

      try {
        // Get API key for provider
        const apiKey = await this.keyVault.getKey(provider)

        const result = await adapter.chat({
          model: targetModel,
          messages,
          tools: input.tools as unknown[],
          apiKey: apiKey ?? undefined,
        })

        // Record success
        this.circuitBreaker.recordSuccess(provider)
        const latencyMs = Date.now() - startTime
        const costResult = await this.costTracker.record({
          provider,
          model: targetModel,
          agentId: input.agentId,
          ticketId: input.ticketId,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          latencyMs,
          cached: false,
        })

        // Store in cache (async, don't block response)
        if (this.config.cacheEnabled && !shouldSkipCache({ stream: input.stream, tools: input.tools, messages })) {
          this.cache.store(targetModel, messages, result.content, result.tokensIn, result.tokensOut).catch(() => {
            // Cache write failure is non-fatal
          })
        }

        return {
          content: result.content,
          model: targetModel,
          provider,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          latencyMs,
          costUsd: costResult.costUsd,
          cached: false,
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        this.circuitBreaker.recordFailure(provider)

        // Record error metric
        await this.costTracker.record({
          provider,
          model: targetModel,
          agentId: input.agentId,
          ticketId: input.ticketId,
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: Date.now() - startTime,
          cached: false,
          error: lastError.message,
        })
      }
    }

    // All providers failed
    throw new GatewayError(
      'ALL_PROVIDERS_FAILED',
      `All providers failed for model ${model}. Last error: ${lastError?.message}`,
    )
  }

  /**
   * Embed text — routes to embedding provider with fallback.
   */
  async embed(text: string, model?: string): Promise<{ embedding: number[]; model: string; dimensions: number }> {
    const embedModel = model ?? 'text-embedding-3-small'
    const providers: ProviderName[] = ['openai', 'anthropic', 'google']

    for (const provider of providers) {
      if (!this.circuitBreaker.canRequest(provider)) continue

      const adapter = this.adapters.get(provider)
      if (!adapter?.embed) continue

      try {
        const apiKey = await this.keyVault.getKey(provider)
        const result = await adapter.embed({ text, model: embedModel, apiKey: apiKey ?? undefined })
        this.circuitBreaker.recordSuccess(provider)
        return { ...result, model: embedModel }
      } catch (err) {
        this.circuitBreaker.recordFailure(provider)
      }
    }

    throw new GatewayError('ALL_PROVIDERS_FAILED', 'No embedding provider available')
  }

  /** Build ordered list of providers to try (primary + fallbacks) */
  private buildProviderChain(
    primary: ProviderName,
    originalModel: string,
  ): Array<{ provider: ProviderName; targetModel: string }> {
    const chain: Array<{ provider: ProviderName; targetModel: string }> = [
      { provider: primary, targetModel: originalModel },
    ]

    const fallbacks = DEFAULT_FALLBACKS[primary] ?? []
    for (const fallbackProvider of fallbacks) {
      chain.push({
        provider: fallbackProvider,
        targetModel: getEquivalentModel(originalModel, fallbackProvider),
      })
    }

    return chain
  }

  /** Rough token estimate: ~4 chars per token */
  private estimateTokens(messages: Array<{ role: string; content: string }>): number {
    let chars = 0
    for (const m of messages) {
      chars += m.content.length + m.role.length + 4
    }
    return Math.ceil(chars / 4)
  }

  /** Health check: return circuit breaker states for all providers */
  getHealth(): Record<string, { state: string; failures: number }> {
    const health: Record<string, { state: string; failures: number }> = {}
    for (const provider of ['anthropic', 'openai', 'google', 'ollama', 'openclaw'] as ProviderName[]) {
      const state = this.circuitBreaker.getState(provider)
      health[provider] = { state: state.state, failures: state.failures }
    }
    return health
  }
}

// === Error Types ===

export type GatewayErrorCode = 'RATE_LIMITED' | 'BUDGET_EXCEEDED' | 'ALL_PROVIDERS_FAILED' | 'CIRCUIT_OPEN'

export class GatewayError extends Error {
  constructor(
    public code: GatewayErrorCode,
    message: string,
    public metadata?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'GatewayError'
  }
}
