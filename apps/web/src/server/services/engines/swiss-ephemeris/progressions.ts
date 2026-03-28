/**
 * Secondary Progressions, Solar Arc Directions, and Primary Directions
 *
 * Three classical predictive timing techniques:
 * - Secondary progressions (day-for-a-year)
 * - Solar arc directions (Sun's progressed arc applied to all planets)
 * - Primary directions (simplified Ptolemaic semi-arc method)
 */

import type { HouseCusps, Planet, Position, ZodiacSign } from './engine'
import { assignHouses, calcAllPlanets, calcHouses, longitudeToSign, PLANET_LIST } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProgressedPosition {
  planet: Planet
  natalLongitude: number
  progressedLongitude: number
  sign: ZodiacSign
  degree: number
}

export interface SolarArcPosition {
  planet: Planet
  natalLongitude: number
  solarArcLongitude: number
  sign: ZodiacSign
  degree: number
  arc: number
}

export interface PrimaryDirection {
  promissor: Planet
  significator: string
  aspect: string
  arcDegrees: number
  estimatedAge: number
}

// ─── Obliquity constant (mean obliquity of the ecliptic, J2000.0) ───────────

const OBLIQUITY = 23.4393 // degrees
const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

// ─── Secondary Progressions ─────────────────────────────────────────────────

/**
 * Compute secondary progressions (day-for-a-year method).
 *
 * For every year that has elapsed since birth, one day is added to the
 * birth Julian Day. Planet positions are then calculated at that
 * "progressed" moment. This is the most widely used progression technique.
 *
 * @param birthJd - Julian Day of birth
 * @param targetJd - Julian Day of the target (progressed-to) date
 * @param lat - birth latitude
 * @param lon - birth longitude
 * @returns array of progressed planet positions
 */
export async function secondaryProgressions(
  birthJd: number,
  targetJd: number,
  lat: number,
  lon: number,
): Promise<ProgressedPosition[]> {
  const yearsElapsed = (targetJd - birthJd) / 365.25
  const progressedJd = birthJd + yearsElapsed // 1 day per year

  const rawPlanets = calcAllPlanets(progressedJd)
  const houses = calcHouses(progressedJd, lat, lon)
  const planets = assignHouses(rawPlanets, houses)

  const results: ProgressedPosition[] = []

  for (const p of PLANET_LIST) {
    const progPos = planets[p]
    if (!progPos) continue

    const signInfo = longitudeToSign(progPos.longitude)

    results.push({
      planet: p,
      natalLongitude: 0, // caller can cross-reference with natal chart
      progressedLongitude: progPos.longitude,
      sign: signInfo.sign,
      degree: signInfo.degree,
    })
  }

  return results
}

// ─── Solar Arc Directions ───────────────────────────────────────────────────

/**
 * Compute solar arc directions.
 *
 * The solar arc is the distance the Sun has traveled by secondary
 * progression (day-for-a-year). That same arc is then applied to every
 * natal planet, producing directed positions.
 *
 * @param planets - natal planet positions
 * @param birthJd - Julian Day of birth
 * @param targetJd - Julian Day of the target date
 * @returns array of solar-arc directed positions
 */
export function solarArcDirections(
  planets: Record<Planet, Position>,
  birthJd: number,
  targetJd: number,
): SolarArcPosition[] {
  const yearsElapsed = (targetJd - birthJd) / 365.25
  const progressedJd = birthJd + yearsElapsed

  const progressedPlanets = calcAllPlanets(progressedJd)
  const natalSunLon = planets.Sun.longitude
  const progressedSunLon = progressedPlanets.Sun.longitude

  const solarArc = (((progressedSunLon - natalSunLon) % 360) + 360) % 360

  const results: SolarArcPosition[] = []

  for (const p of PLANET_LIST) {
    const pos = planets[p]
    if (!pos) continue

    const saLon = (pos.longitude + solarArc + 360) % 360
    const signInfo = longitudeToSign(saLon)

    results.push({
      planet: p,
      natalLongitude: pos.longitude,
      solarArcLongitude: saLon,
      sign: signInfo.sign,
      degree: signInfo.degree,
      arc: Math.round(solarArc * 100) / 100,
    })
  }

  return results
}

// ─── Primary Directions (simplified Ptolemaic semi-arc) ─────────────────────

/**
 * Compute right ascension from ecliptic longitude.
 * Simplified formula assuming zero latitude:
 * RA = atan2(cos(obliquity) * sin(lon), cos(lon))
 */
