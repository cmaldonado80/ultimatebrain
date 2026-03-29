/**
 * Predictive Astrology Calculations for Swiss Ephemeris Engine
 *
 * Provides Solar Return charts, transit calendars, and annual profection
 * calculations for forecasting and timing techniques.
 */

import type { AspectType, NatalChart, Planet, Position, ZodiacSign } from './engine'
import {
  assignHouses,
  calcAllPlanets,
  calcAspects,
  calcHouses,
  julianDay,
  PLANET_LIST,
  SIGN_NAMES,
} from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TransitEvent {
  date: string
  transitPlanet: Planet
  natalPlanet: Planet
  aspectType: AspectType
  orb: number
  applying: boolean
}

export interface ProfectionResult {
  age: number
  profectedHouse: number
  activatedSign: ZodiacSign
  lordOfYear: Planet
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Major planets used for transit calculations (Sun through Pluto, no nodes) */
const TRANSIT_PLANETS: Planet[] = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
  'Pluto',
]

/** Aspect angles and orbs for transit detection */
const ASPECT_ANGLES: Record<AspectType, number> = {
  Conjunction: 0,
  Sextile: 60,
  Square: 90,
  Trine: 120,
  Opposition: 180,
  Quincunx: 150,
  SemiSquare: 45,
  Sesquiquadrate: 135,
}

/** Transit orbs (tighter than natal) */
const TRANSIT_ORBS: Record<AspectType, number> = {
  Conjunction: 2,
  Sextile: 1.5,
  Square: 2,
  Trine: 2,
  Opposition: 2,
  Quincunx: 1,
  SemiSquare: 1,
  Sesquiquadrate: 1,
}

/** Traditional sign rulers for annual profections */
const TRADITIONAL_RULERS: Record<ZodiacSign, Planet> = {
  Aries: 'Mars',
  Taurus: 'Venus',
  Gemini: 'Mercury',
  Cancer: 'Moon',
  Leo: 'Sun',
  Virgo: 'Mercury',
  Libra: 'Venus',
  Scorpio: 'Mars',
  Sagittarius: 'Jupiter',
  Capricorn: 'Saturn',
  Aquarius: 'Saturn',
  Pisces: 'Jupiter',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Compute angular distance between two longitudes (0-180) */
function angleBetween(lon1: number, lon2: number): number {
  const diff = Math.abs(lon1 - lon2) % 360
  return diff > 180 ? 360 - diff : diff
}

/** Parse a date string (YYYY-MM-DD) into year, month, day components */
function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number)
  return { year, month, day }
}

