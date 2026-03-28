/**
 * Zodiacal Subdivisions and Harmonic Charts
 *
 * Dwads (dodecatemoria), Navamsa (D-9), Decanates, Age Harmonic charts,
 * and harmonic spectrum analysis.
 */

import type { Planet, Position, ZodiacSign } from './engine'
import { FACE_RULERS, longitudeToSign, PLANET_LIST, SIGN_NAMES } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Subdivision {
  planet: Planet
  longitude: number
  sign: ZodiacSign
  degree: number
  ruler?: Planet
}

export interface HarmonicPoint {
  harmonic: number
  amplitude: number
  phase: number
}

// ─── Dwads (Dodecatemoria) ──────────────────────────────────────────────────

/**
 * Calculate the dwad (1/12th of a sign = 2.5 degrees) for each planet.
 *
 * The dwad subdivision divides each 30-degree sign into 12 micro-signs of
 * 2.5 degrees each. A planet's dwad position maps its degree within its sign
 * onto the full zodiac starting from the sign it occupies.
 *
 * Formula: dwadLon = (floor(lon / 30) * 30 + degreeInSign * 12) % 360
 */
export function calcDwads(planets: Record<Planet, Position>): Record<Planet, Subdivision> {
  const result = {} as Record<Planet, Subdivision>

  for (const p of PLANET_LIST) {
    const pos = planets[p]
    if (!pos) continue

    const lon = pos.longitude
    const degreeInSign = lon % 30
    const dwadLon = (Math.floor(lon / 30) * 30 + degreeInSign * 12) % 360

    const signInfo = longitudeToSign(dwadLon)
    const signIndex = SIGN_NAMES.indexOf(signInfo.sign)
    const decanIndex = Math.floor((dwadLon % 30) / 10)
    const ruler = signIndex >= 0 ? FACE_RULERS[SIGN_NAMES[signIndex]][decanIndex] : undefined

    result[p] = {
      planet: p,
      longitude: dwadLon,
      sign: signInfo.sign,
      degree: signInfo.degree,
      ruler,
    }
  }

  return result
}

// ─── Navamsa (D-9) ─────────────────────────────────────────────────────────

/**
 * Calculate the Navamsa (ninth-harmonic) chart for each planet.
 *
 * The Navamsa divides each sign into 9 equal parts of 3 degrees 20 minutes.
 * A planet's Navamsa longitude is simply (longitude * 9) % 360.
 */
export function calcNavamsa(planets: Record<Planet, Position>): Record<Planet, Subdivision> {
  const result = {} as Record<Planet, Subdivision>

  for (const p of PLANET_LIST) {
    const pos = planets[p]
    if (!pos) continue

    const navLon = (pos.longitude * 9) % 360
    const signInfo = longitudeToSign(navLon)
    const signIndex = SIGN_NAMES.indexOf(signInfo.sign)
    const decanIndex = Math.floor((navLon % 30) / 10)
    const ruler = signIndex >= 0 ? FACE_RULERS[SIGN_NAMES[signIndex]][decanIndex] : undefined

    result[p] = {
      planet: p,
      longitude: navLon,
      sign: signInfo.sign,
      degree: signInfo.degree,
      ruler,
    }
  }

  return result
}

// ─── Decanates ──────────────────────────────────────────────────────────────

/**
 * Calculate the decanate (face) for each planet.
 *
 * Each 30-degree sign is divided into three 10-degree decanates.
 * The ruler of each decanate follows the Chaldean order as stored
 * in FACE_RULERS from the engine.
 */
export function calcDecanates(
  planets: Record<Planet, Position>,
): Record<Planet, Subdivision & { decan: number }> {
  const result = {} as Record<Planet, Subdivision & { decan: number }>

  for (const p of PLANET_LIST) {
    const pos = planets[p]
    if (!pos) continue

    const degreeInSign = pos.longitude % 30
    const decanIndex = Math.min(Math.floor(degreeInSign / 10), 2)
    const decan = decanIndex + 1
    const sign = pos.sign
    const ruler = FACE_RULERS[sign][decanIndex]

    result[p] = {
      planet: p,
      longitude: pos.longitude,
      sign,
      degree: pos.degree,
      decan,
      ruler,
    }
  }

  return result
}

// ─── Age Harmonic Chart ─────────────────────────────────────────────────────

/**
 * Generate an age harmonic chart.
 *
 * For a given age (which can be fractional), each planet's natal longitude
 * is multiplied by that age and taken modulo 360 to produce the harmonic
 * position. Age harmonic charts are used in forecasting and personality
 * refinement work.
 */
export function ageHarmonicChart(
  planets: Record<Planet, Position>,
  age: number,
): Record<Planet, { longitude: number; sign: ZodiacSign; degree: number }> {
  const result = {} as Record<Planet, { longitude: number; sign: ZodiacSign; degree: number }>

  for (const p of PLANET_LIST) {
    const pos = planets[p]
    if (!pos) continue

    const harmonicLon = (((pos.longitude * age) % 360) + 360) % 360
    const signInfo = longitudeToSign(harmonicLon)

    result[p] = {
      longitude: harmonicLon,
      sign: signInfo.sign,
      degree: signInfo.degree,
    }
  }

  return result
}

// ─── Harmonic Spectrum ──────────────────────────────────────────────────────

/**
 * Compute a harmonic spectrum across a range of harmonics.
 *
 * For each harmonic number H from 1 to maxHarmonic, the function sums the
 * unit vectors formed by H * longitude for every planet, producing a
 * resultant vector whose amplitude and phase characterize the chart's
 * resonance at that harmonic.
 *
 * This is essentially a discrete Fourier analysis of the planetary
 * longitude distribution.
 *
 * @param planets - natal planet positions
 * @param maxHarmonic - highest harmonic to compute (default 32)
 * @returns array of HarmonicPoint sorted by harmonic number
 */
export function harmonicSpectrum(
  planets: Record<Planet, Position>,
  maxHarmonic: number = 32,
): HarmonicPoint[] {
  const DEG_TO_RAD = Math.PI / 180
  const RAD_TO_DEG = 180 / Math.PI

  const longitudes: number[] = []
  for (const p of PLANET_LIST) {
    const pos = planets[p]
    if (pos) {
      longitudes.push(pos.longitude)
    }
  }

  if (longitudes.length === 0) return []

  const points: HarmonicPoint[] = []

  for (let h = 1; h <= maxHarmonic; h++) {
    let x = 0
    let y = 0

    for (const lon of longitudes) {
      const angle = h * lon * DEG_TO_RAD
      x += Math.cos(angle)
      y += Math.sin(angle)
    }

    const amplitude = Math.sqrt(x * x + y * y)
    const phase = Math.atan2(y, x) * RAD_TO_DEG

    points.push({
      harmonic: h,
      amplitude,
      phase: ((phase % 360) + 360) % 360,
    })
  }

  return points
}
