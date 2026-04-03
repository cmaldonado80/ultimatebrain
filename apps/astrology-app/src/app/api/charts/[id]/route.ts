/**
 * Chart Detail API — get or delete a single chart.
 */

import { callBrainTRPC } from '@solarc/brain-client'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const { id } = await params
    const result = await callBrainTRPC('astrology.getChart', { id }, { method: 'query', cookie })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Chart not found' },
      { status: 404 },
    )
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const { id } = await params
    const result = await callBrainTRPC('astrology.deleteChart', { id }, { cookie })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to delete' },
      { status: 500 },
    )
  }
}
