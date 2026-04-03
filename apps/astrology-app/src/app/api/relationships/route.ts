/**
 * Relationships Persistence API — save and list synastry analyses.
 */

import { callBrainTRPC } from '@solarc/brain-client'

export async function POST(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const body = await req.json()
    const result = await callBrainTRPC('astrology.createRelationship', body, { cookie })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to save relationship' },
      { status: 500 },
    )
  }
}

export async function GET(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const result = await callBrainTRPC(
      'astrology.listRelationships',
      {},
      { method: 'query', cookie },
    )
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to load relationships' },
      { status: 500 },
    )
  }
}
