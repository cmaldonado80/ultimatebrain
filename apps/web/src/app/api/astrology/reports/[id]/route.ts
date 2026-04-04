/**
 * Report Detail API — get a single saved report.
 */

import { callBrainTRPC } from '@solarc/brain-client'

import { logger } from '../../../../../lib/logger'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await callBrainTRPC('astrology.getReport', { id }, { method: 'query' })
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'get report failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
