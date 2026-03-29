/**
 * Legal Client — calls local server-side proxy
 *
 * Browser calls /api/domain (same origin).
 * Server proxy adds auth and calls Mini Brain.
 */

export class BrainError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'BrainError'
  }
}

export async function callDomain(input: Record<string, unknown>): Promise<unknown> {
  const res = await fetch('/api/domain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new BrainError((body as { error?: string }).error ?? 'Request failed', res.status)
  }
  return res.json()
}
