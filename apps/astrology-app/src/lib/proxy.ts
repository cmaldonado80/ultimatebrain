/**
 * Server-side proxy helper — routes requests from Development app to Mini Brain.
 * Adds auth headers. Mini Brain URL and secrets never reach the browser.
 */

const BRAIN_URL = process.env.ASTROLOGY_BRAIN_URL ?? 'http://localhost:3100'
const BRAIN_SECRET = process.env.ASTROLOGY_BRAIN_SECRET ?? ''

export async function proxyToMiniBrain(req: Request, path: string): Promise<Response> {
  try {
    const body = await req.json()

    const res = await fetch(`${BRAIN_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(BRAIN_SECRET ? { Authorization: `Bearer ${BRAIN_SECRET}` } : {}),
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok) {
      return Response.json(data, { status: res.status })
    }
    return Response.json(data)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to reach Astrology service' },
      { status: 502 },
    )
  }
}
