/**
 * Brain API Client — calls the Brain web app's tRPC endpoints for persistence.
 *
 * The astrology app stores charts, reports, and relationships in the Brain's
 * central database via its tRPC API. Auth is forwarded via session cookie.
 */

const BRAIN_URL = process.env.BRAIN_URL ?? 'http://localhost:3000'

interface TRPCResponse<T> {
  result?: { data?: T }
  error?: { message?: string }
}

/**
 * Call a Brain tRPC procedure from the server side.
 * Forwards the user's session cookie for auth.
 */
export async function callBrainTRPC<T>(
  procedure: string,
  input: unknown,
  options?: { method?: 'query' | 'mutation' },
): Promise<T> {
  const method = options?.method ?? 'mutation'
  const url = `${BRAIN_URL}/api/trpc/${procedure}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(method === 'query' ? { json: input } : { json: input }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new Error(`Brain API error (${res.status}): ${text}`)
  }

  const data = (await res.json()) as TRPCResponse<T>
  if (data.error) {
    throw new Error(data.error.message ?? 'Brain API error')
  }

  return (data.result?.data ?? data) as T
}
