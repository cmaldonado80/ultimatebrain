/**
 * Reports Persistence API — save and list reports.
 */

import { callBrainTRPC } from '@solarc/brain-client'

export async function POST(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const body = await req.json()
    const result = await callBrainTRPC('astrology.createReport', body, { cookie })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to save report' },
      { status: 500 },
    )
  }
}

export async function GET(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const url = new URL(req.url)
    const chartId = url.searchParams.get('chartId') ?? undefined
    const result = await callBrainTRPC('astrology.listReports', chartId ? { chartId } : {}, {
      method: 'query',
      cookie,
    })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to load reports' },
      { status: 500 },
    )
  }
}
