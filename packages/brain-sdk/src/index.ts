/**
 * @solarc/brain-sdk
 *
 * TypeScript client SDK for the Solarc Brain platform.
 * Mini Brains and Developments connect UP to the Brain via this SDK.
 *
 * Features:
 * - Full TypeScript types (inferred from engine contracts)
 * - Streaming support (AsyncIterator for LLM responses)
 * - Auto-retry with exponential backoff
 * - WebSocket for real-time events (healing alerts, agent messages)
 * - Offline queue: buffer requests when Brain unreachable, replay on reconnect
 * - Lightweight: < 50KB minified, zero server-side dependencies
 */

export type { BrainClient, BrainClientConfig } from './client'
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
export type { ChatMessage, ChatOptions, EmbedOptions, EmbedResult, LLMEngine } from './engines/llm'
export type { MemoryEngine, MemoryResult, SearchOptions, StoreOptions } from './engines/memory'
export type { CreateTicketOptions, OrchEngine, TicketResult } from './engines/orchestration'
export { RequestQueue } from './transport/queue'
export { RetryPolicy } from './transport/retry'
