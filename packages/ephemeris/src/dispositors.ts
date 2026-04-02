/**
 * Dispositor Chain Analysis
 *
 * Traces the chain of planetary rulership through signs to find
 * final dispositors and mutual receptions.
 */

import type { Planet, Position, ZodiacSign } from './engine'
import { PLANET_LIST } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DispositorChainResult {
  /** Map of each planet to its dispositor (the traditional ruler of the sign it occupies) */
  dispositors: Record<Planet, Planet>
  /** The planet that rules its own sign (self-disposing), or null if a mutual reception loop exists instead */
  finalDispositor: Planet | null
  /** Pairs of planets in mutual reception (A in B's sign and B in A's sign) */
  mutualReceptions: [Planet, Planet][]
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Traditional sign rulers (no modern rulerships).
 * Mars rules Scorpio, Saturn rules Aquarius, Jupiter rules Pisces.
 */
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

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Build the dispositor chain for all planets in the chart.
 *
 * For each planet, find the sign it occupies, then find the traditional ruler
 * of that sign. That ruler is the planet's dispositor. Follow the chain until
 * you reach a planet that disposes itself (rules its own sign) or until you
 * find a loop (mutual reception or longer cycle).
 */
export function dispositorChain(planets: Record<Planet, Position>): DispositorChainResult {
  const dispositors = {} as Record<Planet, Planet>

  // Step 1: Build the dispositor map
  for (const planet of PLANET_LIST) {
    const pos = planets[planet]
    if (!pos) continue
    const ruler = TRADITIONAL_RULERS[pos.sign]
    dispositors[planet] = ruler
  }

  // Step 2: Find the final dispositor (a planet that rules its own sign)
  let finalDispositor: Planet | null = null
  for (const planet of PLANET_LIST) {
    const pos = planets[planet]
    if (!pos) continue
    if (TRADITIONAL_RULERS[pos.sign] === planet) {
      // This planet rules its own sign — it is a final dispositor.
      // Verify it is reachable: follow chains from all planets.
      // A true final dispositor is one where ALL chains eventually lead to it.
      finalDispositor = planet

      // Check if all chains lead here
      let allLeadHere = true
      for (const p of PLANET_LIST) {
        if (!planets[p]) continue
        let current: Planet = p
        const visited = new Set<Planet>()
        while (current !== planet && !visited.has(current)) {
          visited.add(current)
          current = dispositors[current]
          if (!current) break
        }
        if (current !== planet) {
          allLeadHere = false
          break
        }
      }

      if (allLeadHere) break
      // If not all lead here, keep searching
      finalDispositor = planet // Still a self-dispositing planet, even if not universal
    }
  }

  // Step 3: Find mutual receptions
  const mutualReceptions: [Planet, Planet][] = []
  const checked = new Set<string>()

  for (const planet of PLANET_LIST) {
    const pos = planets[planet]
    if (!pos) continue
    const ruler = dispositors[planet]
    if (!ruler || ruler === planet) continue

    const rulerPos = planets[ruler]
    if (!rulerPos) continue

    // Check if the ruler is in the sign ruled by 'planet'
    const rulerOfRulersSign = TRADITIONAL_RULERS[rulerPos.sign]
    if (rulerOfRulersSign === planet) {
      const key = [planet, ruler].sort().join('-')
      if (!checked.has(key)) {
        checked.add(key)
        mutualReceptions.push([planet, ruler])
      }
    }
  }

  // If no self-disposing planet found but there are mutual receptions, finalDispositor is null
  if (!finalDispositor) {
    // Double-check: maybe there's a self-disposing planet we missed
    for (const planet of PLANET_LIST) {
      const pos = planets[planet]
      if (!pos) continue
      if (TRADITIONAL_RULERS[pos.sign] === planet) {
        finalDispositor = planet
        break
      }
    }
  }

  return { dispositors, finalDispositor, mutualReceptions }
}
