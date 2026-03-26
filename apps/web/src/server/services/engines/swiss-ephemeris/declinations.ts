/**
 * Declination Calculations
 *
 * Planetary declinations and parallel/contraparallel aspects.
 */

import type { Planet, Position } from './engine'
import { PLANET_LIST } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeclinationResult {
  planet: Planet
  declination: number
  isOutOfBounds: boolean
}

export interface ParallelAspect {
  planet1: Planet
  planet2: Planet
  type: 'parallel' | 'contraparallel'
  orb: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Mean obliquity of the ecliptic (J2000.0 epoch) in degrees */
const OBLIQUITY = 23.4393

/** Obliquity in radians */
const OBLIQUITY_RAD = (OBLIQUITY * Math.PI) / 180

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Calculate the declination for each planet from its ecliptic longitude.
 *
 * Declination = arcsin(sin(obliquity) * sin(longitude))
 * A planet is "out of bounds" when its declination exceeds the obliquity
 * of the ecliptic (~23.44 degrees), meaning it ventures beyond the Sun's
 * maximum declination range.
 */
export function calcDeclinations(planets: Record<Planet, Position>): DeclinationResult[] {
  const results: DeclinationResult[] = []

  for (const planet of PLANET_LIST) {
    const pos = planets[planet]
    if (!pos) continue

    const lonRad = (pos.longitude * Math.PI) / 180
    const declRad = Math.asin(Math.sin(OBLIQUITY_RAD) * Math.sin(lonRad))
    const declination = parseFloat(((declRad * 180) / Math.PI).toFixed(4))
    const isOutOfBounds = Math.abs(declination) > OBLIQUITY

    results.push({ planet, declination, isOutOfBounds })
  }

  return results
}

/**
 * Calculate parallel and contraparallel aspects between planets.
 *
 * - Parallel: Two planets at the same declination (same sign, N or S) within orb.
 *   Analogous to a conjunction — planets are at the same distance from the celestial equator.
 *
 * - Contraparallel: Two planets at equal but opposite declinations within orb.
 *   Analogous to an opposition — one north, one south, at the same distance.
 */
export function calcParallels(
  declinations: DeclinationResult[],
  orb: number = 1,
): ParallelAspect[] {
  const aspects: ParallelAspect[] = []

  for (let i = 0; i < declinations.length; i++) {
    for (let j = i + 1; j < declinations.length; j++) {
      const d1 = declinations[i]
      const d2 = declinations[j]

      // Parallel: same sign declination, within orb
      const parallelOrb = Math.abs(d1.declination - d2.declination)
      if (parallelOrb <= orb) {
        aspects.push({
          planet1: d1.planet,
          planet2: d2.planet,
          type: 'parallel',
          orb: parseFloat(parallelOrb.toFixed(4)),
        })
        continue
      }

      // Contraparallel: opposite sign declination, within orb
      const contraOrb = Math.abs(d1.declination + d2.declination)
      if (contraOrb <= orb) {
        aspects.push({
          planet1: d1.planet,
          planet2: d2.planet,
          type: 'contraparallel',
          orb: parseFloat(contraOrb.toFixed(4)),
        })
      }
    }
  }

  return aspects.sort((a, b) => a.orb - b.orb)
}
