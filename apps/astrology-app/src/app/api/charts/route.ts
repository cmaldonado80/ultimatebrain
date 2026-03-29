/**
 * Charts Persistence API — save and list charts.
 *
 * POST /api/charts — save a chart (calls Brain tRPC astrology.createChart)
 * GET /api/charts — list saved charts (calls Brain tRPC astrology.listCharts)
 */

import { callBrainTRPC } from '@/lib/brain-api'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const result = await callBrainTRPC('astrology.createChart', body)
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to save chart' },
      { status: 500 },
    )
  }
}

export async function GET() {
  try {
    const result = await callBrainTRPC('astrology.listCharts', {}, { method: 'query' })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to load charts' },
      { status: 500 },
    )
  }
}
