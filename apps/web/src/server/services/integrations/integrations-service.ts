/**
 * Integrations Service
 *
 * External connectivity layer:
 * - Channels: communication channel management (slack, discord, email, etc.)
 * - Webhooks: inbound/outbound webhook dispatch
 * - Artifacts: generated output storage tied to tickets/agents
 * - Model fallbacks: per-agent fallback chain management
 */

import { createHmac } from 'node:crypto'
import type { Database } from '@solarc/db'
import { channels, webhooks, artifacts, modelFallbacks } from '@solarc/db'
import { eq, and, desc } from 'drizzle-orm'

// === Channels ===

export interface CreateChannelInput {
  type: string // 'slack', 'discord', 'email', 'api', 'webhook'
  config?: Record<string, unknown>
  enabled?: boolean
}

export class ChannelService {
  constructor(private db: Database) {}

  async create(input: CreateChannelInput) {
    const [ch] = await this.db.insert(channels).values({
      type: input.type,
      config: input.config,
      enabled: input.enabled ?? true,
    }).returning()
    return ch!
  }

  async get(id: string) {
    return this.db.query.channels.findFirst({ where: eq(channels.id, id) })
  }

  async list(enabledOnly = false) {
    return this.db.query.channels.findMany({
      where: enabledOnly ? eq(channels.enabled, true) : undefined,
    })
  }

  async toggle(id: string, enabled: boolean) {
    await this.db.update(channels).set({ enabled }).where(eq(channels.id, id))
  }

  async delete(id: string) {
    await this.db.delete(channels).where(eq(channels.id, id))
  }
}

// === Webhooks ===

export interface CreateWebhookInput {
  source?: string
  url: string
  secret?: string
  enabled?: boolean
}

export class WebhookService {
  constructor(private db: Database) {}

  async create(input: CreateWebhookInput) {
    const [wh] = await this.db.insert(webhooks).values({
      source: input.source,
      url: input.url,
      secret: input.secret,
      enabled: input.enabled ?? true,
    }).returning()
    return wh!
  }

  async list(enabledOnly = false) {
    return this.db.query.webhooks.findMany({
      where: enabledOnly ? eq(webhooks.enabled, true) : undefined,
    })
  }

  async toggle(id: string, enabled: boolean) {
    await this.db.update(webhooks).set({ enabled }).where(eq(webhooks.id, id))
  }

  async delete(id: string) {
    await this.db.delete(webhooks).where(eq(webhooks.id, id))
  }

  /**
   * Dispatch an event to all enabled webhooks matching a source filter.
   * Returns delivery results.
   */
  async dispatch(
    event: { type: string; payload: unknown },
    source?: string,
  ): Promise<Array<{ webhookId: string; success: boolean; statusCode?: number; error?: string }>> {
    const conditions = [eq(webhooks.enabled, true)]
    if (source) conditions.push(eq(webhooks.source, source))

    const targets = await this.db.query.webhooks.findMany({
      where: and(...conditions),
    })

    const results: Array<{ webhookId: string; success: boolean; statusCode?: number; error?: string }> = []

    for (const wh of targets) {
      try {
        const body = JSON.stringify(event)
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (wh.secret) {
          // HMAC-SHA256 signature for webhook verification (never send secret directly)
          const signature = createHmac('sha256', wh.secret).update(body).digest('hex')
          headers['X-Webhook-Signature'] = `sha256=${signature}`
        }

        const res = await fetch(wh.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(10_000),
        })

        results.push({
          webhookId: wh.id,
          success: res.ok,
          statusCode: res.status,
        })
      } catch (err) {
        results.push({
          webhookId: wh.id,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return results
  }
}

// === Artifacts ===

export interface CreateArtifactInput {
  name: string
  content?: string
  type?: string
  ticketId?: string
  agentId?: string
}

export class ArtifactService {
  constructor(private db: Database) {}

  async create(input: CreateArtifactInput) {
    const [artifact] = await this.db.insert(artifacts).values({
      name: input.name,
      content: input.content,
      type: input.type,
      ticketId: input.ticketId,
      agentId: input.agentId,
    }).returning()
    return artifact!
  }

  async get(id: string) {
    return this.db.query.artifacts.findFirst({ where: eq(artifacts.id, id) })
  }

  async listByTicket(ticketId: string) {
    return this.db.query.artifacts.findMany({
      where: eq(artifacts.ticketId, ticketId),
      orderBy: desc(artifacts.createdAt),
    })
  }

  async listByAgent(agentId: string) {
    return this.db.query.artifacts.findMany({
      where: eq(artifacts.agentId, agentId),
      orderBy: desc(artifacts.createdAt),
    })
  }

  async delete(id: string) {
    await this.db.delete(artifacts).where(eq(artifacts.id, id))
  }
}

// === Model Fallbacks ===

export class ModelFallbackService {
  constructor(private db: Database) {}

  async setChain(agentId: string, chain: string[]) {
    // Check existing
    const existing = await this.db.query.modelFallbacks.findFirst({
      where: eq(modelFallbacks.agentId, agentId),
    })

    if (existing) {
      await this.db.update(modelFallbacks).set({ chain })
        .where(eq(modelFallbacks.id, existing.id))
      return existing
    }

    const [fb] = await this.db.insert(modelFallbacks).values({
      agentId,
      chain,
    }).returning()
    return fb!
  }

  async getChain(agentId: string): Promise<string[]> {
    const row = await this.db.query.modelFallbacks.findFirst({
      where: eq(modelFallbacks.agentId, agentId),
    })
    return row?.chain ?? []
  }

  async listAll() {
    return this.db.query.modelFallbacks.findMany()
  }

  async delete(agentId: string) {
    await this.db.delete(modelFallbacks).where(eq(modelFallbacks.agentId, agentId))
  }

  /**
   * Resolve the next model in the fallback chain given a failed model.
   * Returns null if no more fallbacks available.
   */
  async resolveNext(agentId: string, failedModel: string): Promise<string | null> {
    const chain = await this.getChain(agentId)
    const idx = chain.indexOf(failedModel)
    if (idx === -1) return chain[0] ?? null // Not in chain, try first
    if (idx + 1 >= chain.length) return null // No more fallbacks
    return chain[idx + 1]!
  }
}
