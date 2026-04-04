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
    const body = await req.json()
    const result = await callBrainTRPC('astrology.createChart', body)
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'create chart failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const result = await callBrainTRPC('astrology.listCharts', {}, { method: 'query' })
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'list charts failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