/** Format a Julian Day back to a YYYY-MM-DD date string */
function jdToDateStr(jd: number): string {
  // Inverse Julian Day calculation (Meeus algorithm)
  const z = Math.floor(jd + 0.5)
  const f = jd + 0.5 - z
  let A: number
  if (z < 2299161) {
    A = z
  } else {
    const alpha = Math.floor((z - 1867216.25) / 36524.25)
    A = z + 1 + alpha - Math.floor(alpha / 4)
  }
  const B = A + 1524
  const C = Math.floor((B - 122.1) / 365.25)
  const D = Math.floor(365.25 * C)
  const E = Math.floor((B - D) / 30.6001)

  const day = B - D - Math.floor(30.6001 * E) + f
  const month = E < 14 ? E - 1 : E - 13
  const year = month > 2 ? C - 4716 : C - 4715

  const dayInt = Math.floor(day)
  const mm = String(month).padStart(2, '0')
  const dd = String(dayInt).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/** Empty dignities record for building NatalChart results */
function emptyDignities(): NatalChart['dignities'] {
  const dignities = {} as NatalChart['dignities']
  for (const planet of PLANET_LIST) {
    dignities[planet] = {
      planet,
      domicile: false,
      exaltation: false,
      detriment: false,
      fall: false,
      triplicity: false,
      term: false,
      face: false,
      peregrine: true,
      score: 0,
    }
  }
  return dignities
}

// ─── Solar Return ────────────────────────────────────────────────────────────

/**
 * Compute a Solar Return chart for a given year.
 *
 * Uses binary search to find the exact Julian Day when the transiting Sun
 * returns to the natal Sun longitude (within 0.001 degrees). Then computes
 * the full chart (planets, houses, aspects) for that moment at the given
 * location.
 */
export async function solarReturn(
  natalSunLon: number,
  year: number,
  lat: number,
  lon: number,
): Promise<NatalChart> {
  // Start search from March 1 of the target year
  const startJd = julianDay(year, 3, 1, 0)
  let lo = startJd - 200
  let hi = startJd + 200
  const targetLon = ((natalSunLon % 360) + 360) % 360

  // Binary search for the moment when the Sun matches the natal longitude
  const maxIterations = 100
  for (let iter = 0; iter < maxIterations; iter++) {
    const mid = (lo + hi) / 2
    const planets = calcAllPlanets(mid)
    const sunLon = ((planets.Sun.longitude % 360) + 360) % 360

    // Calculate signed angular difference
    let diff = sunLon - targetLon
    if (diff > 180) diff -= 360
    if (diff < -180) diff += 360

    if (Math.abs(diff) < 0.001) {
      // Found the Solar Return moment — build the full chart
      const houses = calcHouses(mid, lat, lon)
      const fullPlanets = assignHouses(planets, houses)
      const aspects = calcAspects(fullPlanets)

      return {
        julianDay: mid,
        planets: fullPlanets,
        houses,
        aspects,
        dignities: emptyDignities(),
      }
    }

    // The Sun moves forward (increasing longitude) roughly 1 degree per day.
    // If sunLon is less than target, we need a later date (increase lo).
    // If sunLon is greater than target, we need an earlier date (decrease hi).
    if (diff < 0) {
      lo = mid
    } else {
      hi = mid
    }
  }

  // If binary search did not converge, use the best midpoint
  const bestJd = (lo + hi) / 2
  const planets = calcAllPlanets(bestJd)
  const houses = calcHouses(bestJd, lat, lon)
  const fullPlanets = assignHouses(planets, houses)
  const aspects = calcAspects(fullPlanets)

  return {
    julianDay: bestJd,
    planets: fullPlanets,
    houses,
    aspects,
    dignities: emptyDignities(),
  }
}

// ─── Transit Calendar ────────────────────────────────────────────────────────

/**
 * Generate a transit calendar listing all transiting aspects to natal planets
 * over a date range.
 *
 * Iterates day-by-day, computing transiting planet positions and comparing
 * against each natal planet position for all 8 aspect types. Only major
 * planets (Sun through Pluto) are used as transiting bodies.
 */
export async function transitCalendar(
  natalPlanets: Record<Planet, Position>,
  startDate: string,
  endDate: string,
): Promise<TransitEvent[]> {
  const events: TransitEvent[] = []

  const start = parseDate(startDate)
  const end = parseDate(endDate)
  const startJd = julianDay(start.year, start.month, start.day, 12) // noon
  const endJd = julianDay(end.year, end.month, end.day, 12)

  // Track previous day's positions to determine applying/separating
  let prevTransitPositions: Record<Planet, { longitude: number }> | null = null

  for (let jd = startJd; jd <= endJd; jd += 1) {
    const dateStr = jdToDateStr(jd)
    const transitPositions = calcAllPlanets(jd)

    for (const transitPlanet of TRANSIT_PLANETS) {
      const transitLon = transitPositions[transitPlanet].longitude

      for (const natalPlanet of PLANET_LIST) {
        const natalLon = natalPlanets[natalPlanet].longitude
        const angle = angleBetween(transitLon, natalLon)

        for (const [aspectType, aspectAngle] of Object.entries(ASPECT_ANGLES) as [
          AspectType,
          number,
        ][]) {
          const orbDeviation = Math.abs(angle - aspectAngle)
          const maxOrb = TRANSIT_ORBS[aspectType]

          if (orbDeviation <= maxOrb) {
            // Determine if applying or separating
            let applying = true
            if (prevTransitPositions) {
              const prevTransitLon = prevTransitPositions[transitPlanet].longitude
              const prevAngle = angleBetween(prevTransitLon, natalLon)
              const prevOrbDeviation = Math.abs(prevAngle - aspectAngle)
              // If the orb is getting tighter, the transit is applying
              applying = orbDeviation < prevOrbDeviation
            }

            events.push({
              date: dateStr,
              transitPlanet,
              natalPlanet,
              aspectType,
              orb: parseFloat(orbDeviation.toFixed(2)),
              applying,
            })
            break // Only match the tightest aspect for this planet pair
          }
        }
      }
    }

    // Store current positions for next day's applying/separating check
    prevTransitPositions = {} as Record<Planet, { longitude: number }>
    for (const p of TRANSIT_PLANETS) {
      prevTransitPositions[p] = { longitude: transitPositions[p].longitude }
    }
  }

  // Sort events by date, then by orb (tightest first)
  events.sort((a, b) => {
    const dateComp = a.date.localeCompare(b.date)
    if (dateComp !== 0) return dateComp
    return a.orb - b.orb
  })

  return events
}

// ─── Annual Profections ──────────────────────────────────────────────────────

/**
 * Calculate annual profections for a given birth year and current year.
 *
 * Annual profections advance one whole-sign house per year of life. The
 * profected house, activated sign, and lord of the year are derived from
 * the native's age and ascendant sign.
 */
export function annualProfections(
  birthYear: number,
  currentYear: number,
  ascendantSign: ZodiacSign,
): ProfectionResult {
  const age = currentYear - birthYear
  const profectedHouse = (age % 12) + 1

  // Find the index of the ascendant sign in the zodiac
  const ascIndex = SIGN_NAMES.indexOf(ascendantSign)

  // The activated sign is `age` signs forward from the ascendant
  const activatedIndex = (ascIndex + (age % 12)) % 12
  const activatedSign = SIGN_NAMES[activatedIndex]

  // The lord of the year is the traditional ruler of the activated sign
  const lordOfYear = TRADITIONAL_RULERS[activatedSign]

  return {
    age,
    profectedHouse,
    activatedSign,
    lordOfYear,
  }
}
