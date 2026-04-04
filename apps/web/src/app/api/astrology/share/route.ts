/**
 * Share API — create a share link for a report or relationship.
 */

import { callBrainTRPC } from '@solarc/brain-client'

import { logger } from '../../../../lib/logger'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const result = await callBrainTRPC('astrology.createShareToken', body)
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'create share link failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
