/**
 * Accidental Dignities, Sect Analysis, Critical Degrees & Lilly Scoring
 *
 * Advanced traditional astrology calculations for planetary condition assessment.
 */

import type { Planet, Position, HouseCusps, Aspect, ZodiacSign, Dignity } from './engine'
import { PLANET_LIST, SIGN_MODE } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SectAnalysis {
  chartSect: 'day' | 'night'
  sectLight: Planet
  sectBenefic: Planet
  sectMalefic: Planet
  planetSect: Record<Planet, 'in-sect' | 'out-of-sect' | 'neutral'>
}

export interface AccidentalDignityResult {
  planet: Planet
  house: number
  angularScore: number
  isHayz: boolean
  isOriental: boolean
  speedClass: 'fast' | 'slow' | 'normal'
  isBesieged: boolean
  totalScore: number
}

export interface CriticalDegreeResult {
  planet: Planet
  degree: number
  sign: ZodiacSign
  type: string
  description: string
}

export interface LillyScoreResult {
  planet: Planet
  essentialScore: number
  accidentalScore: number
  totalScore: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Masculine signs (fire and air) */
const MASCULINE_SIGNS = new Set<ZodiacSign>([
  'Aries',
  'Gemini',
  'Leo',
  'Libra',
  'Sagittarius',
  'Aquarius',
])

/** Feminine signs (earth and water) */
const FEMININE_SIGNS = new Set<ZodiacSign>([
  'Taurus',
  'Cancer',
  'Virgo',
  'Scorpio',
  'Capricorn',
  'Pisces',
])

/** Diurnal planets */
const DIURNAL_PLANETS = new Set<Planet>(['Sun', 'Jupiter', 'Saturn'])

/** Nocturnal planets */
const NOCTURNAL_PLANETS = new Set<Planet>(['Moon', 'Venus', 'Mars'])

/** Mean daily motions for speed comparison */
const MEAN_DAILY_MOTION: Partial<Record<Planet, number>> = {
  Sun: 0.9856,
  Moon: 13.1763,
  Mercury: 1.383,
  Venus: 1.2,
  Mars: 0.524,
  Jupiter: 0.0831,
  Saturn: 0.0335,
  Uranus: 0.0117,
  Neptune: 0.006,
  Pluto: 0.004,
}

/** Angular houses */
const ANGULAR_HOUSES = new Set([1, 4, 7, 10])

/** Succedent houses */
const SUCCEDENT_HOUSES = new Set([2, 5, 8, 11])

/** Cardinal critical degrees */
const CARDINAL_CRITICAL = [0, 13, 26]

/** Fixed critical degrees */
const FIXED_CRITICAL = [8, 9, 21, 22]

/** Mutable critical degrees */
const MUTABLE_CRITICAL = [4, 17]

/** Cardinal signs for Aries Point detection */
const CARDINAL_SIGNS = new Set<ZodiacSign>(['Aries', 'Cancer', 'Libra', 'Capricorn'])

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determine if a planet is above the horizon.
 * Houses 7-12 are above the horizon (DSC to ASC via MC).
 */
function isAboveHorizon(house: number): boolean {
  return house >= 7 && house <= 12
}

/**
 * Normalise angle to 0-360.
 */
function norm360(a: number): number {
  return ((a % 360) + 360) % 360
}

// ─── Sect Analysis ───────────────────────────────────────────────────────────

/**
 * Determine chart sect (day or night) and each planet's sect status.
 *
 * Day chart: Sun above the horizon (houses 7-12).
 * Night chart: Sun below the horizon (houses 1-6).
 */
export function sectAnalysis(planets: Record<Planet, Position>, _houses: HouseCusps): SectAnalysis {
  const sunHouse = planets.Sun?.house ?? 1
  const chartSect: 'day' | 'night' = isAboveHorizon(sunHouse) ? 'day' : 'night'

  const sectLight: Planet = chartSect === 'day' ? 'Sun' : 'Moon'
  const sectBenefic: Planet = chartSect === 'day' ? 'Jupiter' : 'Venus'
  const sectMalefic: Planet = chartSect === 'day' ? 'Saturn' : 'Mars'

  const planetSect = {} as Record<Planet, 'in-sect' | 'out-of-sect' | 'neutral'>

  for (const planet of PLANET_LIST) {
    const pos = planets[planet]
    if (!pos) {
      planetSect[planet] = 'neutral'
      continue
    }

    if (planet === 'Mercury') {
      // Mercury's sect depends on whether it rises before (oriental) or after (occidental) the Sun
      const sunLon = planets.Sun?.longitude ?? 0
      const mercLon = pos.longitude
      const diff = norm360(mercLon - sunLon)
      // Oriental = rises before Sun = longitude is less than Sun (ahead in zodiacal order)
      // In practice: Mercury's longitude > Sun's longitude means it sets after Sun (occidental)
      // Mercury < Sun means it rises before Sun (oriental/diurnal)
      if (diff > 180) {
        // Mercury is behind the Sun (oriental) -> diurnal
        planetSect[planet] = chartSect === 'day' ? 'in-sect' : 'out-of-sect'
      } else {
        // Mercury is ahead of the Sun (occidental) -> nocturnal
        planetSect[planet] = chartSect === 'night' ? 'in-sect' : 'out-of-sect'
      }
      continue
    }

    const above = isAboveHorizon(pos.house)

    if (DIURNAL_PLANETS.has(planet)) {
      // Diurnal planets are in-sect when: above horizon by day OR below horizon by night
      if ((chartSect === 'day' && above) || (chartSect === 'night' && !above)) {
        planetSect[planet] = 'in-sect'
      } else {
        planetSect[planet] = 'out-of-sect'
      }
    } else if (NOCTURNAL_PLANETS.has(planet)) {
      // Nocturnal planets are in-sect when: below horizon by day OR above horizon by night
      if ((chartSect === 'day' && !above) || (chartSect === 'night' && above)) {
        planetSect[planet] = 'in-sect'
      } else {
        planetSect[planet] = 'out-of-sect'
      }
    } else {
      // Outer planets, nodes, etc.
      planetSect[planet] = 'neutral'
    }
  }

  return { chartSect, sectLight, sectBenefic, sectMalefic, planetSect }
}

// ─── Accidental Dignities ────────────────────────────────────────────────────

/**
 * Calculate accidental dignities for all planets.
 *
 * Factors: house angularity, hayz, oriental/occidental, speed, besiegement.
 */
export function accidentalDignities(
  planets: Record<Planet, Position>,
  _houses: HouseCusps,
  _aspects: Aspect[],
): AccidentalDignityResult[] {
  const sunLon = planets.Sun?.longitude ?? 0
  const sunHouse = planets.Sun?.house ?? 1
  const isDay = isAboveHorizon(sunHouse)

  // Pre-compute Mars and Saturn longitudes for besiegement checks
  const marsLon = planets.Mars?.longitude ?? -1
  const saturnLon = planets.Saturn?.longitude ?? -1

  const results: AccidentalDignityResult[] = []

  for (const planet of PLANET_LIST) {
    const pos = planets[planet]
    if (!pos) continue

    const house = pos.house
    let totalScore = 0

    // Angular score
    let angularScore = 1 // Cadent default
    if (ANGULAR_HOUSES.has(house)) {
      angularScore = 5
    } else if (SUCCEDENT_HOUSES.has(house)) {
      angularScore = 3
    }
    totalScore += angularScore

    // Hayz: diurnal planet in masculine sign above horizon by day,
    // or nocturnal planet in feminine sign below horizon by night
    let isHayz = false
    const above = isAboveHorizon(house)
    if (isDay && DIURNAL_PLANETS.has(planet) && MASCULINE_SIGNS.has(pos.sign) && above) {
      isHayz = true
    } else if (!isDay && NOCTURNAL_PLANETS.has(planet) && FEMININE_SIGNS.has(pos.sign) && !above) {
      isHayz = true
    }
    if (isHayz) totalScore += 2

    // Oriental/Occidental
    // Inner planets (Mercury, Venus) are oriental when their longitude > Sun's longitude
    // Outer planets (Mars, Jupiter, Saturn, etc.) are oriental when their longitude < Sun's longitude
    const innerPlanets = new Set<Planet>(['Mercury', 'Venus'])
    const outerPlanets = new Set<Planet>([
      'Mars',
      'Jupiter',
      'Saturn',
      'Uranus',
      'Neptune',
      'Pluto',
    ])
    let isOriental = false

    if (innerPlanets.has(planet)) {
      const diff = norm360(pos.longitude - sunLon)
      isOriental = diff > 0 && diff < 180
    } else if (outerPlanets.has(planet)) {
      const diff = norm360(pos.longitude - sunLon)
      isOriental = diff > 180
    }
    if (isOriental) totalScore += 1

    // Speed class
    const meanMotion = MEAN_DAILY_MOTION[planet]
    let speedClass: 'fast' | 'slow' | 'normal' = 'normal'
    if (meanMotion) {
      const absSpeed = Math.abs(pos.speed)
      if (absSpeed > meanMotion * 1.1) {
        speedClass = 'fast'
        totalScore += 2
      } else if (absSpeed < meanMotion * 0.9) {
        speedClass = 'slow'
        totalScore -= 2
      }
    }

    // Retrograde penalty
    if (pos.retrograde) {
      totalScore -= 5
    }

    // Besieged: planet is between Mars and Saturn by longitude
    let isBesieged = false
    if (planet !== 'Mars' && planet !== 'Saturn' && marsLon >= 0 && saturnLon >= 0) {
      const pLon = pos.longitude
      const lo = Math.min(marsLon, saturnLon)
      const hi = Math.max(marsLon, saturnLon)

      // Check if planet is between Mars and Saturn (considering the shorter arc)
      const arcDirect = hi - lo
      if (arcDirect <= 180) {
        // Shorter arc is the direct path
        if (pLon > lo && pLon < hi) {
          isBesieged = true
        }
      } else {
        // Shorter arc wraps around 0
        if (pLon > hi || pLon < lo) {
          isBesieged = true
        }
      }
    }
    if (isBesieged) totalScore -= 5

    results.push({
      planet,
      house,
      angularScore,
      isHayz,
      isOriental,
      speedClass,
      isBesieged,
      totalScore,
    })
  }

  return results
}

// ─── Critical Degrees ────────────────────────────────────────────────────────

/**
 * Identify planets at critical degrees.
 *
 * - 0 degrees of any sign: initial degree (beginning of a new sign energy)
 * - 29 degrees of any sign: anaretic degree (urgent, final energy)
 * - Cardinal signs (Aries, Cancer, Libra, Capricorn): 0, 13, 26
 * - Fixed signs (Taurus, Leo, Scorpio, Aquarius): 8-9, 21-22
 * - Mutable signs (Gemini, Virgo, Sagittarius, Pisces): 4, 17
 * - Aries Points: 0 degrees of cardinal signs
 */
export function criticalDegrees(planets: Record<Planet, Position>): CriticalDegreeResult[] {
  const results: CriticalDegreeResult[] = []

  for (const planet of PLANET_LIST) {
    const pos = planets[planet]
    if (!pos) continue

    const degree = pos.degree
    const sign = pos.sign
    const mode = SIGN_MODE[sign]

    // Initial degree (0)
    if (degree === 0) {
      results.push({
        planet,
        degree,
        sign,
        type: 'initial',
        description: `${planet} at 0 degrees ${sign} — entering new sign energy, fresh and unformed`,
      })
    }

    // Anaretic degree (29)
    if (degree === 29) {
      results.push({
        planet,
        degree,
        sign,
        type: 'anaretic',
        description: `${planet} at 29 degrees ${sign} — urgent, culminating energy about to shift`,
      })
    }

    // Mode-specific critical degrees
    if (mode === 'cardinal') {
      if (CARDINAL_CRITICAL.includes(degree)) {
        results.push({
          planet,
          degree,
          sign,
          type: 'cardinal-critical',
          description: `${planet} at ${degree} degrees ${sign} — cardinal critical degree, crisis point for action`,
        })
      }
    } else if (mode === 'fixed') {
      if (FIXED_CRITICAL.includes(degree)) {
        results.push({
          planet,
          degree,
          sign,
          type: 'fixed-critical',
          description: `${planet} at ${degree} degrees ${sign} — fixed critical degree, intensified stubborn energy`,
        })
      }
    } else if (mode === 'mutable') {
      if (MUTABLE_CRITICAL.includes(degree)) {
        results.push({
          planet,
          degree,
          sign,
          type: 'mutable-critical',
          description: `${planet} at ${degree} degrees ${sign} — mutable critical degree, point of mental tension`,
        })
      }
    }

    // Aries Point: 0 degrees of cardinal signs
    if (degree === 0 && CARDINAL_SIGNS.has(sign)) {
      results.push({
        planet,
        degree,
        sign,
        type: 'aries-point',
        description: `${planet} at 0 degrees ${sign} — Aries Point, public visibility and world-stage events`,
      })
    }
  }

  return results
}

// ─── Lilly Dignity Score ─────────────────────────────────────────────────────

/**
 * Calculate essential and accidental dignity scores per William Lilly's point system.
 *
 * Essential dignities: domicile (+5), exaltation (+4), triplicity (+3), term (+2), face (+1),
 *                      detriment (-5), fall (-4), peregrine (-5).
 * Accidental dignities: house position, speed, combustion, retrograde.
 */
export function lillyDignityScore(
  planets: Record<Planet, Position>,
  dignities: Record<Planet, Dignity>,
  _houses: HouseCusps,
  _aspects: Aspect[],
): LillyScoreResult[] {
  const sunLon = planets.Sun?.longitude ?? 0
  const results: LillyScoreResult[] = []

  for (const planet of PLANET_LIST) {
    const pos = planets[planet]
    const dignity = dignities[planet]
    if (!pos || !dignity) continue

    // ── Essential Score ──
    let essentialScore = 0

    if (dignity.domicile) essentialScore += 5
    if (dignity.exaltation) essentialScore += 4
    if (dignity.triplicity) essentialScore += 3
    if (dignity.term) essentialScore += 2
    if (dignity.face) essentialScore += 1
    if (dignity.detriment) essentialScore -= 5
    if (dignity.fall) essentialScore -= 4
    if (dignity.peregrine) essentialScore -= 5

    // ── Accidental Score ──
    let accidentalScore = 0

    // House position scoring (Lilly's table)
    const house = pos.house
    switch (house) {
      case 1:
        accidentalScore += 5
        break
      case 10:
        accidentalScore += 5
        break
      case 7:
        accidentalScore += 4
        break
      case 4:
        accidentalScore += 3
        break
      case 11:
        accidentalScore += 4
        break
      case 5:
        accidentalScore += 3
        break
      case 2:
        accidentalScore += 2
        break
      case 9:
        accidentalScore += 2
        break
      case 3:
        accidentalScore += 1
        break
      case 8:
        accidentalScore -= 2
        break
      case 12:
        accidentalScore -= 5
        break
      case 6:
        accidentalScore -= 2
        break
    }

    // Speed bonus/penalty
    const meanMotion = MEAN_DAILY_MOTION[planet]
    if (meanMotion) {
      const absSpeed = Math.abs(pos.speed)
      if (absSpeed > meanMotion * 1.1) {
        accidentalScore += 2 // Swift in motion
      } else if (absSpeed < meanMotion * 0.5) {
        accidentalScore -= 2 // Slow in motion
      }
    }

    // Retrograde penalty
    if (pos.retrograde) {
      accidentalScore -= 5
    }

    // Combustion: planet within 8.5 degrees of the Sun (not the Sun itself)
    if (planet !== 'Sun') {
      const distFromSun = Math.abs(pos.longitude - sunLon)
      const angularDist = distFromSun > 180 ? 360 - distFromSun : distFromSun

      if (angularDist < 0.2833) {
        // Cazimi: within 17 arcminutes — extremely dignified
        accidentalScore += 5
      } else if (angularDist < 8.5) {
        // Combust
        accidentalScore -= 5
      } else if (angularDist < 17) {
        // Under the Sun's beams
        accidentalScore -= 4
      }
    }

    const totalScore = essentialScore + accidentalScore

    results.push({
      planet,
      essentialScore,
      accidentalScore,
      totalScore,
    })
  }

  return results.sort((a, b) => b.totalScore - a.totalScore)
}
