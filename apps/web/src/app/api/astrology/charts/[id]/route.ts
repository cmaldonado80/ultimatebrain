/**
 * Chart Detail API — get or delete a single chart.
 */

import { callBrainTRPC } from '@solarc/brain-client'

import { logger } from '../../../../../lib/logger'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await callBrainTRPC('astrology.getChart', { id }, { method: 'query' })
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'get chart failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await callBrainTRPC('astrology.deleteChart', { id })
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'delete chart failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
