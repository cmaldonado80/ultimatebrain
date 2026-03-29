/**
 * Astrology Client — calls local server-side proxy
 *
 * The browser calls /api/* (same origin).
 * The server proxy adds auth and calls Mini Brain.
 * Mini Brain URL and secrets never reach the browser.
 */

import type {
  BirthData,
  NatalReport,
  NatalSummaryInput,
  NatalSummaryResponse,
  SynastryResponse,
  TimelineResponse,
  TransitResponse,
} from './types'

export class AstrologyBrainError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'AstrologyBrainError'
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new AstrologyBrainError(
      (data as { error?: string }).error ?? `Request failed (${res.status})`,
      res.status,
    )
  }

  return res.json() as Promise<T>
}

// ── Endpoints ────────────────────────────────────────────────────────

export function fetchNatalSummary(input: NatalSummaryInput): Promise<NatalSummaryResponse> {
  return post('/api/chart', input)
}

export function fetchReport(
  birthData: BirthData,
  options?: { narrativeDepth?: 'basic' | 'detailed' | 'none' },
): Promise<NatalReport> {
  return post('/api/report', { ...birthData, ...options })
}

export function fetchTransits(
  birthData: BirthData,
  range?: { startYear?: number; startMonth?: number; startDay?: number; days?: number },
): Promise<TransitResponse> {
  return post('/api/transits', { ...birthData, ...range })
}

export function fetchTimeline(
  birthData: BirthData,
  period?: '7d' | '30d' | '3m' | '1y',
): Promise<TimelineResponse> {
  return post('/api/timeline', { ...birthData, period })
}

export function fetchSynastry(
  personA: BirthData,
  personB: BirthData,
  narrative?: boolean,
): Promise<SynastryResponse> {
  return post('/api/synastry', { personA, personB, narrative })
}
