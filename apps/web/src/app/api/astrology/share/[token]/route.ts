/**
 * Shared Resource API — public endpoint for viewing shared reports/relationships.
 */

import { callBrainTRPC } from '@solarc/brain-client'

import { logger } from '../../../../../lib/logger'

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const { token } = await params
    const result = await callBrainTRPC(
      'astrology.getSharedResource',
      { token },
      { method: 'query', cookie },
    )
    return Response.json(result)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'get shared resource failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
