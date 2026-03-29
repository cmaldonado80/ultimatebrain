/**
 * Brain Client — main entry point
 *
 * Creates engine instances connected to the Brain platform.
 * Mini Brains use this to access shared Brain services.
 */

import { A2AEngine } from './engines/a2a'
import { EvalEngine } from './engines/eval'
import { GuardrailsEngine } from './engines/guardrails'
import { HealingEngine } from './engines/healing'
import { LLMEngine } from './engines/llm'
import { MemoryEngine } from './engines/memory'
import { OrchEngine } from './engines/orchestration'
import { RequestQueue } from './transport/queue'
import { RetryPolicy } from './transport/retry'

export interface BrainClientConfig {
  apiKey: string
  endpoint: string
  engines?: string[]
  domain?: string
  maxRetries?: number
  offlineQueue?: boolean
}

export interface HealthResponse {
  status: string
  service?: string
  engines?: string[]
  latencyMs?: number
  version?: string
}

export interface BrainClient {
  llm: LLMEngine
  memory: MemoryEngine
  orch: OrchEngine
  a2a: A2AEngine
  healing: HealingEngine
  eval: EvalEngine
  guardrails: GuardrailsEngine
  queue: RequestQueue
  health: () => Promise<HealthResponse>
  disconnect: () => void
}

export function createBrainClient(config: BrainClientConfig): BrainClient {
  const retry = new RetryPolicy({ maxRetries: config.maxRetries ?? 3 })
  const queue = new RequestQueue()
  const baseUrl = config.endpoint.replace(/\/$/, '')

  // HTTP fetch helper with auth (POST)
  const apiFetch = async (path: string, body: unknown): Promise<unknown> => {
    if (!queue.isOnline && config.offlineQueue) {
      queue.enqueue('POST', path, body)
      return { queued: true }
    }

    const url = `${baseUrl}${path}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...(config.domain ? { 'X-Brain-Domain': config.domain } : {}),
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Brain API error ${response.status}: ${text}`)
    }

    return response.json()
  }

  // Set up queue drain handler
  queue.setDrainHandler(async (req) => {
    await apiFetch(req.path, req.body)
  })

  // WebSocket URL for healing
  const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws/healing'

  // Build engines
  const llm = new LLMEngine(apiFetch, retry)
  const memory = new MemoryEngine(apiFetch, retry)
  const orch = new OrchEngine(apiFetch, retry)
  const a2a = new A2AEngine(apiFetch, retry)
  const healing = new HealingEngine(wsUrl)
  const evalEngine = new EvalEngine(apiFetch, retry)
  const guardrails = new GuardrailsEngine(apiFetch, retry)

  // Health check (GET, no auth required)
  const health = async (): Promise<HealthResponse> => {
    const response = await fetch(`${baseUrl}/health`)
    if (!response.ok) {
      throw new Error(`Brain health check failed: ${response.status}`)
    }
    return response.json() as Promise<HealthResponse>
  }

  return {
    llm,
    memory,
    orch,
    a2a,
    healing,
    eval: evalEngine,
    guardrails,
    queue,
    health,
    disconnect: () => {
      healing.disconnect()
    },
  }
}
