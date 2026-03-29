/**
 * @solarc/mini-brain-server — Real Mini Brain runtime
 *
 * A Hono-based HTTP server that:
 * - starts as an independent service
 * - knows its entity identity and domain
 * - connects to Brain via Brain SDK for shared services
 * - exposes domain-specific endpoints via route injection
 * - proxies LLM/memory requests to Brain for Developments
 * - produces structured JSON logs
 * - reports degraded health when Brain is unreachable
 */

import { serve } from '@hono/node-server'
import type { BrainClient } from '@solarc/brain-sdk'
import { createBrainClient } from '@solarc/brain-sdk'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { createLogger } from './logger.js'

// ── Config ────────────────────────────────────────────────────────────

export interface MiniBrainConfig {
  entityId: string
  domain: string
  brainUrl: string
  brainApiKey: string
  appSecret?: string // shared secret for Development → Mini Brain auth
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

  const log = createLogger(`mini-brain:${config.domain}`)
  const app = new Hono()

  // Middleware: CORS
  app.use('*', cors())

  // Middleware: Request timing + structured logging + correlation IDs
  app.use('*', async (c, next) => {
    const start = Date.now()
    const requestId = c.req.header('x-request-id') ?? crypto.randomUUID()
    c.header('x-request-id', requestId)

    await next()

    const durationMs = Date.now() - start
    log.info('request', {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
    })
  })

  // Brain SDK client
  const brain = createBrainClient({
    endpoint: config.brainUrl,
    apiKey: config.brainApiKey,
    domain: config.domain,
  })

  // ── Health (with degraded state detection) ──────────────────────────

  app.get('/health', async (c) => {
    let brainStatus = 'unknown'
    let brainLatencyMs: number | null = null
    try {
      const start = Date.now()
      const h = await brain.health()
      brainLatencyMs = Date.now() - start
      brainStatus = h.status
    } catch {
      brainStatus = 'unreachable'
    }

    const overall = brainStatus === 'unreachable' ? 'degraded' : 'ok'

    return c.json({
      status: overall,
      domain: config.domain,
      entityId: config.entityId,
      dependencies: {
        brain: { status: brainStatus, latencyMs: brainLatencyMs },
      },
      uptime: Math.round(process.uptime()),
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

  // ── Auth Middleware (protects domain + proxy routes) ──────────────────

  const requireAppAuth: Parameters<typeof app.use>[1] = async (c, next) => {
    if (!config.appSecret) return next() // no secret = open (dev mode)
    const auth = c.req.header('authorization')
    if (!auth || auth !== `Bearer ${config.appSecret}`) {
      log.warn('auth_rejected', { path: c.req.path })
      return c.json({ error: 'Unauthorized — invalid or missing app secret' }, 401)
    }
    return next()
  }

  // ── Domain Routes (injected, auth-protected) ────────────────────────

  for (const route of routes) {
    if (route.method === 'get') {
      app.get(route.path, requireAppAuth, (c) => route.handler(c, brain))
    } else {
      app.post(route.path, requireAppAuth, (c) => route.handler(c, brain))
    }
  }

  // ── Proxy Routes (Development → Mini Brain → Brain, auth-protected) ─

  app.post('/api/llm/chat', requireAppAuth, async (c) => {
    try {
      const body = await c.req.json()
      const result = await brain.llm.chat(body)
      return c.json(result)
    } catch (err) {
      log.error('proxy_llm_failed', { error: err instanceof Error ? err.message : String(err) })
      return c.json({ error: err instanceof Error ? err.message : 'LLM proxy failed' }, 502)
    }
  })

  app.post('/api/memory/search', requireAppAuth, async (c) => {
    try {
      const body = await c.req.json()
      const result = await brain.memory.search(body)
      return c.json({ results: result })
    } catch (err) {
      log.error('proxy_memory_search_failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return c.json({ error: err instanceof Error ? err.message : 'Memory search failed' }, 502)
    }
  })

  app.post('/api/memory/store', requireAppAuth, async (c) => {
    try {
      const body = await c.req.json()
      const result = await brain.memory.store(body)
      return c.json(result)
    } catch (err) {
      log.error('proxy_memory_store_failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return c.json({ error: err instanceof Error ? err.message : 'Memory store failed' }, 502)
    }
  })

  // ── Start ───────────────────────────────────────────────────────────

  return {
    app,
    brain,
    config,
    start: async (port?: number) => {
      const p = port ?? config.port ?? 3100
      log.info('starting', { entityId: config.entityId, brainUrl: config.brainUrl, port: p })

      // Startup validation: check Brain connectivity (warn, don't crash)
      try {
        const h = await brain.health()
        log.info('brain_connected', { status: h.status })
      } catch {
        log.error('brain_unreachable', {
          url: config.brainUrl,
          note: 'domain-local requests will still work',
        })
      }

      log.info('ready', { port: p, domain: config.domain })
      return serve({ fetch: app.fetch, port: p })
    },
  }
}
