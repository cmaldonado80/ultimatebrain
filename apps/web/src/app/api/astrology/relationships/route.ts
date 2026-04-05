/**
 * Relationships Persistence API — save and list synastry analyses.
 */

import { callBrainTRPC } from '@solarc/brain-client'

import { logger } from '../../../../lib/logger'

export async function POST(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const body = await req.json()
    const result = await callBrainTRPC('astrology.createRelationship', body, { cookie })
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'create relationship failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const result = await callBrainTRPC(
      'astrology.listRelationships',
      {},
      { method: 'query', cookie },
    )
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'list relationships failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
