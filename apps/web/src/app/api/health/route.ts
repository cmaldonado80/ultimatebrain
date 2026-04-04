import { createDb } from '@solarc/db'
import { sql } from 'drizzle-orm'

import { logger } from '../../../lib/logger'

export const dynamic = 'force-dynamic'

const startedAt = Date.now()

async function checkOllama(): Promise<{ status: string; latencyMs?: number; error?: string }> {
  const baseUrl = process.env.OLLAMA_BASE_URL
  if (!baseUrl) {
    return { status: 'skipped' }
  }

  const start = Date.now()
  try {
    const headers: Record<string, string> = {}
    if (process.env.OLLAMA_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.OLLAMA_API_KEY}`
    }

    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/tags`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      return { status: 'error', latencyMs: Date.now() - start, error: `HTTP ${res.status}` }
    }

    return { status: 'ok', latencyMs: Date.now() - start }
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function GET() {
  const start = Date.now()

  try {
    const url = process.env.DATABASE_URL
    if (!url) {
      return Response.json(
        { status: 'error', error: 'DATABASE_URL not set', timestamp: new Date().toISOString() },
        { status: 503 },
      )
    }

    const db = createDb(url)
    const dbStart = Date.now()
    await db.execute(sql`SELECT 1`)
    const dbLatencyMs = Date.now() - dbStart

    const ollama = await checkOllama()

    const overallStatus = ollama.status === 'error' ? 'degraded' : 'ok'

    return Response.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - start,
      version:
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? process.env.BRAIN_VERSION ?? '1.0.0',
      uptime_ms: Date.now() - startedAt,
      checks: {
        database: { status: 'ok', latencyMs: dbLatencyMs },
        ollama,
      },
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    logger.error(
      { err: err instanceof Error ? err : undefined, latencyMs: Date.now() - start },
      'health check failed',
    )
    return Response.json(
      {
        status: 'error',
        error,
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - start,
      },
      { status: 503 },
    )
  }
}
