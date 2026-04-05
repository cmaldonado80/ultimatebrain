/**
 * Engagement API — track user's last-seen state per chart.
 */

import { callBrainTRPC } from '@solarc/brain-client'

import { logger } from '../../../../lib/logger'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const chartId = url.searchParams.get('chartId')
    if (!chartId) return Response.json(null)
    const cookie = req.headers.get('cookie') ?? undefined
    const result = await callBrainTRPC(
      'astrology.getLastSeen',
      { chartId },
      { method: 'query', cookie },
    )
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'get last seen failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const body = await req.json()
    const result = await callBrainTRPC('astrology.updateLastSeen', body, { cookie })
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'update last seen failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
