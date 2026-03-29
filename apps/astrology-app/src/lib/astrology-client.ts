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

// ── Persistence ─────────────────────────────────────────────────────

export interface SavedChart {
  id: string
  name: string
  birthDate: string
  birthTime: string
  latitude: number
  longitude: number
  chartData: Record<string, unknown>
  highlights: Record<string, unknown> | null
  summary: string | null
  createdAt: string
}

export interface SavedReport {
  id: string
  chartId: string
  reportType: string
  sections: unknown[]
  summary: string | null
  createdAt: string
}

export interface SavedRelationship {
  id: string
  personAName: string
  personAData: Record<string, unknown>
  personBName: string
  personBData: Record<string, unknown>
  compatibilityScore: number | null
  synastryData: Record<string, unknown> | null
  narrative: string | null
  createdAt: string
}

export async function saveChart(input: {
  name: string
  birthDate: string
  birthTime: string
  latitude: number
  longitude: number
  timezone?: number
  chartData: Record<string, unknown>
  highlights?: Record<string, unknown>
  summary?: string
}): Promise<SavedChart> {
  return post('/api/charts', input)
}

export async function listCharts(): Promise<SavedChart[]> {
  const res = await fetch('/api/charts')
  if (!res.ok) return []
  return res.json()
}

export async function getChart(id: string): Promise<SavedChart> {
  const res = await fetch(`/api/charts/${id}`)
  if (!res.ok) throw new AstrologyBrainError('Chart not found', 404)
  return res.json()
}

export async function deleteChart(id: string): Promise<void> {
  await fetch(`/api/charts/${id}`, { method: 'DELETE' })
}

export async function saveReport(input: {
  chartId: string
  reportType: string
  sections: unknown[]
  summary?: string
}): Promise<SavedReport> {
  return post('/api/reports', input)
}

export async function listReports(chartId?: string): Promise<SavedReport[]> {
  const url = chartId ? `/api/reports?chartId=${chartId}` : '/api/reports'
  const res = await fetch(url)
  if (!res.ok) return []
  return res.json()
}

export async function saveRelationship(input: {
  personAName: string
  personAData: Record<string, unknown>
  personBName: string
  personBData: Record<string, unknown>
  compatibilityScore?: number
  synastryData?: Record<string, unknown>
  narrative?: string
}): Promise<SavedRelationship> {
  return post('/api/relationships', input)
}

export async function listRelationships(): Promise<SavedRelationship[]> {
  const res = await fetch('/api/relationships')
  if (!res.ok) return []
  return res.json()
}

export async function getReport(id: string): Promise<SavedReport> {
  const res = await fetch(`/api/reports/${id}`)
  if (!res.ok) throw new AstrologyBrainError('Report not found', 404)
  return res.json()
}

export async function getRelationship(id: string): Promise<SavedRelationship> {
  const res = await fetch(`/api/relationships/${id}`)
  if (!res.ok) throw new AstrologyBrainError('Relationship not found', 404)
  return res.json()
}

// ── Sharing ─────────────────────────────────────────────────────────

export interface ShareLinkResult {
  token: string
  id: string
}

export async function createShareLink(
  resourceType: 'report' | 'relationship',
  resourceId: string,
): Promise<ShareLinkResult> {
  return post('/api/share', { resourceType, resourceId })
}

export async function getSharedResource(token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/share/${token}`)
  if (!res.ok) throw new AstrologyBrainError('Not found or revoked', 404)
  return res.json()
}
