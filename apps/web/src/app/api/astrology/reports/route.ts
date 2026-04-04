/**
 * Reports Persistence API — save and list reports.
 */

import { callBrainTRPC } from '@solarc/brain-client'

import { logger } from '../../../../lib/logger'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const result = await callBrainTRPC('astrology.createReport', body)
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
    const result = await callBrainTRPC('astrology.listReports', chartId ? { chartId } : {}, {
      method: 'query',
    })
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'list reports failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
