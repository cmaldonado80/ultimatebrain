/**
 * Reports Persistence API — save and list reports.
 */

import { callBrainTRPC } from '@solarc/brain-client'

import { logger } from '../../../../lib/logger'

export async function POST(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const body = await req.json()
    const result = await callBrainTRPC('astrology.createReport', body, { cookie })
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'create report failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const chartId = url.searchParams.get('chartId') ?? undefined
    const cookie = req.headers.get('cookie') ?? undefined
    const result = await callBrainTRPC('astrology.listReports', chartId ? { chartId } : {}, {
      method: 'query',
      cookie,
    })
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'list reports failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
