/**
 * Brain REST API — Guardrail Check
 *
 * POST /api/brain/guardrails/check
 *
 * Called by Mini Brains via Brain SDK.
 * Delegates to GuardrailEngine.check().
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createDb, type Database, waitForSchema } from '@solarc/db'

import { logger } from '../../../../../lib/logger'
import { GuardrailEngine } from '../../../../../server/services/guardrails/engine'
import { authenticateEntity } from '../../../../../server/services/platform/entity-auth'

let _db: Database | undefined
function getDb(): Database {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _db = createDb(url)
  }
  return _db
}

export async function POST(req: Request) {
  try {
    await authenticateEntity(req)
    await waitForSchema()

    const body = await req.json()
    const { input, agentId, rules } = body as {
      input: string
      agentId?: string
      rules?: string[]
    }

    if (!input || typeof input !== 'string') {
      return Response.json({ error: 'Missing required field: input' }, { status: 400 })
    }

    const db = getDb()
    const engine = new GuardrailEngine(db)
    const result = await engine.check(input, 'input', {
      agentId,
      policies: rules,
    })

    return Response.json({
      allowed: result.passed,
      violations: result.violations,
    })
  } catch (err) {
    const internal = err instanceof Error ? err.message : 'Unknown error'
    logger.warn({ err: err instanceof Error ? err : undefined }, 'Guardrail check failed')
    const status =
      internal.includes('Invalid API key') || internal.includes('Unauthorized') ? 401 : 500
    return Response.json(
      { error: status === 401 ? 'Unauthorized' : 'Guardrail check failed' },
      { status },
    )
  }
}
