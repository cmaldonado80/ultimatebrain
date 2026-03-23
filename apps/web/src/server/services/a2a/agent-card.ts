/**
 * Agent Card Generator
 *
 * Generates /.well-known/agent.json for each agent,
 * auto-populated from the agents table + skills column.
 *
 * Format:
 * {
 *   "name": "eng-frontend",
 *   "description": "Frontend engineering specialist",
 *   "endpoint": "https://solarc.example.com/api/a2a/eng-frontend",
 *   "skills": ["react", "typescript", "css", "testing"],
 *   "auth": { "type": "bearer", "token_url": "/api/auth/token" }
 * }
 */

import type { Database } from '@solarc/db'
import { agents, agentCards } from '@solarc/db'
import { eq } from 'drizzle-orm'

export interface WellKnownAgentCard {
  name: string
  description: string
  endpoint: string
  skills: string[]
  auth: {
    type: 'bearer' | 'none'
    token_url?: string
  }
  version: string
  capabilities: {
    streaming: boolean
    callbacks: boolean
    long_running: boolean
  }
  metadata?: Record<string, unknown>
}

export interface AgentCardGeneratorOptions {
  baseUrl: string
  authType?: 'bearer' | 'none'
  tokenUrl?: string
  version?: string
}

export class AgentCardGenerator {
  constructor(private db: Database) {}

  /**
   * Generate a well-known agent card for a single agent.
   */
  async generateForAgent(
    agentId: string,
    options: AgentCardGeneratorOptions
  ): Promise<WellKnownAgentCard> {
    const agent = await this.db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    })
    if (!agent) throw new Error(`Agent ${agentId} not found`)

    const card = await this.db.query.agentCards.findFirst({
      where: eq(agentCards.agentId, agentId),
    })

    const capabilities = (card?.capabilities ?? {}) as Record<string, unknown>
    const skills = this.extractSkills(agent, capabilities)

    return {
      name: agent.name,
      description: (capabilities.description as string) ?? `Brain agent: ${agent.name}`,
      endpoint: `${options.baseUrl}/api/a2a/${agentId}`,
      skills,
      auth: {
        type: options.authType ?? 'bearer',
        token_url: options.tokenUrl ?? `${options.baseUrl}/api/auth/token`,
      },
      version: options.version ?? '1.0.0',
      capabilities: {
        streaming: true,
        callbacks: true,
        long_running: true,
      },
      metadata: {
        agentId,
        status: agent.status,
        workspaceId: agent.workspaceId,
      },
    }
  }

  /**
   * Generate cards for all active agents.
   */
  async generateAll(
    options: AgentCardGeneratorOptions
  ): Promise<Record<string, WellKnownAgentCard>> {
    const allAgents = await this.db.query.agents.findMany({
      where: eq(agents.status, 'idle'),
    })

    const cards: Record<string, WellKnownAgentCard> = {}
    for (const agent of allAgents) {
      try {
        cards[agent.id] = await this.generateForAgent(agent.id, options)
      } catch (err) {
        console.warn(`[AgentCard] Failed to generate card for agent ${agent.id}:`, err)
      }
    }

    return cards
  }

  /**
   * Persist generated card to agentCards table.
   */
  async persistCard(agentId: string, card: WellKnownAgentCard): Promise<void> {
    await this.db
      .insert(agentCards)
      .values({
        agentId,
        capabilities: {
          description: card.description,
          skills: card.skills,
          streaming: card.capabilities.streaming,
          callbacks: card.capabilities.callbacks,
          long_running: card.capabilities.long_running,
        },
        authRequirements: card.auth,
        endpoint: card.endpoint,
      })
      .onConflictDoUpdate({
        target: agentCards.agentId,
        set: {
          capabilities: {
            description: card.description,
            skills: card.skills,
            streaming: card.capabilities.streaming,
            callbacks: card.capabilities.callbacks,
            long_running: card.capabilities.long_running,
          },
          authRequirements: card.auth,
          endpoint: card.endpoint,
          updatedAt: new Date(),
        },
      })
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private extractSkills(
    agent: typeof agents.$inferSelect,
    capabilities: Record<string, unknown>
  ): string[] {
    // Pull from capabilities.skills if set
    if (Array.isArray(capabilities.skills)) {
      return capabilities.skills.filter((s): s is string => typeof s === 'string')
    }

    // Fall back to agent type-based skill inference
    const role = (agent.type ?? '').toLowerCase()
    const inferred: string[] = []

    if (role.includes('frontend')) inferred.push('react', 'typescript', 'css', 'testing')
    if (role.includes('backend')) inferred.push('nodejs', 'typescript', 'postgres', 'api')
    if (role.includes('devops')) inferred.push('docker', 'kubernetes', 'ci-cd', 'monitoring')
    if (role.includes('data')) inferred.push('sql', 'python', 'analytics', 'ml')
    if (role.includes('product')) inferred.push('planning', 'prioritization', 'specs', 'ux')
    if (role.includes('architect')) inferred.push('design', 'patterns', 'review', 'scalability')
    if (inferred.length === 0) inferred.push('general-purpose')

    return inferred
  }
}
