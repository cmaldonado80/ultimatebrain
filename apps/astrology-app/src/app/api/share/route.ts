/**
 * Share API — create a share link for a report or relationship.
 */

import { callBrainTRPC } from '@solarc/brain-client'

export async function POST(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const body = await req.json()
    const result = await callBrainTRPC('astrology.createShareToken', body, { cookie })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to create share link' },
      { status: 500 },
    )
  }
}
