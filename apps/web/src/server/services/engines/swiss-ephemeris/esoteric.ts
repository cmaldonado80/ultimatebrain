/**
 * Esoteric & Specialized Astrology
 *
 * Seven Rays, Medical Astrology, Financial Cycles,
 * Agricultural Calendar, and Mundane Context.
 */

import type { Planet, Position, ZodiacSign } from './engine'
import { PLANET_LIST, SIGN_NAMES, SIGN_ELEMENT } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RayAnalysis {
  rayDistribution: Record<number, number>
  dominantRays: number[]
  missingRays: number[]
}

export interface BodyPartMapping {
  sign: ZodiacSign
  region: string
  planets: Planet[]
}

export interface HumoralBalance {
  temperament: string
  hot: number
  cold: number
  moist: number
  dry: number
}

export interface MedicalVulnerability {
  sign: ZodiacSign
  region: string
  severity: string
  factors: string[]
}

export interface FinancialCycle {
  name: string
  planet1: Planet
  planet2: Planet
  separation: number
  phase: string
}

export interface GardenDay {
  moonSign: ZodiacSign
  gardenType: string
  activities: string[]
}

export interface MundaneContext {
  barbaultIndex: number
  mercuryRetrograde: boolean
  mercurySpeed: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Seven Rays mapped to zodiac signs (Alice Bailey / Esoteric Astrology) */
const SIGN_RAYS: Record<ZodiacSign, number[]> = {
  Aries: [1, 7],
  Taurus: [4],
  Gemini: [2],
  Cancer: [3, 7],
  Leo: [1, 5],
  Virgo: [2, 6],
  Libra: [3],
  Scorpio: [4],
  Sagittarius: [4, 5, 6],
  Capricorn: [1, 3, 7],
  Aquarius: [5],
  Pisces: [2, 6],
}

/** Descriptive names for the Seven Rays */
export const RAY_NAMES: Record<number, string> = {
  1: 'Will/Power',
  2: 'Love/Wisdom',
  3: 'Active Intelligence',
  4: 'Harmony/Conflict',
  5: 'Concrete Knowledge',
  6: 'Devotion/Idealism',
  7: 'Ceremonial Order',
}

/** Medical astrology: sign-to-body-region mapping */
const SIGN_BODY_PARTS: Record<ZodiacSign, string> = {
  Aries: 'Head',
  Taurus: 'Throat/Neck',
  Gemini: 'Arms/Lungs',
  Cancer: 'Stomach/Chest',
  Leo: 'Heart/Back',
  Virgo: 'Intestines',
  Libra: 'Kidneys/Lower Back',
  Scorpio: 'Reproductive',
  Sagittarius: 'Hips/Thighs',
  Capricorn: 'Knees/Bones',
  Aquarius: 'Ankles/Circulation',
  Pisces: 'Feet/Lymph',
}

/** Malefic planets that indicate medical stress */
const MALEFICS: Set<Planet> = new Set<Planet>(['Mars', 'Saturn', 'Pluto'])

/** Element-to-humoral quality mapping */
const ELEMENT_QUALITIES: Record<string, { hot: number; cold: number; moist: number; dry: number }> =
  {
    fire: { hot: 1, cold: 0, moist: 0, dry: 1 },
    earth: { hot: 0, cold: 1, moist: 0, dry: 1 },
    air: { hot: 1, cold: 0, moist: 1, dry: 0 },
    water: { hot: 0, cold: 1, moist: 1, dry: 0 },
  }

/** Outer planet pairs for financial cycle analysis */
const FINANCIAL_PAIRS: { name: string; planet1: Planet; planet2: Planet }[] = [
  { name: 'Jupiter-Saturn (~20yr)', planet1: 'Jupiter', planet2: 'Saturn' },
  { name: 'Jupiter-Uranus (~14yr)', planet1: 'Jupiter', planet2: 'Uranus' },
  { name: 'Jupiter-Neptune (~13yr)', planet1: 'Jupiter', planet2: 'Neptune' },
  { name: 'Saturn-Uranus (~45yr)', planet1: 'Saturn', planet2: 'Uranus' },
  { name: 'Saturn-Neptune (~36yr)', planet1: 'Saturn', planet2: 'Neptune' },
  { name: 'Uranus-Neptune (~172yr)', planet1: 'Uranus', planet2: 'Neptune' },
]

/** Lunation phase names by angular separation range */
const PHASE_NAMES: { min: number; max: number; name: string }[] = [
  { min: 0, max: 30, name: 'Conjunction' },
  { min: 30, max: 60, name: 'Crescent' },
  { min: 60, max: 90, name: 'First Quarter' },
  { min: 90, max: 120, name: 'Gibbous' },
  { min: 120, max: 180, name: 'Full' },
  { min: 180, max: 240, name: 'Disseminating' },
  { min: 240, max: 300, name: 'Last Quarter' },
  { min: 300, max: 360, name: 'Balsamic' },
]

/** Agricultural activities by garden type */
const GARDEN_ACTIVITIES: Record<string, string[]> = {
  Fruit: [
    'Plant fruit trees and vines',
    'Harvest fruits for storage',
    'Prune for fruit production',
    'Graft fruit trees',
  ],
  Root: [
    'Plant root vegetables (carrots, potatoes, beets)',
    'Transplant root crops',
    'Harvest root vegetables for storage',
    'Prepare soil and beds',
  ],
  Flower: [
    'Plant flowers and ornamentals',
    'Harvest flowers for display',
    'Trim and shape hedges',
    'Collect seeds',
  ],
  Leaf: [
    'Plant leafy greens (lettuce, spinach, herbs)',
    'Water and irrigate',
    'Harvest leafy vegetables',
    'Apply liquid fertilizer',
  ],
}

/** Outer planets for Barbault cyclic index */
const OUTER_PLANETS: Planet[] = ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute the angular separation from planet1 to planet2,
 * measured in the direction of increasing longitude (0-360).
 */
function forwardSeparation(lon1: number, lon2: number): number {
  let sep = lon2 - lon1
  if (sep < 0) sep += 360
  return sep
}

/**
 * Classify a separation angle into a synodic phase name.
 */
function classifyPhase(separation: number): string {
  const normalized = ((separation % 360) + 360) % 360
  for (const phase of PHASE_NAMES) {
    if (normalized >= phase.min && normalized < phase.max) {
      return phase.name
    }
  }
  return 'Balsamic'
}

// ─── Seven Rays ──────────────────────────────────────────────────────────────

/**
 * Analyze the Seven Rays distribution in a chart.
 *
 * Each planet in a sign contributes to the ray(s) associated with that sign.
 * Planets in signs with multiple ray associations contribute to all of them.
 */
export function sevenRays(planets: Record<Planet, Position>): RayAnalysis {
  const rayDistribution: Record<number, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
  }

