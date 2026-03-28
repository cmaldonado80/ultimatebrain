/**
 * Aspect Pattern Detection for Swiss Ephemeris Engine
 *
 * Detects classical aspect patterns (Grand Trine, T-Square, Grand Cross,
 * Yod, Stellium, Kite, Mystic Rectangle) from computed aspects and positions.
 */

import type { Aspect, AspectType, Planet, Position } from './engine'
// ─── Types ───────────────────────────────────────────────────────────────────

export interface AspectPattern {
  type: 'GrandTrine' | 'TSquare' | 'GrandCross' | 'Yod' | 'Stellium' | 'Kite' | 'MysticRectangle'
  planets: Planet[]
  description: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Check whether a specific aspect type exists between two planets.
 * Order of p1/p2 does not matter since aspects are stored in canonical order.
 */
function hasAspect(aspects: Aspect[], p1: Planet, p2: Planet, type: AspectType): boolean {
  return aspects.some(
    (a) =>
      a.type === type &&
      ((a.planet1 === p1 && a.planet2 === p2) || (a.planet1 === p2 && a.planet2 === p1)),
  )
}

/** Return all unique planets that participate in any aspect */
function allAspectPlanets(aspects: Aspect[]): Planet[] {
  const set = new Set<Planet>()
  for (const a of aspects) {
    set.add(a.planet1)
    set.add(a.planet2)
  }
  return Array.from(set)
}

/** Generate all unique combinations of `k` items from `arr` */
function combinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = []
  function helper(start: number, combo: T[]) {
    if (combo.length === k) {
      result.push([...combo])
      return
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i])
      helper(i + 1, combo)
      combo.pop()
    }
  }
  helper(0, [])
  return result
}

/** Deduplicate patterns by sorting planet lists and comparing */
function deduplicatePatterns(patterns: AspectPattern[]): AspectPattern[] {
  const seen = new Set<string>()
  const result: AspectPattern[] = []
  for (const p of patterns) {
    const key = p.type + ':' + [...p.planets].sort().join(',')
    if (!seen.has(key)) {
      seen.add(key)
      result.push(p)
    }
  }
  return result
}

// ─── Pattern Finders ─────────────────────────────────────────────────────────

function findGrandTrines(aspects: Aspect[], planets: Planet[]): AspectPattern[] {
  const patterns: AspectPattern[] = []
  const combos = combinations(planets, 3)

  for (const [a, b, c] of combos) {
    if (
      hasAspect(aspects, a, b, 'Trine') &&
      hasAspect(aspects, b, c, 'Trine') &&
      hasAspect(aspects, a, c, 'Trine')
    ) {
      patterns.push({
        type: 'GrandTrine',
        planets: [a, b, c],
        description: `Grand Trine between ${a}, ${b}, and ${c} — a harmonious triangular flow of energy indicating natural talent and ease in the connected areas of life.`,
      })
    }
  }

  return patterns
}

function findTSquares(aspects: Aspect[], planets: Planet[]): AspectPattern[] {
  const patterns: AspectPattern[] = []
  const combos = combinations(planets, 3)

  for (const [a, b, c] of combos) {
    // Check each possible configuration: which two are in opposition and which is the focal point
    // Config 1: a-b opposition, both square c
    if (
      hasAspect(aspects, a, b, 'Opposition') &&
      hasAspect(aspects, a, c, 'Square') &&
      hasAspect(aspects, b, c, 'Square')
    ) {
      patterns.push({
        type: 'TSquare',
        planets: [a, b, c],
        description: `T-Square with ${a} opposing ${b}, both squaring focal planet ${c} — a dynamic tension pattern that drives action and achievement through the focal planet.`,
      })
    }
    // Config 2: a-c opposition, both square b
    if (
      hasAspect(aspects, a, c, 'Opposition') &&
      hasAspect(aspects, a, b, 'Square') &&
      hasAspect(aspects, c, b, 'Square')
    ) {
      patterns.push({
        type: 'TSquare',
        planets: [a, c, b],
        description: `T-Square with ${a} opposing ${c}, both squaring focal planet ${b} — a dynamic tension pattern that drives action and achievement through the focal planet.`,
      })
    }
    // Config 3: b-c opposition, both square a
    if (
      hasAspect(aspects, b, c, 'Opposition') &&
      hasAspect(aspects, b, a, 'Square') &&
      hasAspect(aspects, c, a, 'Square')
    ) {
      patterns.push({
        type: 'TSquare',
        planets: [b, c, a],
        description: `T-Square with ${b} opposing ${c}, both squaring focal planet ${a} — a dynamic tension pattern that drives action and achievement through the focal planet.`,
      })
    }
  }

  return patterns
}

