/**
 * Astrology Brain Client — typed fetch wrapper
 *
 * Calls the Astrology Mini Brain over HTTP.
 * Does NOT import Brain SDK, ephemeris, or any Brain internals.
 */

import type { NatalSummaryInput, NatalSummaryResponse } from './types'

const ENDPOINT =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_ASTROLOGY_BRAIN_URL ?? 'http://localhost:3100')
    : (process.env.NEXT_PUBLIC_ASTROLOGY_BRAIN_URL ?? 'http://localhost:3100')

export class AstrologyBrainError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'AstrologyBrainError'
  }
}

export async function fetchNatalSummary(input: NatalSummaryInput): Promise<NatalSummaryResponse> {
  const res = await fetch(`${ENDPOINT}/astrology/natal-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new AstrologyBrainError(
      (body as { error?: string }).error ?? `Request failed (${res.status})`,
      res.status,
    )
  }

  return res.json() as Promise<NatalSummaryResponse>
}
