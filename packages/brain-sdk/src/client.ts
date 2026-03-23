/**
 * Brain Client — main entry point
 *
 * Creates engine instances connected to the Brain platform.
 */

import { LLMEngine } from './engines/llm'
import { MemoryEngine } from './engines/memory'
import { OrchEngine } from './engines/orchestration'
import { A2AEngine } from './engines/a2a'
import { HealingEngine } from './engines/healing'
import { EvalEngine } from './engines/eval'
import { GuardrailsEngine } from './engines/guardrails'
import { RetryPolicy } from './transport/retry'
import { RequestQueue } from './transport/queue'

export interface BrainClientConfig {
  apiKey: string
  endpoint: string
  engines: string[]
  domain?: string
  /** Retry options */
  maxRetries?: number
  /** Enable offline queue */
  offlineQueue?: boolean
}

export interface BrainClient {
  llm: LLMEngine
  memory: MemoryEngine
  orch: OrchEngine
  a2a: A2AEngine
  healing: HealingEngine
  eval: EvalEngine
  guardrails: GuardrailsEngine
  /** Offline request queue */
  queue: RequestQueue
  /** Disconnect all real-time connections */
  disconnect: () => void
}

export function createBrainClient(config: BrainClientConfig): BrainClient {
  const retry = new RetryPolicy({ maxRetries: config.maxRetries ?? 3 })
  const queue = new RequestQueue()

  // HTTP fetch helper with auth
  const apiFetch = async (path: string, body: unknown): Promise<unknown> => {
    if (!queue.isOnline && config.offlineQueue) {
      queue.enqueue('POST', path, body)
      return { queued: true }
    }

    const url = `${config.endpoint.replace(/\/$/, '')}${path}`
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
  const wsUrl = config.endpoint.replace(/^http/, 'ws') + '/ws/healing'

  // Build engines (only instantiate requested ones, but always expose all)
  const llm = new LLMEngine(apiFetch, retry)
  const memory = new MemoryEngine(apiFetch, retry)
  const orch = new OrchEngine(apiFetch, retry)
  const a2a = new A2AEngine(apiFetch, retry)
  const healing = new HealingEngine(wsUrl)
  const evalEngine = new EvalEngine(apiFetch, retry)
  const guardrails = new GuardrailsEngine(apiFetch, retry)

  return {
    llm,
    memory,
    orch,
    a2a,
    healing,
    eval: evalEngine,
    guardrails,
    queue,
    disconnect: () => {
      healing.disconnect()
    },
  }
}
