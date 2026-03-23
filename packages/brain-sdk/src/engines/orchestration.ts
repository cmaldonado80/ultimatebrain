/**
 * Orchestration Engine — tickets, flows, task management
 */

import type { RetryPolicy } from '../transport/retry'

export interface CreateTicketOptions {
  title: string
  agent: string
  mode?: 'quick' | 'deep_work' | 'collaborative'
  priority?: 'low' | 'medium' | 'high' | 'critical'
  description?: string
}

export interface TicketResult {
  id: string
  title: string
  status: string
  agent: string
  createdAt: string
}

export class OrchEngine {
  constructor(
    private fetch: (path: string, body: unknown) => Promise<unknown>,
    private retry: RetryPolicy
  ) {}

  async createTicket(options: CreateTicketOptions): Promise<TicketResult> {
    return this.retry.execute(async () => {
      return this.fetch('/orch/tickets', options) as Promise<TicketResult>
    })
  }

  async getTicket(id: string): Promise<TicketResult> {
    return this.retry.execute(async () => {
      return this.fetch('/orch/tickets/get', { id }) as Promise<TicketResult>
    })
  }

  async listTickets(filters?: { agent?: string; status?: string }): Promise<TicketResult[]> {
    return this.retry.execute(async () => {
      return this.fetch('/orch/tickets/list', filters ?? {}) as Promise<TicketResult[]>
    })
  }
}
