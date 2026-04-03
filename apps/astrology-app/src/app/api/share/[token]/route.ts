/**
 * Shared Resource API — public endpoint for viewing shared reports/relationships.
 */

import { callBrainTRPC } from '@solarc/brain-client'

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
    return Response.json(
      { error: err instanceof Error ? err.message : 'Not found or revoked' },
      { status: 404 },
    )
  }
}
