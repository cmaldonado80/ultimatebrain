/**
 * Composite & Synastry Chart Calculations
 *
 * Relationship astrology: inter-chart aspects and midpoint composites.
 */

import type { Planet, Position, Aspect, AspectType, NatalChart, HouseCusps } from './engine'
import { calcAspects, assignHouses, PLANET_LIST, longitudeToSign } from './engine'

// ─── Aspect Configuration (mirroring engine.ts) ─────────────────────────────

const ASPECT_CONFIG: Record<AspectType, { angle: number; orb: number }> = {
  Conjunction: { angle: 0, orb: 8 },
  Sextile: { angle: 60, orb: 6 },
  Square: { angle: 90, orb: 7 },
  Trine: { angle: 120, orb: 7 },
  Opposition: { angle: 180, orb: 8 },
  Quincunx: { angle: 150, orb: 3 },
  SemiSquare: { angle: 45, orb: 2 },
  Sesquiquadrate: { angle: 135, orb: 2 },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Compute angular distance between two longitudes (0-180) */
function angleBetween(lon1: number, lon2: number): number {
  const diff = Math.abs(lon1 - lon2) % 360
  return diff > 180 ? 360 - diff : diff
}

/** Calculate the short-arc midpoint of two longitudes */
function midpoint(lon1: number, lon2: number): number {
  let mid = (lon1 + lon2) / 2
  if (Math.abs(lon1 - lon2) > 180) {
    mid = (mid + 180) % 360
  }
  return mid
}

/** Build an empty Dignity record for composite charts */
function emptyDignity(planet: Planet) {
  return {
    planet,
    domicile: false,
    exaltation: false,
    detriment: false,
    fall: false,
    triplicity: false,
    term: false,
    face: false,
    peregrine: false,
    score: 0,
  }
}

// ─── Synastry Aspects ────────────────────────────────────────────────────────

/**
 * Calculate inter-chart aspects between two natal charts.
 * Every planet in chart1 is compared against every planet in chart2.
 * Results are sorted by orb (tightest first).
 */
export function synastryAspects(chart1: NatalChart, chart2: NatalChart): Aspect[] {
  const aspects: Aspect[] = []

  for (const p1 of PLANET_LIST) {
    const pos1 = chart1.planets[p1]
    if (!pos1) continue
    for (const p2 of PLANET_LIST) {
      const pos2 = chart2.planets[p2]
      if (!pos2) continue
      const angle = angleBetween(pos1.longitude, pos2.longitude)

      for (const [type, config] of Object.entries(ASPECT_CONFIG) as [
        AspectType,
        { angle: number; orb: number },
      ][]) {
        const orbDeviation = Math.abs(angle - config.angle)
        if (orbDeviation <= config.orb) {
          // Applying: check if aspect orb is decreasing over time
          const futureLon1 = pos1.longitude + pos1.speed / 24
          const futureLon2 = pos2.longitude + pos2.speed / 24
          const futureAngle = angleBetween(futureLon1, futureLon2)
          const futureOrb = Math.abs(futureAngle - config.angle)
          const applying = futureOrb < orbDeviation

          aspects.push({
            planet1: p1,
            planet2: p2,
            type,
            orb: parseFloat(orbDeviation.toFixed(2)),
            applying,
            exact: orbDeviation < 0.5,
          })
          break // Only match the tightest aspect for each planet pair
        }
      }
    }
  }

  return aspects.sort((a, b) => a.orb - b.orb)
}

// ─── Composite Chart ─────────────────────────────────────────────────────────

/**
 * Generate a composite (midpoint) chart from two natal charts.
 *
 * Each planet position is the short-arc midpoint of the two charts' positions.
 * Houses are equal houses derived from the midpoint of the two ascendants.
 * Aspects are calculated on the composite positions.
 */
export function compositeChart(chart1: NatalChart, chart2: NatalChart): NatalChart {
  // Calculate composite planet longitudes (midpoints)
  const rawPositions = {} as Record<Planet, Omit<Position, 'house'>>

  for (const planet of PLANET_LIST) {
    const p1 = chart1.planets[planet]
    const p2 = chart2.planets[planet]
    if (!p1 || !p2) continue
    const lon1 = p1.longitude
    const lon2 = p2.longitude
    const compositeLon = midpoint(lon1, lon2)
    const pos = longitudeToSign(compositeLon)

    rawPositions[planet] = {
      longitude: compositeLon,
      latitude: 0,
      speed: 0,
      sign: pos.sign,
      degree: pos.degree,
      minutes: pos.minutes,
      retrograde: false,
    }
  }

  // Compute composite houses: midpoint the two ascendants, then equal house system
  const compositeAsc = midpoint(chart1.houses.ascendant, chart2.houses.ascendant)
  const compositeMc = (compositeAsc + 270) % 360

  const cusps: number[] = [0] // index 0 is unused (houses are 1-indexed)
  for (let h = 1; h <= 12; h++) {
    cusps.push((compositeAsc + (h - 1) * 30) % 360)
  }

  const houses: HouseCusps = {
    cusps,
    ascendant: compositeAsc,
    mc: compositeMc,
    vertex: 0,
    eastPoint: 0,
  }

  // Assign houses to composite planet positions
  const planets = assignHouses(rawPositions, houses)

  // Calculate aspects on composite positions
  const aspects = calcAspects(planets)

  // Build empty dignities for all planets
  const dignities = {} as Record<Planet, ReturnType<typeof emptyDignity>>
  for (const planet of PLANET_LIST) {
    dignities[planet] = emptyDignity(planet)
  }

  return {
    julianDay: 0,
    planets,
    houses,
    aspects,
    dignities,
  }
}