  for (const name of PLANET_LIST) {
    const pos = planets[name]
    if (!pos) continue

    const rays = SIGN_RAYS[pos.sign]
    if (rays) {
      for (const ray of rays) {
        rayDistribution[ray]++
      }
    }
  }

  // Find dominant rays (highest count)
  const maxCount = Math.max(...Object.values(rayDistribution))
  const dominantRays: number[] = []
  const missingRays: number[] = []

  for (let r = 1; r <= 7; r++) {
    if (rayDistribution[r] === maxCount && maxCount > 0) {
      dominantRays.push(r)
    }
    if (rayDistribution[r] === 0) {
      missingRays.push(r)
    }
  }

  return { rayDistribution, dominantRays, missingRays }
}

// ─── Medical Astrology ───────────────────────────────────────────────────────

/**
 * Analyze a chart from a medical astrology perspective.
 *
 * Returns body part mappings (which signs have planets and what body regions
 * they correspond to), humoral balance based on elemental weighting, and
 * medical vulnerabilities where malefic planets stress particular body regions.
 */
export function medicalAstrology(planets: Record<Planet, Position>): {
  bodyParts: BodyPartMapping[]
  humoral: HumoralBalance
  vulnerabilities: MedicalVulnerability[]
} {
  // ── Body Parts ──
  // Group planets by sign
  const signPlanets: Record<ZodiacSign, Planet[]> = {} as Record<ZodiacSign, Planet[]>
  for (const s of SIGN_NAMES) {
    signPlanets[s] = []
  }

  for (const name of PLANET_LIST) {
    const pos = planets[name]
    if (!pos) continue
    signPlanets[pos.sign].push(name)
  }

  const bodyParts: BodyPartMapping[] = []
  for (const sign of SIGN_NAMES) {
    if (signPlanets[sign].length > 0) {
      bodyParts.push({
        sign,
        region: SIGN_BODY_PARTS[sign],
        planets: signPlanets[sign],
      })
    }
  }

  // ── Humoral Balance ──
  let hot = 0
  let cold = 0
  let moist = 0
  let dry = 0

  for (const name of PLANET_LIST) {
    const pos = planets[name]
    if (!pos) continue

    const element = SIGN_ELEMENT[pos.sign]
    const qualities = ELEMENT_QUALITIES[element]
    if (qualities) {
      hot += qualities.hot
      cold += qualities.cold
      moist += qualities.moist
      dry += qualities.dry
    }
  }

  // Determine dominant temperament
  let temperament: string
  if (hot >= cold && dry >= moist) {
    temperament = 'Choleric'
  } else if (cold >= hot && dry >= moist) {
    temperament = 'Melancholic'
  } else if (hot >= cold && moist >= dry) {
    temperament = 'Sanguine'
  } else {
    temperament = 'Phlegmatic'
  }

  const humoral: HumoralBalance = { temperament, hot, cold, moist, dry }

  // ── Vulnerabilities ──
  const vulnerabilities: MedicalVulnerability[] = []

  for (const sign of SIGN_NAMES) {
    const planetsInSign = signPlanets[sign]
    if (planetsInSign.length === 0) continue

    const maleficsInSign = planetsInSign.filter((p) => MALEFICS.has(p))
    if (maleficsInSign.length === 0) continue

    const factors: string[] = maleficsInSign.map((p) => `${p} in ${sign}`)

    // Check for additional stress: multiple malefics or hard aspects
    let severity: string
    if (maleficsInSign.length >= 2) {
      severity = 'High'
      factors.push('Multiple malefics concentrated')
    } else if (
      maleficsInSign.includes('Saturn' as Planet) &&
      maleficsInSign.includes('Mars' as Planet)
    ) {
      severity = 'High'
      factors.push('Mars-Saturn conjunction zone')
    } else {
      severity = 'Moderate'
    }

    // Check if any malefic in this sign is stressed by hard aspects from others
    for (const malefic of maleficsInSign) {
      const malPos = planets[malefic]
      if (!malPos) continue
      for (const otherName of PLANET_LIST) {
        if (otherName === malefic) continue
        const otherPos = planets[otherName]
        if (!otherPos) continue
        let diff = Math.abs(malPos.longitude - otherPos.longitude)
        if (diff > 180) diff = 360 - diff
        // Square or opposition within 8 degrees
        if (Math.abs(diff - 90) < 8 || Math.abs(diff - 180) < 8) {
          factors.push(`${malefic} hard aspect from ${otherName}`)
          severity = 'High'
        }
      }
    }

    vulnerabilities.push({
      sign,
      region: SIGN_BODY_PARTS[sign],
      severity,
      factors,
    })
  }

  return { bodyParts, humoral, vulnerabilities }
}

