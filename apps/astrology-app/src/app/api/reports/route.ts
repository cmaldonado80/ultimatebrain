/**
 * Reports Persistence API — save and list reports.
 */

import { callBrainTRPC } from '@/lib/brain-api'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const result = await callBrainTRPC('astrology.createReport', body)
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
    const url = new URL(req.url)
    const chartId = url.searchParams.get('chartId') ?? undefined
    const result = await callBrainTRPC('astrology.listReports', chartId ? { chartId } : {}, {
      method: 'query',
    })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to load reports' },
      { status: 500 },
    )
  }
}
