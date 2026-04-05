/**
 * Brain REST API — Health Check (for SDK clients)
 *
 * GET /api/brain/health
 *
 * Returns Brain platform health status.
 * No auth required (health checks should be lightweight).
 */

export const dynamic = 'force-dynamic'

import { createDb } from '@solarc/db'
import { sql } from 'drizzle-orm'

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
    await db.execute(sql`SELECT 1`)

    return Response.json({
      status: 'ok',
      service: 'brain',
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - start,
      version: process.env.BRAIN_VERSION ?? '1.0.0',
      engines: ['llm', 'memory', 'guardrails', 'orchestration', 'a2a', 'healing', 'eval'],
    })
  } catch (err) {
    return Response.json(
      {
        status: 'error',
        error: 'Health check failed',
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - start,
      },
      { status: 503 },
    )
  }
}