// ─── Financial Cycles ────────────────────────────────────────────────────────

/**
 * Analyze major outer-planet synodic cycles relevant to financial astrology.
 *
 * For each pair, calculates the angular separation and classifies the
 * current phase of their cycle.
 */
export function financialCycles(planets: Record<Planet, Position>): FinancialCycle[] {
  const cycles: FinancialCycle[] = []

  for (const pair of FINANCIAL_PAIRS) {
    const pos1 = planets[pair.planet1]
    const pos2 = planets[pair.planet2]
    if (!pos1 || !pos2) continue

    const separation = forwardSeparation(pos1.longitude, pos2.longitude)
    const phase = classifyPhase(separation)

    cycles.push({
      name: pair.name,
      planet1: pair.planet1,
      planet2: pair.planet2,
      separation: Math.round(separation * 100) / 100,
      phase,
    })
  }

  return cycles
}

// ─── Agricultural Calendar ───────────────────────────────────────────────────

/**
 * Determine the garden day type and recommended activities based on Moon sign.
 *
 * Biodynamic gardening maps the Moon's sign element to plant types:
 *   Fire signs  -> Fruit days
 *   Earth signs -> Root days
 *   Air signs   -> Flower days
 *   Water signs -> Leaf days
 */
export function agriculturalCalendar(moonSign: ZodiacSign): GardenDay {
  const element = SIGN_ELEMENT[moonSign]

  let gardenType: string
  switch (element) {
    case 'fire':
      gardenType = 'Fruit'
      break
    case 'earth':
      gardenType = 'Root'
      break
    case 'air':
      gardenType = 'Flower'
      break
    case 'water':
      gardenType = 'Leaf'
      break
    default:
      gardenType = 'Leaf'
  }

  const activities = GARDEN_ACTIVITIES[gardenType] ?? []

  return {
    moonSign,
    gardenType,
    activities,
  }
}

// ─── Mundane Context ─────────────────────────────────────────────────────────

/**
 * Calculate mundane astrological context indicators.
 *
 * - Barbault Cyclic Index: sum of angular separations between all pairs of
 *   outer planets (Jupiter through Pluto). Higher values indicate periods of
 *   expansion and growth; lower values correlate with crisis periods.
 *
 * - Mercury retrograde status: determined by Mercury's ecliptic speed.
 *   Negative speed = retrograde motion.
 */
export function mundaneContext(planets: Record<Planet, Position>): MundaneContext {
  // ── Barbault Cyclic Index ──
  // Sum of the shortest angular separations between all unique pairs
  // of the 5 outer planets (Jupiter, Saturn, Uranus, Neptune, Pluto)
  let barbaultIndex = 0

  for (let i = 0; i < OUTER_PLANETS.length; i++) {
    for (let j = i + 1; j < OUTER_PLANETS.length; j++) {
      const p1 = planets[OUTER_PLANETS[i]]
      const p2 = planets[OUTER_PLANETS[j]]
      if (!p1 || !p2) continue

      // Use the shortest arc between the two planets
      let diff = Math.abs(p1.longitude - p2.longitude)
      if (diff > 180) diff = 360 - diff
      barbaultIndex += diff
    }
  }

  barbaultIndex = Math.round(barbaultIndex * 100) / 100

  // ── Mercury Retrograde ──
  const mercuryPos = planets.Mercury
  const mercurySpeed = mercuryPos?.speed ?? 0
  const mercuryRetrograde = mercurySpeed < 0

  return {
    barbaultIndex,
    mercuryRetrograde,
    mercurySpeed: Math.round(mercurySpeed * 10000) / 10000,
  }
}
