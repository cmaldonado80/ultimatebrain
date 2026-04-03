/**
 * Relationship Detail API — get a single saved relationship.
 */

import { callBrainTRPC } from '@solarc/brain-client'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await callBrainTRPC('astrology.getRelationship', { id }, { method: 'query' })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Relationship not found' },
      { status: 404 },
    )
  }
}
