/**
 * Engagement API — track user's last-seen state per chart.
 */

import { callBrainTRPC } from '@solarc/brain-client'

export async function GET(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const url = new URL(req.url)
    const chartId = url.searchParams.get('chartId')
    if (!chartId) return Response.json(null)
    const result = await callBrainTRPC(
      'astrology.getLastSeen',
      { chartId },
      { method: 'query', cookie },
    )
    return Response.json(result)
  } catch {
    return Response.json(null)
  }
}

export async function POST(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const body = await req.json()
    const result = await callBrainTRPC('astrology.updateLastSeen', body, { cookie })
    return Response.json(result)
  } catch {
    return Response.json(null)
  }
}
