/**
 * @solarc/mini-brain-server — Real Mini Brain runtime
 *
 * A Hono-based HTTP server that:
 * - starts as an independent service
 * - knows its entity identity and domain
 * - connects to Brain via Brain SDK for shared services
 * - exposes domain-specific endpoints via route injection
 * - proxies LLM/memory requests to Brain for Developments
 */

import { serve } from '@hono/node-server'
import type { BrainClient } from '@solarc/brain-sdk'
import { createBrainClient } from '@solarc/brain-sdk'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

// ── Config ────────────────────────────────────────────────────────────

export interface MiniBrainConfig {
  entityId: string
  domain: string
  brainUrl: string
  brainApiKey: string
  databaseUrl?: string
  port?: number
}

// ── Domain Route ──────────────────────────────────────────────────────

export interface DomainRoute {
  method: 'get' | 'post'
  path: string
  handler: (c: HonoContext, brain: BrainClient) => Promise<Response>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HonoContext = any

// ── Server Factory ────────────────────────────────────────────────────

export function createMiniBrainServer(config: MiniBrainConfig, routes: DomainRoute[] = []) {
  // Validate config (fail fast)
  if (!config.entityId) throw new Error('[MiniBrain] entityId is required')
  if (!config.brainUrl) throw new Error('[MiniBrain] brainUrl is required')
  if (!config.brainApiKey) throw new Error('[MiniBrain] brainApiKey is required')
  if (!config.domain) throw new Error('[MiniBrain] domain is required')

  const app = new Hono()

  // Middleware
  app.use('*', cors())
  app.use('*', logger())

  // Brain SDK client
  const brain = createBrainClient({
    endpoint: config.brainUrl,
    apiKey: config.brainApiKey,
    domain: config.domain,
  })

  // ── Health ──────────────────────────────────────────────────────────

  app.get('/health', async (c) => {
    let brainStatus = 'unknown'
    try {
      const h = await brain.health()
      brainStatus = h.status
    } catch {
      brainStatus = 'unreachable'
    }
    return c.json({
      status: 'ok',
      domain: config.domain,
      entityId: config.entityId,
      brain: brainStatus,
    })
  })

  // ── Info ─────────────────────────────────────────────────────────────

  app.get('/info', (c) =>
    c.json({
      entityId: config.entityId,
      domain: config.domain,
      hasDatabase: !!config.databaseUrl,
    }),
  )

  // ── Domain Routes (injected) ────────────────────────────────────────

  for (const route of routes) {
    if (route.method === 'get') {
      app.get(route.path, (c) => route.handler(c, brain))
    } else {
      app.post(route.path, (c) => route.handler(c, brain))
    }
  }

  // ── Proxy Routes (Development → Mini Brain → Brain) ─────────────────

  app.post('/api/llm/chat', async (c) => {
    try {
      const body = await c.req.json()
      const result = await brain.llm.chat(body)
      return c.json(result)
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'LLM proxy failed' }, 502)
    }
  })

  app.post('/api/memory/search', async (c) => {
    try {
      const body = await c.req.json()
      const result = await brain.memory.search(body)
      return c.json({ results: result })
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Memory search failed' }, 502)
    }
  })

  app.post('/api/memory/store', async (c) => {
    try {
      const body = await c.req.json()
      const result = await brain.memory.store(body)
      return c.json(result)
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Memory store failed' }, 502)
    }
  })

  // ── Start ───────────────────────────────────────────────────────────

  return {
    app,
    brain,
    config,
    start: (port?: number) => {
      const p = port ?? config.port ?? 3100
      console.warn(`[MiniBrain:${config.domain}] entity=${config.entityId}`)
      console.warn(`[MiniBrain:${config.domain}] brain=${config.brainUrl}`)
      console.warn(`[MiniBrain:${config.domain}] Starting on port ${p}`)
      return serve({ fetch: app.fetch, port: p })
    },
  }
}
