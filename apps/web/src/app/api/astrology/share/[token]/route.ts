/**
 * Shared Resource API — public endpoint for viewing shared reports/relationships.
 */

import { callBrainTRPC } from '../../../../../lib/astrology/brain-api'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const result = await callBrainTRPC(
      'astrology.getSharedResource',
      { token },
      { method: 'query' },
    )
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Not found or revoked' },
      { status: 404 },
    )
  }
}
