/**
 * Astrology App — shared types
 *
 * These types mirror the contract from the Astrology Mini Brain.
 * They are defined locally — no Brain internals imported.
 */

// ── Birth Data ───────────────────────────────────────────────────────

export interface NatalSummaryInput {
  name?: string
  birthYear: number
  birthMonth: number
  birthDay: number
  /** Hour as decimal (e.g., 14.5 = 2:30 PM) */
  birthHour: number
  latitude: number
  longitude: number
}

export interface BirthData {
  name?: string
  birthYear: number
  birthMonth: number
  birthDay: number
  birthHour: number
  latitude: number
  longitude: number
  timezone?: number
}

// ── Chart ────────────────────────────────────────────────────────────

export interface PlanetPlacement {
  name: string
  sign: string
  degree: number
  minutes: number
  retrograde: boolean
  house: number
}

export interface AspectInfo {
  planet1: string
  planet2: string
  type: string
  orb: number
}

export interface NatalSummaryResponse {
  name: string
  highlights: {
    sunSign: string | null
    moonSign: string | null
    ascendantSign: string | null
    ascendantDegree: number | null
  }
  planets: PlanetPlacement[]
  aspects: AspectInfo[]
  houses?: number[]
  summary: string
  computedAt: string
}

// ── Report ───────────────────────────────────────────────────────────

export interface ReportSection {
  title: string
  content: string
  data: unknown
  narrative?: string
}

export interface NatalReport {
  name: string
  birthData: { year: number; month: number; day: number; hour: number; lat: number; lon: number }
  summary: string
  sections: ReportSection[]
  generatedAt: string
}

// ── Transits ─────────────────────────────────────────────────────────

export interface TransitEvent {
  date: string
  transitPlanet: string
  natalPlanet: string
  aspectType: string
  orb: number
  applying: boolean
}

export interface TransitResponse {
  transits: TransitEvent[]
  moonPhase: {
    phaseName: string
    illumination: number
    waxing: boolean
  }
  lunarMansion: {
    number: number
    name: string
    meaning: string
  }
  profection: {
    age: number
    profectedHouse: number
    activatedSign: string
    lordOfYear: string
  }
  period: { startYear: number; startMonth: number; startDay: number; days: number }
  computedAt: string
}

// ── Timeline ─────────────────────────────────────────────────────────

export interface TimelineEvent {
  date: string
  type: string
  title: string
  description: string
  significance: 'low' | 'medium' | 'high'
}

export interface TimelineResponse {
  events: TimelineEvent[]
  currentPeriod: {
    profection: {
      age: number
      profectedHouse: number
      activatedSign: string
      lordOfYear: string
    }
    firdaria: unknown[]
    zodiacalReleasing: unknown[]
  }
  solarReturn: { date: string; summary: string } | null
  period: string
  computedAt: string
}

// ── Synastry ─────────────────────────────────────────────────────────

export interface SynastryResponse {
  personA: { name: string; summary: string }
  personB: { name: string; summary: string }
  synastryAspects: AspectInfo[]
  compositeHighlights: {
    sunSign: string | null
    moonSign: string | null
    ascendantSign: string | null
  }
  compatibilityScore: number
  narrative?: string
  computedAt: string
}
