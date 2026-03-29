/**
 * Relationships Persistence API — save and list synastry analyses.
 */

import { callBrainTRPC } from '@/lib/brain-api'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const result = await callBrainTRPC('astrology.createRelationship', body)
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to save relationship' },
      { status: 500 },
    )
  }
}

export async function GET() {
  try {
    const result = await callBrainTRPC('astrology.listRelationships', {}, { method: 'query' })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to load relationships' },
      { status: 500 },
    )
  }
}
