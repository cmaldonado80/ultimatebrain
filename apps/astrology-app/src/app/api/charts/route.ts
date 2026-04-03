/**
 * Charts Persistence API — save and list charts.
 *
 * POST /api/charts — save a chart (calls Brain tRPC astrology.createChart)
 * GET /api/charts — list saved charts (calls Brain tRPC astrology.listCharts)
 */

import { callBrainTRPC } from '@solarc/brain-client'

export async function POST(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const body = await req.json()
    const result = await callBrainTRPC('astrology.createChart', body, { cookie })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to save chart' },
      { status: 500 },
    )
  }
}

export async function GET(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const result = await callBrainTRPC('astrology.listCharts', {}, { method: 'query', cookie })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to load charts' },
      { status: 500 },
    )
  }
}
