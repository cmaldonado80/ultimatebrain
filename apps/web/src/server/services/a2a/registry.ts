/**
 * A2A External Agent Registry
 *
 * Stores discovered external agents in agentCards table.
 * Runs periodic health checks and marks agents as healthy/unhealthy.
 * Provides the UI list of known external agents with status.
 */

import type { Database } from '@solarc/db'
import { agentCards, agents } from '@solarc/db'
import { eq } from 'drizzle-orm'
import { A2AClient, type DiscoveredAgent } from './client'
import type { WellKnownAgentCard } from './agent-card'

export interface ExternalAgentRecord {
  /** Synthetic UUID used as agentId in agentCards table */
  id: string
  url: string
  name: string
  description: string
  skills: string[]
  endpoint: string
  healthy: boolean | null
  lastHealthCheck: Date | null
  discoveredAt: Date
}

export class A2ARegistry {
  private client = new A2AClient()

  constructor(private db: Database) {}

  /**
   * Register an external agent by URL.
   * Discovers its well-known card and persists to DB.
   */
  async register(agentBaseUrl: string): Promise<ExternalAgentRecord> {
    const discovered = await this.client.discover(agentBaseUrl)
    return this.persist(agentBaseUrl, discovered)
  }

  /**
   * List all registered external agents with health status.
   */
  async list(): Promise<ExternalAgentRecord[]> {
    const cards = await this.db.query.agentCards.findMany()

    return cards
      .filter((c) => {
        const caps = (c.capabilities ?? {}) as Record<string, unknown>
        return caps['external'] === true
      })
      .map((c) => {
        const caps = (c.capabilities ?? {}) as Record<string, unknown>
        const auth = (c.authRequirements ?? {}) as Record<string, unknown>
        return {
          id: c.agentId,
          url: (caps['base_url'] as string) ?? '',
          name: (caps['name'] as string) ?? 'Unknown',
          description: (caps['description'] as string) ?? '',
          skills: (caps['skills'] as string[]) ?? [],
          endpoint: c.endpoint ?? '',
          healthy: (caps['healthy'] as boolean) ?? null,
          lastHealthCheck: caps['last_health_check']
            ? new Date(caps['last_health_check'] as string)
            : null,
          discoveredAt: c.updatedAt,
        }
      })
  }

  /**
   * Run health checks on all registered external agents.
   * Updates healthy status in DB. Intended for cron job.
   */
  async runHealthChecks(): Promise<{ checked: number; healthy: number; unhealthy: number }> {
    const records = await this.list()
    let healthy = 0
    let unhealthy = 0

    for (const record of records) {
      if (!record.url) continue

      const isHealthy = await this.client.healthCheck(record.url)
      isHealthy ? healthy++ : unhealthy++

      // Update health status in DB
      const card = await this.db.query.agentCards.findFirst({
        where: eq(agentCards.agentId, record.id),
      })
      if (card) {
        const caps = (card.capabilities ?? {}) as Record<string, unknown>
        await this.db
          .update(agentCards)
          .set({
            capabilities: {
              ...caps,
              healthy: isHealthy,
              last_health_check: new Date().toISOString(),
            },
            updatedAt: new Date(),
          })
          .where(eq(agentCards.agentId, record.id))
      }
    }

    return { checked: records.length, healthy, unhealthy }
  }

  /**
   * Deregister an external agent.
   */
  async deregister(agentId: string): Promise<void> {
    await this.db.delete(agentCards).where(eq(agentCards.agentId, agentId))
  }

  /**
   * Find external agents by skill.
   */
  async findBySkill(skill: string): Promise<ExternalAgentRecord[]> {
    const all = await this.list()
    return all.filter((r) =>
      r.skills.some((s) => s.toLowerCase().includes(skill.toLowerCase()))
    )
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private async persist(
    baseUrl: string,
    discovered: DiscoveredAgent
  ): Promise<ExternalAgentRecord> {
    const card = discovered.card
    // Use a deterministic ID based on the URL
    const id = await this.urlToId(baseUrl)

    await this.db
      .insert(agentCards)
      .values({
        agentId: id,
        capabilities: {
          external: true,
          base_url: baseUrl,
          name: card.name,
          description: card.description,
          skills: card.skills,
          streaming: card.capabilities.streaming,
          callbacks: card.capabilities.callbacks,
          long_running: card.capabilities.long_running,
          healthy: true,
          last_health_check: new Date().toISOString(),
        },
        authRequirements: card.auth,
        endpoint: card.endpoint,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: agentCards.agentId,
        set: {
          capabilities: {
            external: true,
            base_url: baseUrl,
            name: card.name,
            description: card.description,
            skills: card.skills,
            healthy: true,
            last_health_check: new Date().toISOString(),
          },
          endpoint: card.endpoint,
          updatedAt: new Date(),
        },
      })

    return {
      id,
      url: baseUrl,
      name: card.name,
      description: card.description,
      skills: card.skills,
      endpoint: card.endpoint,
      healthy: true,
      lastHealthCheck: new Date(),
      discoveredAt: new Date(),
    }
  }

  private async urlToId(url: string): Promise<string> {
    // Deterministic UUID v5-style from URL using Web Crypto
    const encoder = new TextEncoder()
    const data = encoder.encode(url)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    // Format as UUID
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      '4' + hex.slice(13, 16), // version 4
      ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
      hex.slice(20, 32),
    ].join('-')
  }
}
