/**
 * Astrology App — shared types
 *
 * These types mirror the contract from the Astrology Mini Brain.
 * They are defined locally — no Brain internals imported.
 */

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
  summary: string
  computedAt: string
}
