/**
 * Astrology Client — calls local server-side proxy
 *
 * The browser calls /api/chart (same origin).
 * The server proxy adds auth and calls Mini Brain.
 * Mini Brain URL and secrets never reach the browser.
 */

import type { NatalSummaryInput, NatalSummaryResponse } from './types'

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
  const res = await fetch('/api/chart', {
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