function findGrandCrosses(aspects: Aspect[], planets: Planet[]): AspectPattern[] {
  const patterns: AspectPattern[] = []
  const combos = combinations(planets, 4)

  for (const [a, b, c, d] of combos) {
    // A Grand Cross has 2 oppositions and 4 squares among 4 planets.
    // Try all 3 possible pairings of 2 oppositions from 4 planets:
    // Pairing 1: a-b opposition, c-d opposition
    if (
      hasAspect(aspects, a, b, 'Opposition') &&
      hasAspect(aspects, c, d, 'Opposition') &&
      hasAspect(aspects, a, c, 'Square') &&
      hasAspect(aspects, a, d, 'Square') &&
      hasAspect(aspects, b, c, 'Square') &&
      hasAspect(aspects, b, d, 'Square')
    ) {
      patterns.push({
        type: 'GrandCross',
        planets: [a, b, c, d],
        description: `Grand Cross between ${a}, ${b}, ${c}, and ${d} — a powerful pattern of four planets in mutual tension creating tremendous drive, determination, and the need to balance competing demands.`,
      })
      continue
    }
    // Pairing 2: a-c opposition, b-d opposition
    if (
      hasAspect(aspects, a, c, 'Opposition') &&
      hasAspect(aspects, b, d, 'Opposition') &&
      hasAspect(aspects, a, b, 'Square') &&
      hasAspect(aspects, a, d, 'Square') &&
      hasAspect(aspects, c, b, 'Square') &&
      hasAspect(aspects, c, d, 'Square')
    ) {
      patterns.push({
        type: 'GrandCross',
        planets: [a, c, b, d],
        description: `Grand Cross between ${a}, ${c}, ${b}, and ${d} — a powerful pattern of four planets in mutual tension creating tremendous drive, determination, and the need to balance competing demands.`,
      })
      continue
    }
    // Pairing 3: a-d opposition, b-c opposition
    if (
      hasAspect(aspects, a, d, 'Opposition') &&
      hasAspect(aspects, b, c, 'Opposition') &&
      hasAspect(aspects, a, b, 'Square') &&
      hasAspect(aspects, a, c, 'Square') &&
      hasAspect(aspects, d, b, 'Square') &&
      hasAspect(aspects, d, c, 'Square')
    ) {
      patterns.push({
        type: 'GrandCross',
        planets: [a, d, b, c],
        description: `Grand Cross between ${a}, ${d}, ${b}, and ${c} — a powerful pattern of four planets in mutual tension creating tremendous drive, determination, and the need to balance competing demands.`,
      })
    }
  }

  return patterns
}

function findYods(aspects: Aspect[], planets: Planet[]): AspectPattern[] {
  const patterns: AspectPattern[] = []
  const combos = combinations(planets, 3)

  for (const [a, b, c] of combos) {
    // Config 1: a-b sextile, both quincunx c (apex)
    if (
      hasAspect(aspects, a, b, 'Sextile') &&
      hasAspect(aspects, a, c, 'Quincunx') &&
      hasAspect(aspects, b, c, 'Quincunx')
    ) {
      patterns.push({
        type: 'Yod',
        planets: [a, b, c],
        description: `Yod (Finger of God) with ${a} sextile ${b}, both quincunx apex planet ${c} — a fated pattern pointing to a special mission or adjustment required through ${c}.`,
      })
    }
    // Config 2: a-c sextile, both quincunx b (apex)
    if (
      hasAspect(aspects, a, c, 'Sextile') &&
      hasAspect(aspects, a, b, 'Quincunx') &&
      hasAspect(aspects, c, b, 'Quincunx')
    ) {
      patterns.push({
        type: 'Yod',
        planets: [a, c, b],
        description: `Yod (Finger of God) with ${a} sextile ${c}, both quincunx apex planet ${b} — a fated pattern pointing to a special mission or adjustment required through ${b}.`,
      })
    }
    // Config 3: b-c sextile, both quincunx a (apex)
    if (
      hasAspect(aspects, b, c, 'Sextile') &&
      hasAspect(aspects, b, a, 'Quincunx') &&
      hasAspect(aspects, c, a, 'Quincunx')
    ) {
      patterns.push({
        type: 'Yod',
        planets: [b, c, a],
        description: `Yod (Finger of God) with ${b} sextile ${c}, both quincunx apex planet ${a} — a fated pattern pointing to a special mission or adjustment required through ${a}.`,
      })
    }
  }

  return patterns
}

