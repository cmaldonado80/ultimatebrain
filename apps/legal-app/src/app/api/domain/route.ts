/**
 * Server-Side Proxy — Development → Legal Mini Brain
 *
 * POST /api/domain
 *
 * Browser calls this. Server adds auth and forwards to Mini Brain.
 * Mini Brain URL and secrets never reach the browser.
 */

const BRAIN_URL = process.env.LEGAL_BRAIN_URL ?? 'http://localhost:3157'
const BRAIN_SECRET = process.env.LEGAL_BRAIN_SECRET ?? ''

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const res = await fetch(`${BRAIN_URL}/legal/contract-review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(BRAIN_SECRET ? { Authorization: `Bearer ${BRAIN_SECRET}` } : {}),
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return Response.json(data, { status: res.status })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Service unavailable' },
      { status: 502 },
    )
  }
}
