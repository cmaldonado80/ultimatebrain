/**
 * Relationship Detail API — get a single saved relationship.
 */

import { callBrainTRPC } from '@solarc/brain-client'

import { logger } from '../../../../../lib/logger'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const { id } = await params
    const result = await callBrainTRPC(
      'astrology.getRelationship',
      { id },
      { method: 'query', cookie },
    )
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'get relationship failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
