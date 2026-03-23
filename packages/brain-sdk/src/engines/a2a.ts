/**
 * A2A Engine — agent discovery and delegation
 */

import type { RetryPolicy } from '../transport/retry'

export interface DiscoverOptions {
  capability?: string
  domain?: string
}

export interface AgentInfo {
  id: string
  name: string
  capabilities: string[]
  status: 'available' | 'busy' | 'offline'
  domain?: string
}

export interface DelegateOptions {
  agent_id: string
  task: string
  context?: Record<string, unknown>
  timeout?: number
}

export interface DelegateResult {
  taskId: string
  agentId: string
  status: 'completed' | 'pending' | 'failed'
  result?: unknown
  error?: string
}

export class A2AEngine {
  constructor(
    private fetch: (path: string, body: unknown) => Promise<unknown>,
    private retry: RetryPolicy
  ) {}

  async discover(options: DiscoverOptions = {}): Promise<AgentInfo[]> {
    return this.retry.execute(async () => {
      return this.fetch('/a2a/discover', options) as Promise<AgentInfo[]>
    })
  }

  async delegate(options: DelegateOptions): Promise<DelegateResult> {
    return this.retry.execute(async () => {
      return this.fetch('/a2a/delegate', options) as Promise<DelegateResult>
    })
  }

  async getTaskStatus(taskId: string): Promise<DelegateResult> {
    return this.retry.execute(async () => {
      return this.fetch('/a2a/tasks/status', { taskId }) as Promise<DelegateResult>
    })
  }
}
