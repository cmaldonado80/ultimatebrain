/**
 * A2A External Agent Client
 *
 * Discovers external agents via /.well-known/agent.json
 * and invokes them as tools available inside the Crew engine.
 *
 * Tool exposed to crews: external_agent(agent_url, task)
 */

import type { WellKnownAgentCard } from './agent-card'

export interface A2ATaskRequest {
  task: string
  context?: Record<string, unknown>
  callback_url?: string
}

export interface A2ATaskResponse {
  status: 'accepted' | 'running' | 'completed' | 'failed'
  task_id?: string
  result?: unknown
  artifacts?: A2AArtifact[]
  error?: string
  progress?: number
}

export interface A2AArtifact {
  type: string
  content: unknown
  mimeType?: string
  name?: string
}

export interface DiscoveredAgent {
  url: string
  card: WellKnownAgentCard
  discoveredAt: Date
  lastHealthCheck?: Date
  healthy?: boolean
}

export class A2AClient {
  private discoveryCache = new Map<string, DiscoveredAgent>()

  /**
   * Discover an external agent by fetching its /.well-known/agent.json.
   * Caches result for the session.
   */
  async discover(agentBaseUrl: string): Promise<DiscoveredAgent> {
    const cached = this.discoveryCache.get(agentBaseUrl)
    if (cached) return cached

    const wellKnownUrl = `${agentBaseUrl.replace(/\/$/, '')}/.well-known/agent.json`

    const response = await fetch(wellKnownUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to discover agent at ${agentBaseUrl}: ${response.status} ${response.statusText}`
      )
    }

    const card = (await response.json()) as WellKnownAgentCard

    const discovered: DiscoveredAgent = {
      url: agentBaseUrl,
      card,
      discoveredAt: new Date(),
      healthy: true,
    }

    this.discoveryCache.set(agentBaseUrl, discovered)
    return discovered
  }

  /**
   * Invoke an external agent with a task.
   * Handles bearer auth if required by the agent card.
   */
  async invoke(
    agentUrl: string,
    request: A2ATaskRequest,
    authToken?: string
  ): Promise<A2ATaskResponse> {
    let agent: DiscoveredAgent
    try {
      agent = await this.discover(agentUrl)
    } catch (err) {
      return {
        status: 'failed',
        error: `Discovery failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    if (agent.card.auth.type === 'bearer' && authToken) {
      headers['Authorization'] = `Bearer ${authToken}`
    }

    try {
      const response = await fetch(agent.card.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(30_000),
      })

      if (!response.ok) {
        return {
          status: 'failed',
          error: `Agent returned ${response.status}: ${await response.text()}`,
        }
      }

      return (await response.json()) as A2ATaskResponse
    } catch (err) {
      return {
        status: 'failed',
        error: `Invocation failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  /**
   * Poll for task completion if agent returned status=accepted/running.
   */
  async poll(
    agentUrl: string,
    taskId: string,
    authToken?: string,
    options: { maxAttempts?: number; intervalMs?: number } = {}
  ): Promise<A2ATaskResponse> {
    const { maxAttempts = 30, intervalMs = 2000 } = options

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const pollUrl = `${agentUrl.replace(/\/$/, '')}/api/a2a/tasks/${taskId}`

      const headers: Record<string, string> = { Accept: 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`

      const response = await fetch(pollUrl, { headers, signal: AbortSignal.timeout(5000) })
      if (!response.ok) {
        return { status: 'failed', error: `Poll returned ${response.status}` }
      }

      const result = (await response.json()) as A2ATaskResponse
      if (result.status === 'completed' || result.status === 'failed') {
        return result
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }

    return { status: 'failed', error: `Polling timed out after ${maxAttempts} attempts` }
  }

  /**
   * Invoke and wait for completion (invoke + poll if needed).
   */
  async invokeAndWait(
    agentUrl: string,
    request: A2ATaskRequest,
    authToken?: string
  ): Promise<A2ATaskResponse> {
    const initial = await this.invoke(agentUrl, request, authToken)

    if (initial.status === 'completed' || initial.status === 'failed') {
      return initial
    }

    if (initial.task_id && (initial.status === 'accepted' || initial.status === 'running')) {
      return this.poll(agentUrl, initial.task_id, authToken)
    }

    return initial
  }

  /**
   * Health check a known external agent.
   */
  async healthCheck(agentBaseUrl: string): Promise<boolean> {
    try {
      await this.discover(agentBaseUrl)
      // Invalidate cache to force re-fetch
      this.discoveryCache.delete(agentBaseUrl)
      await this.discover(agentBaseUrl)

      const cached = this.discoveryCache.get(agentBaseUrl)
      if (cached) cached.lastHealthCheck = new Date()

      return true
    } catch {
      const cached = this.discoveryCache.get(agentBaseUrl)
      if (cached) {
        cached.healthy = false
        cached.lastHealthCheck = new Date()
      }
      return false
    }
  }

  /**
   * Returns the external_agent tool definition for use inside CrewEngine.
   */
  externalAgentTool(authToken?: string) {
    const client = this
    return {
      name: 'external_agent',
      description:
        'Invoke an external agent via the A2A protocol. Discovers the agent, sends a task, and waits for the result.',
      parameters: {
        agent_url: {
          type: 'string',
          description: 'Base URL of the external agent (e.g. https://other-brain.example.com)',
          required: true,
        },
        task: {
          type: 'string',
          description: 'The task description to send to the external agent',
          required: true,
        },
        context: {
          type: 'object',
          description: 'Optional context to pass along with the task',
        },
      },
      execute: async (args: Record<string, unknown>) => {
        const result = await client.invokeAndWait(
          String(args.agent_url),
          {
            task: String(args.task),
            context: (args.context as Record<string, unknown>) ?? {},
          },
          authToken
        )
        if (result.status === 'failed') {
          return `External agent failed: ${result.error}`
        }
        return result.result ?? result.artifacts ?? 'Task completed (no output)'
      },
    }
  }
}
