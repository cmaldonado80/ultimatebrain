/**
 * Chart Detail API — get or delete a single chart.
 */

import { callBrainTRPC } from '@/lib/brain-api'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await callBrainTRPC('astrology.getChart', { id }, { method: 'query' })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Chart not found' },
      { status: 404 },
    )
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await callBrainTRPC('astrology.deleteChart', { id })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to delete' },
      { status: 500 },
    )
  }
}