function findStelliums(planets: Record<Planet, Position>): AspectPattern[] {
  const patterns: AspectPattern[] = []

  // Group planets by sign
  const bySign: Record<string, Planet[]> = {}
  for (const [planet, pos] of Object.entries(planets) as [Planet, Position][]) {
    const sign = pos.sign
    if (!bySign[sign]) bySign[sign] = []
    bySign[sign].push(planet)
  }

  // A stellium requires 3+ planets in the same sign
  for (const [sign, group] of Object.entries(bySign)) {
    if (group.length >= 3) {
      patterns.push({
        type: 'Stellium',
        planets: group,
        description: `Stellium of ${group.length} planets in ${sign} (${group.join(', ')}) — a powerful concentration of energy in one sign, emphasising its themes and qualities in the native's life.`,
      })
    }
  }

  return patterns
}

function findKites(
  aspects: Aspect[],
  planets: Planet[],
  grandTrines: AspectPattern[],
): AspectPattern[] {
  const patterns: AspectPattern[] = []

  for (const gt of grandTrines) {
    const [a, b, c] = gt.planets

    // For each planet not in the Grand Trine, check if it opposes one corner
    // and sextiles the other two
    for (const p of planets) {
      if (p === a || p === b || p === c) continue

      // p opposes a, sextiles b and c
      if (
        hasAspect(aspects, p, a, 'Opposition') &&
        hasAspect(aspects, p, b, 'Sextile') &&
        hasAspect(aspects, p, c, 'Sextile')
      ) {
        patterns.push({
          type: 'Kite',
          planets: [a, b, c, p],
          description: `Kite pattern: Grand Trine (${a}, ${b}, ${c}) with ${p} opposing ${a} and sextiling ${b} and ${c} — the Grand Trine's talents are given direction and purpose through the opposition's dynamic tension.`,
        })
      }
      // p opposes b, sextiles a and c
      if (
        hasAspect(aspects, p, b, 'Opposition') &&
        hasAspect(aspects, p, a, 'Sextile') &&
        hasAspect(aspects, p, c, 'Sextile')
      ) {
        patterns.push({
          type: 'Kite',
          planets: [a, b, c, p],
          description: `Kite pattern: Grand Trine (${a}, ${b}, ${c}) with ${p} opposing ${b} and sextiling ${a} and ${c} — the Grand Trine's talents are given direction and purpose through the opposition's dynamic tension.`,
        })
      }
      // p opposes c, sextiles a and b
      if (
        hasAspect(aspects, p, c, 'Opposition') &&
        hasAspect(aspects, p, a, 'Sextile') &&
        hasAspect(aspects, p, b, 'Sextile')
      ) {
        patterns.push({
          type: 'Kite',
          planets: [a, b, c, p],
          description: `Kite pattern: Grand Trine (${a}, ${b}, ${c}) with ${p} opposing ${c} and sextiling ${a} and ${b} — the Grand Trine's talents are given direction and purpose through the opposition's dynamic tension.`,
        })
      }
    }
  }

  return patterns
}

