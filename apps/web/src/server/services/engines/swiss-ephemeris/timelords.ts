/**
 * Time-Lord Systems: Firdaria, Zodiacal Releasing, and Decennials
 *
 * Classical Hellenistic and Medieval timing techniques that assign
 * planetary rulers to successive periods of life.
 */

import type { Planet, ZodiacSign } from './engine'
import { SIGN_NAMES } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FirdariaPeriod {
  planet: string
  startAge: number
  endAge: number
  subPeriods: { planet: string; startAge: number; endAge: number }[]
}

export interface ZRPeriod {
  sign: ZodiacSign
  lord: Planet
  level: number
  startAge: number
  endAge: number
}

export interface DecennialPeriod {
  planet: Planet
  startAge: number
  endAge: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Firdaria day-chart sequence: planet and duration in years */
const FIRDARIA_DAY_SEQUENCE: { planet: string; years: number }[] = [
  { planet: 'Sun', years: 10 },
  { planet: 'Venus', years: 8 },
  { planet: 'Mercury', years: 13 },
  { planet: 'Moon', years: 9 },
  { planet: 'Saturn', years: 11 },
  { planet: 'Jupiter', years: 12 },
  { planet: 'Mars', years: 7 },
  { planet: 'NorthNode', years: 3 },
  { planet: 'SouthNode', years: 2 },
]

/** Firdaria night-chart sequence: planet and duration in years */
const FIRDARIA_NIGHT_SEQUENCE: { planet: string; years: number }[] = [
  { planet: 'Moon', years: 9 },
  { planet: 'Saturn', years: 11 },
  { planet: 'Jupiter', years: 12 },
  { planet: 'Mars', years: 7 },
  { planet: 'NorthNode', years: 3 },
  { planet: 'SouthNode', years: 2 },
  { planet: 'Sun', years: 10 },
  { planet: 'Venus', years: 8 },
  { planet: 'Mercury', years: 13 },
]

/** Chaldean order of the seven classical planets (used for sub-periods) */
const CHALDEAN_ORDER: string[] = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon']

/**
 * Traditional ruler for each sign (classical seven-planet rulership).
 * Used for zodiacal releasing and decennials.
 */
const TRADITIONAL_RULER: Record<ZodiacSign, Planet> = {
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

/**
 * Minor years of each classical planet (used as zodiacal releasing period
 * lengths for signs ruled by that planet).
 *
 * Mars=15, Venus=8, Mercury=20, Moon=25, Sun=19, Jupiter=12, Saturn=27
 */
const MINOR_YEARS: Record<Planet, number> = {
  Sun: 19,
  Moon: 25,
  Mercury: 20,
  Venus: 8,
  Mars: 15,
  Jupiter: 12,
  Saturn: 27,
  Uranus: 0,
  Neptune: 0,
  Pluto: 0,
  NorthNode: 0,
  SouthNode: 0,
  Chiron: 0,
  Lilith: 0,
}

/**
 * Get the zodiacal releasing period length for a given sign.
 * This is the minor years of the sign's traditional ruler.
 */
function zrPeriodForSign(sign: ZodiacSign): number {
  const ruler = TRADITIONAL_RULER[sign]
  return MINOR_YEARS[ruler] || 12
}

// ─── Firdaria ───────────────────────────────────────────────────────────────

/**
 * Generate the Firdaria time-lord sequence.
 *
 * Firdaria is a Medieval Persian timing system. The total cycle for a
 * day chart is 75 years; for a night chart it is the same 75 years
 * but in a different order.
 *
 * Each major period is subdivided into 7 sub-periods in Chaldean order,
 * starting from the major-period lord. Each sub-period is
 * mainYears / 7 in length.
 *
 * The sequence repeats after one full cycle completes.
 *
 * @param isDayChart - true for a day birth, false for a night birth
 * @param maxAge - maximum age to generate (default 100)
 * @returns array of FirdariaPeriod covering from age 0 to maxAge
 */
export function firdaria(isDayChart: boolean, maxAge: number = 100): FirdariaPeriod[] {
  const sequence = isDayChart ? FIRDARIA_DAY_SEQUENCE : FIRDARIA_NIGHT_SEQUENCE
  const results: FirdariaPeriod[] = []

  let age = 0

  while (age < maxAge) {
    for (const entry of sequence) {
      if (age >= maxAge) break

      const mainYears = entry.years
      const endAge = age + mainYears
      const subPeriodLength = mainYears / 7

      // Find the starting index in the Chaldean order for this lord
      const lordIndex = CHALDEAN_ORDER.indexOf(entry.planet)
      // Nodes are not in the Chaldean order; for NorthNode/SouthNode,
      // use the Chaldean order starting from Saturn (index 0)
      const startIdx = lordIndex >= 0 ? lordIndex : 0

      const subPeriods: { planet: string; startAge: number; endAge: number }[] = []
      let subAge = age

      for (let s = 0; s < 7; s++) {
        const subPlanet = CHALDEAN_ORDER[(startIdx + s) % 7]
        const subEnd = subAge + subPeriodLength

        subPeriods.push({
          planet: subPlanet,
          startAge: Math.round(subAge * 1000) / 1000,
          endAge: Math.round(subEnd * 1000) / 1000,
        })

        subAge = subEnd
      }

      results.push({
        planet: entry.planet,
        startAge: Math.round(age * 1000) / 1000,
        endAge: Math.round(endAge * 1000) / 1000,
        subPeriods,
      })

      age = endAge
    }
  }

  return results
}

// ─── Zodiacal Releasing ─────────────────────────────────────────────────────

/**
 * Compute Zodiacal Releasing periods.
 *
 * Zodiacal releasing is a Hellenistic time-lord system attributed to
 * Vettius Valens. Starting from a given lot (typically the Lot of Fortune
 * or Lot of Spirit), the technique assigns periods to successive signs.
 * Each sign's period length equals the minor years of its traditional ruler.
 *
 * Level 1 periods move through the signs starting from the lot's sign.
 * Level 2 subdivides each L1 period using the same logic, starting from
 * the L1 sign. Further levels can be computed recursively.
 *
 * @param lotSign - sign index of the starting lot (0 = Aries, 11 = Pisces)
 * @param maxAge - maximum age to generate (default 100)
 * @param maxLevel - deepest level to compute (default 2)
 * @returns flat array of ZRPeriod covering all levels up to maxLevel
 */
export function zodiacalReleasing(
  lotSign: number,
  maxAge: number = 100,
  maxLevel: number = 2,
): ZRPeriod[] {
  const results: ZRPeriod[] = []

  function generate(
    startSignIndex: number,
    startAge: number,
    remainingYears: number,
    level: number,
  ): void {
    if (level > maxLevel) return

    let currentAge = startAge
    let signIdx = startSignIndex

    while (currentAge < startAge + remainingYears && currentAge < maxAge) {
      const sign = SIGN_NAMES[signIdx % 12]
      const periodYears = zrPeriodForSign(sign)
      const ruler = TRADITIONAL_RULER[sign]

      // The period cannot exceed the remaining time in the parent period
      const maxRemaining = Math.min(
        periodYears,
        startAge + remainingYears - currentAge,
        maxAge - currentAge,
      )

      if (maxRemaining <= 0) break

      const endAge = currentAge + maxRemaining

      results.push({
        sign,
        lord: ruler,
        level,
        startAge: Math.round(currentAge * 1000) / 1000,
        endAge: Math.round(endAge * 1000) / 1000,
      })

      // Generate sub-levels within this period
      if (level < maxLevel) {
        generate(signIdx % 12, currentAge, maxRemaining, level + 1)
      }

      currentAge = endAge
      signIdx++
    }
  }

  generate(lotSign, 0, maxAge, 1)
  return results
}

// ─── Decennials ─────────────────────────────────────────────────────────────

/**
 * Decennial period lengths for each planet.
 *
 * The decennial system assigns periods of varying length to each of the
 * seven classical planets. The total cycle is approximately 75 years.
 * Day charts begin from the Sun; night charts from the Moon.
 *
 * Period lengths follow the scheme:
 *   Sun=10.5, Moon=9, Mercury=13, Venus=8, Mars=7, Jupiter=12, Saturn=11
 *   NorthNode=3, SouthNode=2
 *
 * This gives a total of 75.5 years, after which the sequence repeats.
 */
const DECENNIAL_DAY_SEQUENCE: { planet: Planet; years: number }[] = [
  { planet: 'Sun', years: 10.5 },
  { planet: 'Moon', years: 9 },
  { planet: 'Mercury', years: 13 },
  { planet: 'Venus', years: 8 },
  { planet: 'Mars', years: 7 },
  { planet: 'Jupiter', years: 12 },
  { planet: 'Saturn', years: 11 },
  { planet: 'NorthNode' as Planet, years: 3 },
  { planet: 'SouthNode' as Planet, years: 2 },
]

const DECENNIAL_NIGHT_SEQUENCE: { planet: Planet; years: number }[] = [
  { planet: 'Moon', years: 9 },
  { planet: 'Sun', years: 10.5 },
  { planet: 'Saturn', years: 11 },
  { planet: 'Jupiter', years: 12 },
  { planet: 'Mars', years: 7 },
  { planet: 'Venus', years: 8 },
  { planet: 'Mercury', years: 13 },
  { planet: 'NorthNode' as Planet, years: 3 },
  { planet: 'SouthNode' as Planet, years: 2 },
]

/**
 * Generate the Decennial time-lord sequence.
 *
 * Decennials are a Hellenistic timing technique closely related to
 * Firdaria. They assign planetary lordship to successive life periods
 * based on a fixed sequence and duration.
 *
 * @param isDayChart - true for a day birth, false for a night birth
 * @param maxAge - maximum age to generate (default 100)
 * @returns array of DecennialPeriod covering from age 0 to maxAge
 */
export function decennials(isDayChart: boolean, maxAge: number = 100): DecennialPeriod[] {
  const sequence = isDayChart ? DECENNIAL_DAY_SEQUENCE : DECENNIAL_NIGHT_SEQUENCE
  const results: DecennialPeriod[] = []

  let age = 0

  while (age < maxAge) {
    for (const entry of sequence) {
      if (age >= maxAge) break

      const endAge = Math.min(age + entry.years, maxAge)

      results.push({
        planet: entry.planet,
        startAge: Math.round(age * 1000) / 1000,
        endAge: Math.round(endAge * 1000) / 1000,
      })

      age = endAge
    }
  }

  return results
}
