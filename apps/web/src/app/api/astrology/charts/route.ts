/**
 * Charts Persistence API — save and list charts.
 *
 * POST /api/charts — save a chart (calls Brain tRPC astrology.createChart)
 * GET /api/charts — list saved charts (calls Brain tRPC astrology.listCharts)
 */

import { callBrainTRPC } from '@solarc/brain-client'

import { logger } from '../../../../lib/logger'

export async function POST(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const body = await req.json()
    const result = await callBrainTRPC('astrology.createChart', body, { cookie })
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'create chart failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const result = await callBrainTRPC('astrology.listCharts', {}, { method: 'query', cookie })
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'list charts failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
