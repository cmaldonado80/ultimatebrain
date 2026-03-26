/**
 * Return Charts — Lunar and Nodal Returns
 *
 * Calculates the exact moment when the Moon or North Node returns
 * to its natal longitude, using binary search convergence.
 */

import type { Planet, ZodiacSign } from './engine'
import { calcAllPlanets, longitudeToSign } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReturnChart {
  type: 'lunar' | 'nodal'
  jd: number
  date: string
  longitude: number
  sign: ZodiacSign
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert Julian Day to a date string (YYYY-MM-DD HH:MM UTC).
 * Uses the inverse Meeus algorithm (Astronomical Algorithms, Ch. 7).
 */
function jdToDateStr(jd: number): string {
  const z = Math.floor(jd + 0.5)
  const f = jd + 0.5 - z

  let a: number
  if (z < 2299161) {
    a = z
  } else {
    const alpha = Math.floor((z - 1867216.25) / 36524.25)
    a = z + 1 + alpha - Math.floor(alpha / 4)
  }

  const b = a + 1524
  const c = Math.floor((b - 122.1) / 365.25)
  const d = Math.floor(365.25 * c)
  const e = Math.floor((b - d) / 30.6001)

  const day = b - d - Math.floor(30.6001 * e)
  const month = e < 14 ? e - 1 : e - 13
  const year = month > 2 ? c - 4716 : c - 4715

  const totalHours = f * 24
  const hours = Math.floor(totalHours)
  const minutes = Math.floor((totalHours - hours) * 60)

  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const hh = String(hours).padStart(2, '0')
  const mi = String(minutes).padStart(2, '0')

  return `${year}-${mm}-${dd} ${hh}:${mi} UTC`
}

/**
 * Compute the shortest angular distance between two longitudes,
 * returning a signed value in [-180, 180].
 */
function angularDiff(lon1: number, lon2: number): number {
  let diff = lon2 - lon1
  while (diff > 180) diff -= 360
  while (diff < -180) diff += 360
  return diff
}

/**
 * Get the longitude of a specific planet at a given Julian Day.
 */
async function getPlanetLongitude(jd: number, planet: Planet): Promise<number> {
  const planets = calcAllPlanets(jd, false)
  return planets[planet].longitude
}

// ─── Binary Search Core ──────────────────────────────────────────────────────

/**
 * Binary search for the moment a planet returns to a target longitude.
 *
 * Starts at `startJd` and searches forward up to `maxDays`. The search
 * first scans in coarse steps to find a bracket where the planet crosses
 * the target longitude, then refines with bisection to within `tolerance` degrees.
 */
async function findReturn(
  planet: Planet,
  targetLon: number,
  startJd: number,
  maxDays: number,
  coarseStep: number,
  tolerance: number,
): Promise<{ jd: number; longitude: number }> {
  // Phase 1: coarse scan to find a bracket
  let prevJd = startJd
  let prevDiff = angularDiff(targetLon, await getPlanetLongitude(startJd, planet))

  let lo = startJd
  let hi = startJd
  let found = false

  for (let day = coarseStep; day <= maxDays; day += coarseStep) {
    const currentJd = startJd + day
    const currentLon = await getPlanetLongitude(currentJd, planet)
    const currentDiff = angularDiff(targetLon, currentLon)

    // Sign change in angular difference means the planet crossed the target
    if (prevDiff * currentDiff < 0 || Math.abs(currentDiff) < tolerance) {
      lo = prevJd
      hi = currentJd
      found = true
      break
    }

    prevJd = currentJd
    prevDiff = currentDiff
  }

  if (!found) {
    // Fallback: use the closest approach point
    let bestJd = startJd
    let bestDist = 999
    for (let day = 0; day <= maxDays; day += coarseStep) {
      const jd = startJd + day
      const lon = await getPlanetLongitude(jd, planet)
      const dist = Math.abs(angularDiff(targetLon, lon))
      if (dist < bestDist) {
        bestDist = dist
        bestJd = jd
      }
    }
    lo = bestJd - coarseStep
    hi = bestJd + coarseStep
  }

  // Phase 2: bisection refinement
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    const midLon = await getPlanetLongitude(mid, planet)
    const midDiff = angularDiff(targetLon, midLon)

    if (Math.abs(midDiff) < tolerance) {
      return { jd: mid, longitude: midLon }
    }

    const loDiff = angularDiff(targetLon, await getPlanetLongitude(lo, planet))

    if (loDiff * midDiff < 0) {
      hi = mid
    } else {
      lo = mid
    }
  }

  // Return best estimate after max iterations
  const finalLon = await getPlanetLongitude((lo + hi) / 2, planet)
  return { jd: (lo + hi) / 2, longitude: finalLon }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Calculate the next Lunar Return — the moment the transiting Moon
 * returns to the natal Moon's exact longitude.
 *
 * @param natalMoonLon - Natal Moon longitude in degrees (0-360)
 * @param targetJd     - Julian Day to start searching from
 * @param lat          - Birth latitude (reserved for future house calc)
 * @param lon          - Birth longitude (reserved for future house calc)
 * @returns The lunar return chart data
 */
export async function lunarReturn(
  natalMoonLon: number,
  targetJd: number,
  _lat: number,
  _lon: number,
): Promise<ReturnChart> {
  // Moon's sidereal period is ~27.3 days; search up to 30 days
  // Use 0.5-day coarse steps (Moon moves ~13 deg/day)
  const result = await findReturn('Moon', natalMoonLon, targetJd, 30, 0.5, 0.01)

  const signInfo = longitudeToSign(result.longitude)

  return {
    type: 'lunar',
    jd: result.jd,
    date: jdToDateStr(result.jd),
    longitude: result.longitude,
    sign: signInfo.sign,
  }
}

/**
 * Calculate the next Nodal Return — the moment the transiting North Node
 * returns to the natal North Node's longitude.
 *
 * @param natalNodeLon - Natal North Node longitude in degrees (0-360)
 * @param targetJd     - Julian Day to start searching from
 * @returns The nodal return chart data
 */
export async function nodalReturn(natalNodeLon: number, targetJd: number): Promise<ReturnChart> {
  // North Node cycle is ~18.6 years = ~6793 days
  // Node moves ~0.053 deg/day retrograde; use 30-day coarse steps
  const result = await findReturn('NorthNode', natalNodeLon, targetJd, 6800, 30, 0.01)

  const signInfo = longitudeToSign(result.longitude)

  return {
    type: 'nodal',
    jd: result.jd,
    date: jdToDateStr(result.jd),
    longitude: result.longitude,
    sign: signInfo.sign,
  }
}
