/**
 * Antiscia, Draconic Chart, and Heliocentric Positions
 *
 * Antiscia mirror planets across the Cancer/Capricorn solstice axis.
 * The draconic chart re-orients all positions relative to the North Node.
 * Heliocentric positions use the raw swisseph module when available.
 */

import type { Planet, Position, ZodiacSign } from './engine'
import { _swe, longitudeToSign, PLANET_LIST, SEFLG_SPEED } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AntisciaResult {
  planet: Planet
  antiscium: { longitude: number; sign: ZodiacSign; degree: number }
  contraAntiscium: { longitude: number; sign: ZodiacSign; degree: number }
}

export interface DraconicResult {
  planet: Planet
  longitude: number
  sign: ZodiacSign
  degree: number
}

// ─── Heliocentric body IDs ──────────────────────────────────────────────────

const HELIO_BODIES: { name: string; id: number }[] = [
  { name: 'Sun', id: 0 },
  { name: 'Moon', id: 1 },
  { name: 'Mercury', id: 2 },
  { name: 'Venus', id: 3 },
  { name: 'Mars', id: 4 },
  { name: 'Jupiter', id: 5 },
  { name: 'Saturn', id: 6 },
  { name: 'Uranus', id: 7 },
  { name: 'Neptune', id: 8 },
  { name: 'Pluto', id: 9 },
]

// ─── Antiscia ───────────────────────────────────────────────────────────────

/**
 * Calculate antiscia and contra-antiscia for every planet.
 *
 * The antiscion of a planet reflects its longitude across the solstice axis
 * (0 Cancer / 0 Capricorn). A planet at longitude L has its antiscion at
 * (180 - L + 360) % 360.
 *
 * The contra-antiscion is the point opposite the antiscion:
 * contraAntiscium = (antiscion + 180) % 360.
 *
 * Pairs of signs that share antiscia:
 *   Aries <-> Virgo, Taurus <-> Leo, Gemini <-> Cancer,
 *   Libra <-> Pisces, Scorpio <-> Aquarius, Sagittarius <-> Capricorn
 */
export function calcAntiscia(planets: Record<Planet, Position>): AntisciaResult[] {
  const results: AntisciaResult[] = []

  for (const p of PLANET_LIST) {
    const pos = planets[p]
    if (!pos) continue

    const lon = pos.longitude
    const antisciumLon = (((180 - lon) % 360) + 360) % 360
    const contraLon = (antisciumLon + 180) % 360

    const antisciumSign = longitudeToSign(antisciumLon)
    const contraSign = longitudeToSign(contraLon)

    results.push({
      planet: p,
      antiscium: {
        longitude: antisciumLon,
        sign: antisciumSign.sign,
        degree: antisciumSign.degree,
      },
      contraAntiscium: {
        longitude: contraLon,
        sign: contraSign.sign,
        degree: contraSign.degree,
      },
    })
  }

  return results
}

// ─── Draconic Chart ─────────────────────────────────────────────────────────

/**
 * Calculate the draconic chart by subtracting the North Node longitude
 * from every planet's longitude.
 *
 * The draconic zodiac is aligned so that 0 Aries corresponds to the
 * natal North Node. This chart is said to represent the soul's purpose
 * or karmic orientation.
 */
export function draconicChart(planets: Record<Planet, Position>): DraconicResult[] {
  const northNode = planets.NorthNode
  if (!northNode) return []

  const nnLon = northNode.longitude
  const results: DraconicResult[] = []

  for (const p of PLANET_LIST) {
    const pos = planets[p]
    if (!pos) continue

    const draconicLon = (((pos.longitude - nnLon) % 360) + 360) % 360
    const signInfo = longitudeToSign(draconicLon)

    results.push({
      planet: p,
      longitude: draconicLon,
      sign: signInfo.sign,
      degree: signInfo.degree,
    })
  }

  return results
}

// ─── Heliocentric Positions ─────────────────────────────────────────────────

/**
 * Compute heliocentric planetary positions using the raw swisseph module.
 *
 * Heliocentric positions show where the planets are as viewed from the Sun
 * rather than from Earth. This removes retrograde motion entirely and is
 * used in some financial and esoteric astrological systems.
 *
 * If the native swisseph module is not loaded, returns null.
 *
 * @param jd - Julian Day for the calculation
 * @returns planet positions in heliocentric coordinates, or null
 */
export function heliocentricPositions(
  jd: number,
): Record<string, { longitude: number; sign: ZodiacSign; degree: number }> | null {
  if (!_swe) return null

  const SE_FLG_HELCTR = 8
  const flags = SEFLG_SPEED | SE_FLG_HELCTR

  const result: Record<string, { longitude: number; sign: ZodiacSign; degree: number }> = {}

  for (const body of HELIO_BODIES) {
    try {
      const calc = _swe.swe_calc_ut(jd, body.id, flags)
      if (calc && calc.longitude !== undefined) {
        const lon = ((calc.longitude % 360) + 360) % 360
        const signInfo = longitudeToSign(lon)
        result[body.name] = {
          longitude: lon,
          sign: signInfo.sign,
          degree: signInfo.degree,
        }
      }
    } catch {
      // Skip bodies that fail (e.g., Sun in heliocentric is Earth)
    }
  }

  return result
}
