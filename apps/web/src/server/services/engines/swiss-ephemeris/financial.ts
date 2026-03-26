/**
 * Financial Astrology — Bradley Siderograph
 *
 * Computes the Bradley Siderograph for a given year, summing weighted
 * planetary declination and aspect harmonic values for each calendar day.
 */

import type { Planet } from './engine'
import { julianDay, calcAllPlanets } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BradleyPoint {
  date: string // ISO date YYYY-MM-DD
  value: number // siderograph value for that day
}

// ─── Constants ───────────────────────────────────────────────────────────────

const OBLIQUITY_DEG = 23.44
const OBLIQUITY_RAD = (OBLIQUITY_DEG * Math.PI) / 180

/** Planet pairs used in Bradley aspect harmonics with their weights */
const ASPECT_PAIRS: [Planet, Planet, number][] = [
  ['Jupiter', 'Saturn', 1.0],
  ['Jupiter', 'Uranus', 0.8],
  ['Jupiter', 'Neptune', 0.6],
  ['Saturn', 'Uranus', 0.8],
  ['Saturn', 'Neptune', 0.6],
  ['Uranus', 'Neptune', 0.4],
]

/** Harmonic numbers and their decreasing weight factors */
const HARMONICS: [number, number][] = [
  [1, 1.0],
  [2, 0.5],
  [3, 0.33],
  [4, 0.25],
]

/** Planets used for the declination component and their weights */
const DECL_PLANETS: [Planet, number][] = [
  ['Jupiter', 1.0],
  ['Saturn', 0.8],
  ['Uranus', 0.6],
  ['Neptune', 0.4],
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Approximate declination from ecliptic longitude */
function declination(longitudeDeg: number): number {
  const lonRad = (longitudeDeg * Math.PI) / 180
  return (Math.asin(Math.sin(OBLIQUITY_RAD) * Math.sin(lonRad)) * 180) / Math.PI
}

/** Check if a year is a leap year */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Number of days in a given year */
function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365
}

/** Format month and day with zero-padding */
function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function bradleySiderograph(year: number): BradleyPoint[] {
  const totalDays = daysInYear(year)
  const daysPerMonth = [0, 31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

  const rawPoints: { date: string; value: number }[] = []
  let maxAbs = 0

  let month = 1
  let day = 1

  for (let d = 0; d < totalDays; d++) {
    // Compute Julian Day for noon UTC on this calendar date
    const jd = julianDay(year, month, day, 12)

    // Get all planet positions for this day
    const positions = calcAllPlanets(jd)

    // --- Aspect harmonic component ---
    let aspectSum = 0
    for (const [p1, p2, pairWeight] of ASPECT_PAIRS) {
      const lon1 = positions[p1].longitude
      const lon2 = positions[p2].longitude
      const angleDeg = lon1 - lon2
      const angleRad = (angleDeg * Math.PI) / 180

      for (const [n, harmonicWeight] of HARMONICS) {
        aspectSum += pairWeight * harmonicWeight * Math.cos(n * angleRad)
      }
    }

    // --- Declination component ---
    let declSum = 0
    for (const [planet, weight] of DECL_PLANETS) {
      const decl = declination(positions[planet].longitude)
      declSum += decl * weight
    }

    const dayValue = aspectSum + declSum

    const dateStr = isoDate(year, month, day)
    rawPoints.push({ date: dateStr, value: dayValue })

    const absVal = Math.abs(dayValue)
    if (absVal > maxAbs) maxAbs = absVal

    // Advance calendar date
    day++
    if (day > daysPerMonth[month]) {
      day = 1
      month++
    }
  }

  // Normalize values to a -100..+100 range
  const scale = maxAbs > 0 ? 100 / maxAbs : 1

  return rawPoints.map((p) => ({
    date: p.date,
    value: Math.round(p.value * scale * 100) / 100,
  }))
}
