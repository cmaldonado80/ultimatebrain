/**
 * @solarc/brain-sdk
 *
 * TypeScript client SDK for the Solarc Brain platform.
 * Mini Brains and Developments connect UP to the Brain via this SDK.
 */

export type { BrainClient, BrainClientConfig, HealthResponse } from './client'
export { createBrainClient } from './client'
export type {
  A2AEngine,
  AgentInfo,
  DelegateOptions,
  DelegateResult,
  DiscoverOptions,
} from './engines/a2a'
export type { EvalEngine, EvalRunOptions, EvalRunResult } from './engines/eval'
export type {
  GuardrailCheckOptions,
  GuardrailCheckResult,
  GuardrailsEngine,
} from './engines/guardrails'
export type { HealingEngine, Incident, IncidentListener } from './engines/healing'
export type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  EmbedOptions,
  EmbedResult,
  LLMEngine,
} from './engines/llm'
export type {
  MemoryEngine,
  MemoryResult,
  MemoryTier,
  SearchOptions,
  StoreOptions,
} from './engines/memory'
export type { CreateTicketOptions, OrchEngine, TicketResult } from './engines/orchestration'
export { RequestQueue } from './transport/queue'
export { RetryPolicy } from './transport/retry'
