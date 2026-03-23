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

export { createBrainClient } from './client'
export type { BrainClient, BrainClientConfig } from './client'
export type { LLMEngine, ChatOptions, ChatMessage, EmbedOptions, EmbedResult } from './engines/llm'
export type { MemoryEngine, StoreOptions, SearchOptions, MemoryResult } from './engines/memory'
export type { OrchEngine, CreateTicketOptions, TicketResult } from './engines/orchestration'
export type { A2AEngine, DiscoverOptions, DelegateOptions, AgentInfo, DelegateResult } from './engines/a2a'
export type { HealingEngine, Incident, IncidentListener } from './engines/healing'
export type { EvalEngine, EvalRunOptions, EvalRunResult } from './engines/eval'
export type { GuardrailsEngine, GuardrailCheckOptions, GuardrailCheckResult } from './engines/guardrails'
export { RequestQueue } from './transport/queue'
export { RetryPolicy } from './transport/retry'