function findMysticRectangles(aspects: Aspect[], planets: Planet[]): AspectPattern[] {
  const patterns: AspectPattern[] = []
  const combos = combinations(planets, 4)

  for (const [a, b, c, d] of combos) {
    // A Mystic Rectangle has 2 oppositions, 2 trines, and 2 sextiles.
    // The shape is: two pairs of oppositions connected by trines and sextiles.
    // Try all 3 opposition pairings:

    // Pairing 1: a-b opposition, c-d opposition
    if (hasAspect(aspects, a, b, 'Opposition') && hasAspect(aspects, c, d, 'Opposition')) {
      // Check for trines and sextiles forming the rectangle edges
      // Shape: a-c trine, b-d trine, a-d sextile, b-c sextile
      if (
        hasAspect(aspects, a, c, 'Trine') &&
        hasAspect(aspects, b, d, 'Trine') &&
        hasAspect(aspects, a, d, 'Sextile') &&
        hasAspect(aspects, b, c, 'Sextile')
      ) {
        patterns.push({
          type: 'MysticRectangle',
          planets: [a, b, c, d],
          description: `Mystic Rectangle between ${a}, ${b}, ${c}, and ${d} — a balanced configuration of oppositions, trines, and sextiles creating a stable framework for productive use of talents and resolution of tensions.`,
        })
        continue
      }
      // Alternate edge arrangement: a-d trine, b-c trine, a-c sextile, b-d sextile
      if (
        hasAspect(aspects, a, d, 'Trine') &&
        hasAspect(aspects, b, c, 'Trine') &&
        hasAspect(aspects, a, c, 'Sextile') &&
        hasAspect(aspects, b, d, 'Sextile')
      ) {
        patterns.push({
          type: 'MysticRectangle',
          planets: [a, b, c, d],
          description: `Mystic Rectangle between ${a}, ${b}, ${c}, and ${d} — a balanced configuration of oppositions, trines, and sextiles creating a stable framework for productive use of talents and resolution of tensions.`,
        })
        continue
      }
    }

    // Pairing 2: a-c opposition, b-d opposition
    if (hasAspect(aspects, a, c, 'Opposition') && hasAspect(aspects, b, d, 'Opposition')) {
      if (
        hasAspect(aspects, a, b, 'Trine') &&
        hasAspect(aspects, c, d, 'Trine') &&
        hasAspect(aspects, a, d, 'Sextile') &&
        hasAspect(aspects, c, b, 'Sextile')
      ) {
        patterns.push({
          type: 'MysticRectangle',
          planets: [a, b, c, d],
          description: `Mystic Rectangle between ${a}, ${b}, ${c}, and ${d} — a balanced configuration of oppositions, trines, and sextiles creating a stable framework for productive use of talents and resolution of tensions.`,
        })
        continue
      }
      if (
        hasAspect(aspects, a, d, 'Trine') &&
        hasAspect(aspects, c, b, 'Trine') &&
        hasAspect(aspects, a, b, 'Sextile') &&
        hasAspect(aspects, c, d, 'Sextile')
      ) {
        patterns.push({
          type: 'MysticRectangle',
          planets: [a, b, c, d],
          description: `Mystic Rectangle between ${a}, ${b}, ${c}, and ${d} — a balanced configuration of oppositions, trines, and sextiles creating a stable framework for productive use of talents and resolution of tensions.`,
        })
        continue
      }
    }

    // Pairing 3: a-d opposition, b-c opposition
    if (hasAspect(aspects, a, d, 'Opposition') && hasAspect(aspects, b, c, 'Opposition')) {
      if (
        hasAspect(aspects, a, b, 'Trine') &&
        hasAspect(aspects, d, c, 'Trine') &&
        hasAspect(aspects, a, c, 'Sextile') &&
        hasAspect(aspects, d, b, 'Sextile')
      ) {
        patterns.push({
          type: 'MysticRectangle',
          planets: [a, b, c, d],
          description: `Mystic Rectangle between ${a}, ${b}, ${c}, and ${d} — a balanced configuration of oppositions, trines, and sextiles creating a stable framework for productive use of talents and resolution of tensions.`,
        })
        continue
      }
      if (
        hasAspect(aspects, a, c, 'Trine') &&
        hasAspect(aspects, d, b, 'Trine') &&
        hasAspect(aspects, a, b, 'Sextile') &&
        hasAspect(aspects, d, c, 'Sextile')
      ) {
        patterns.push({
          type: 'MysticRectangle',
          planets: [a, b, c, d],
          description: `Mystic Rectangle between ${a}, ${b}, ${c}, and ${d} — a balanced configuration of oppositions, trines, and sextiles creating a stable framework for productive use of talents and resolution of tensions.`,
        })
        continue
      }
    }
  }

  return patterns
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Detect all aspect patterns present in a natal chart.
 *
 * Scans the provided aspects array for classical geometric configurations
 * (Grand Trine, T-Square, Grand Cross, Yod, Stellium, Kite, Mystic Rectangle).
 */
export function findAspectPatterns(
  aspects: Aspect[],
  planets: Record<Planet, Position>,
): AspectPattern[] {
  const planetNames = allAspectPlanets(aspects)

  const grandTrines = findGrandTrines(aspects, planetNames)
  const tSquares = findTSquares(aspects, planetNames)
  const grandCrosses = findGrandCrosses(aspects, planetNames)
  const yods = findYods(aspects, planetNames)
  const stelliums = findStelliums(planets)
  const kites = findKites(aspects, planetNames, grandTrines)
  const mysticRectangles = findMysticRectangles(aspects, planetNames)

  const all = [
    ...grandTrines,
    ...tSquares,
    ...grandCrosses,
    ...yods,
    ...stelliums,
    ...kites,
    ...mysticRectangles,
  ]

  return deduplicatePatterns(all)
}
