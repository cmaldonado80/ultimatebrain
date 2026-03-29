/**
 * Cosmobiology / Ebertin Midpoint Analysis
 *
 * Calculates midpoints for all planet pairs and checks for activations
 * by other planets (conjunction, opposition, square within 1.5° orb).
 */

import type { Planet, Position, ZodiacSign } from './engine'
import { longitudeToSign, PLANET_LIST } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Midpoint {
  planet1: Planet
  planet2: Planet
  longitude: number
  sign: ZodiacSign
  degree: number
  activatedBy?: Planet
  activationOrb?: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize angle to 0–360 */
function norm(a: number): number {
  return ((a % 360) + 360) % 360
}

/**
 * Shortest angular distance on the 360° circle.
 * Returns a value 0–180.
 */
function angDist(a: number, b: number): number {
  const d = Math.abs(norm(a) - norm(b))
  return d > 180 ? 360 - d : d
}

// ─── Main ────────────────────────────────────────────────────────────────────

const ACTIVATION_ORB = 1.5

export function calcAllMidpoints(planets: Record<Planet, Position>): Midpoint[] {
  const results: Midpoint[] = []

  for (let i = 0; i < PLANET_LIST.length; i++) {
    for (let j = i + 1; j < PLANET_LIST.length; j++) {
      const p1 = PLANET_LIST[i]
      const p2 = PLANET_LIST[j]
      const lon1 = planets[p1].longitude
      const lon2 = planets[p2].longitude

      // Calculate the near midpoint
      let midLon = (lon1 + lon2) / 2
      if (Math.abs(lon1 - lon2) > 180) {
        midLon = norm(midLon + 180)
      } else {
        midLon = norm(midLon)
      }

      const signInfo = longitudeToSign(midLon)

      const midpoint: Midpoint = {
        planet1: p1,
        planet2: p2,
        longitude: midLon,
        sign: signInfo.sign,
        degree: signInfo.degree,
      }

      // Check activation by any other planet
      let bestOrb = Infinity
      let bestActivator: Planet | undefined

      for (const candidate of PLANET_LIST) {
        if (candidate === p1 || candidate === p2) continue
        const cLon = planets[candidate].longitude

        // Check conjunction with midpoint
        const conjDist = angDist(cLon, midLon)
        if (conjDist <= ACTIVATION_ORB && conjDist < bestOrb) {
          bestOrb = conjDist
          bestActivator = candidate
        }

        // Check opposition (midpoint + 180)
        const oppDist = angDist(cLon, norm(midLon + 180))
        if (oppDist <= ACTIVATION_ORB && oppDist < bestOrb) {
          bestOrb = oppDist
          bestActivator = candidate
        }

        // Check square (midpoint + 90 and midpoint - 90)
        const sq1Dist = angDist(cLon, norm(midLon + 90))
        if (sq1Dist <= ACTIVATION_ORB && sq1Dist < bestOrb) {
          bestOrb = sq1Dist
          bestActivator = candidate
        }

        const sq2Dist = angDist(cLon, norm(midLon + 270))
        if (sq2Dist <= ACTIVATION_ORB && sq2Dist < bestOrb) {
          bestOrb = sq2Dist
          bestActivator = candidate
        }
      }

      if (bestActivator !== undefined) {
        midpoint.activatedBy = bestActivator
        midpoint.activationOrb = Math.round(bestOrb * 1000) / 1000
      }

      results.push(midpoint)
    }
  }

  // Sort: activated midpoints first (by orb ascending), then unactivated
  results.sort((a, b) => {
    const aActive = a.activatedBy !== undefined
    const bActive = b.activatedBy !== undefined
    if (aActive && !bActive) return -1
    if (!aActive && bActive) return 1
    if (aActive && bActive) return (a.activationOrb ?? 0) - (b.activationOrb ?? 0)
    return 0
  })

  return results
}