function rightAscension(lon: number): number {
  const lonRad = lon * DEG_TO_RAD
  const oblRad = OBLIQUITY * DEG_TO_RAD
  const ra = Math.atan2(Math.cos(oblRad) * Math.sin(lonRad), Math.cos(lonRad))
  return (((ra * RAD_TO_DEG) % 360) + 360) % 360
}

/**
 * Compute declination from ecliptic longitude.
 * Simplified formula assuming zero ecliptic latitude:
 * decl = asin(sin(obliquity) * sin(lon))
 */
function declination(lon: number): number {
  const lonRad = lon * DEG_TO_RAD
  const oblRad = OBLIQUITY * DEG_TO_RAD
  return Math.asin(Math.sin(oblRad) * Math.sin(lonRad)) * RAD_TO_DEG
}

/**
 * Compute the diurnal semi-arc of a body at a given geographic latitude.
 * DSA = acos(-tan(decl) * tan(lat)), clamped to avoid NaN near poles.
 */
function diurnalSemiArc(decl: number, lat: number): number {
  const declRad = decl * DEG_TO_RAD
  const latRad = lat * DEG_TO_RAD
  const val = -Math.tan(declRad) * Math.tan(latRad)
  const clamped = Math.max(-1, Math.min(1, val))
  return Math.acos(clamped) * RAD_TO_DEG
}

/** Significator angles (the four angles of the chart) */
const ANGLE_NAMES = ['ASC', 'MC', 'DSC', 'IC'] as const

/** Ptolemaic aspect angles to test between promissor and significator */
const DIRECTION_ASPECTS: { name: string; angle: number }[] = [
  { name: 'Conjunction', angle: 0 },
  { name: 'Sextile', angle: 60 },
  { name: 'Square', angle: 90 },
  { name: 'Trine', angle: 120 },
  { name: 'Opposition', angle: 180 },
]

/**
 * Calculate primary directions using a simplified Ptolemaic semi-arc method.
 *
 * For each natal planet (promissor), the function computes the right
 * ascension and diurnal semi-arc, then measures the arc distance to
 * each of the four angles (ASC, MC, DSC, IC) under each major aspect.
 * The arc in degrees roughly corresponds to the age at which the
 * direction perfects (Naibod key: ~1 degree = ~1 year).
 *
 * @param planets - natal planet positions
 * @param houses - natal house cusps (for angle positions)
 * @param lat - birth latitude
 * @returns array of primary directions sorted by estimated age
 */
export function primaryDirections(
  planets: Record<Planet, Position>,
  houses: HouseCusps,
  lat: number,
): PrimaryDirection[] {
  const ramc = rightAscension(houses.mc)

  const angleRAs: Record<string, number> = {
    ASC: rightAscension(houses.ascendant),
    MC: ramc,
    DSC: (rightAscension(houses.ascendant) + 180) % 360,
    IC: (ramc + 180) % 360,
  }

  const directions: PrimaryDirection[] = []

  const classicalPlanets: Planet[] = [
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

  for (const p of classicalPlanets) {
    const pos = planets[p]
    if (!pos) continue

    const pRA = rightAscension(pos.longitude)
    const pDecl = declination(pos.longitude)
    const pDSA = diurnalSemiArc(pDecl, lat)

    // Meridian distance of the promissor from the MC
    let merDist = (((pRA - ramc) % 360) + 360) % 360
    if (merDist > 180) merDist -= 360

    // Semi-arc proportional distance (Ptolemaic method)
    const semiArcForSide = merDist >= 0 ? pDSA : 180 - pDSA
    const proportional = semiArcForSide !== 0 ? Math.abs(merDist) / semiArcForSide : 0

    for (const angle of ANGLE_NAMES) {
      const sigRA = angleRAs[angle]

      for (const aspect of DIRECTION_ASPECTS) {
        // The promissor's RA shifted by the aspect angle
        const promRA = (pRA + aspect.angle) % 360
        let arc = (((promRA - sigRA) % 360) + 360) % 360
        if (arc > 180) arc = 360 - arc

        // Scale the arc by the semi-arc ratio for Ptolemaic key
        const adjustedArc = proportional !== 0 ? arc * proportional : arc
        const estimatedAge = Math.abs(adjustedArc)

        // Only include directions that perfect within a reasonable lifetime
        if (estimatedAge > 0.5 && estimatedAge < 120) {
          directions.push({
            promissor: p,
            significator: angle,
            aspect: aspect.name,
            arcDegrees: Math.round(adjustedArc * 100) / 100,
            estimatedAge: Math.round(estimatedAge * 100) / 100,
          })
        }
      }
    }
  }

  directions.sort((a, b) => a.estimatedAge - b.estimatedAge)
  return directions
}
