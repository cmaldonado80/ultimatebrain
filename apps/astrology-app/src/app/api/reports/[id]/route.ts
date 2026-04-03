/**
 * Report Detail API — get a single saved report.
 */

import { callBrainTRPC } from '@solarc/brain-client'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookie = req.headers.get('cookie') ?? undefined
    const { id } = await params
    const result = await callBrainTRPC('astrology.getReport', { id }, { method: 'query', cookie })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Report not found' },
      { status: 404 },
    )
  }
}
