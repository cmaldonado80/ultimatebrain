/**
 * Electional Astrology Scoring Engine
 *
 * Scores a candidate date/time for starting an activity by evaluating
 * planetary positions, dignities, aspects, and planetary hours against
 * traditional electional criteria.
 */

import { planetaryHours } from './classical'
import {
  type Aspect,
  type NatalChart,
  type Planet,
  run,
  type SwissEphemerisInput,
  type ZodiacSign,
} from './engine'
import { julianDay } from './engine'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ElectionalInput {
  candidateTime: { year: number; month: number; day: number; hour: number }
  latitude: number
  longitude: number
  activityType:
    | 'business'
    | 'relationship'
    | 'travel'
    | 'medical'
    | 'legal'
    | 'creative'
    | 'general'
}

export interface ElectionalResult {
  score: number // 0-100
  grade: 'excellent' | 'good' | 'fair' | 'poor' | 'avoid'
  factors: ElectionalFactor[]
  bestHours: { hour: number; ruler: Planet; suitability: string }[]
  recommendation: string
}

interface ElectionalFactor {
  name: string
  score: number // -20 to +20
  description: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SIGN_RULERS: Record<ZodiacSign, Planet> = {
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

const BENEFICS: Planet[] = ['Venus', 'Jupiter']
const MALEFICS: Planet[] = ['Mars', 'Saturn']

const TRADITIONAL_PLANETS: Planet[] = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
]

/** Moon signs that are particularly compatible with each activity type. */
const COMPATIBLE_MOON_SIGNS: Record<ElectionalInput['activityType'], ZodiacSign[]> = {
  business: ['Capricorn', 'Taurus', 'Virgo', 'Leo'],
  relationship: ['Libra', 'Taurus', 'Cancer', 'Pisces'],
  travel: ['Sagittarius', 'Gemini', 'Aquarius'],
  medical: ['Virgo', 'Scorpio', 'Pisces'],
  legal: ['Libra', 'Sagittarius', 'Aquarius'],
  creative: ['Leo', 'Pisces', 'Libra', 'Aquarius'],
  general: ['Taurus', 'Cancer', 'Leo', 'Libra', 'Sagittarius'],
}

/** Planets whose planetary hour is considered favorable for each activity type. */
const FAVORABLE_HOUR_RULERS: Record<ElectionalInput['activityType'], Planet[]> = {
  business: ['Jupiter', 'Sun', 'Saturn'],
  relationship: ['Venus', 'Moon', 'Jupiter'],
  travel: ['Mercury', 'Jupiter', 'Moon'],
  medical: ['Jupiter', 'Venus', 'Moon'],
  legal: ['Jupiter', 'Sun', 'Mercury'],
  creative: ['Venus', 'Moon', 'Mercury'],
  general: ['Jupiter', 'Venus', 'Sun'],
}

const DOMICILE_SIGNS: Record<Planet, ZodiacSign[]> = {
  Sun: ['Leo'],
  Moon: ['Cancer'],
  Mercury: ['Gemini', 'Virgo'],
  Venus: ['Taurus', 'Libra'],
  Mars: ['Aries', 'Scorpio'],
  Jupiter: ['Sagittarius', 'Pisces'],
  Saturn: ['Capricorn', 'Aquarius'],
  Uranus: ['Aquarius'],
  Neptune: ['Pisces'],
  Pluto: ['Scorpio'],
  NorthNode: [],
  SouthNode: [],
  Chiron: [],
  Lilith: [],
}

const EXALTATION_SIGNS: Record<string, ZodiacSign> = {
  Sun: 'Aries',
  Moon: 'Taurus',
  Mercury: 'Virgo',
  Venus: 'Pisces',
  Mars: 'Capricorn',
  Jupiter: 'Cancer',
  Saturn: 'Libra',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function signAtCusp(cusps: number[], houseNumber: number): ZodiacSign {
  const SIGN_NAMES: ZodiacSign[] = [
    'Aries',
    'Taurus',
    'Gemini',
    'Cancer',
    'Leo',
    'Virgo',
    'Libra',
    'Scorpio',
    'Sagittarius',
    'Capricorn',
    'Aquarius',
    'Pisces',
  ]
  const longitude = cusps[houseNumber - 1] ?? 0
  return SIGN_NAMES[Math.floor(longitude / 30)]
}

function isDignified(planet: Planet, sign: ZodiacSign): boolean {
  if (DOMICILE_SIGNS[planet]?.includes(sign)) return true
  if (EXALTATION_SIGNS[planet] === sign) return true
  return false
}

function isMoonVoidOfCourse(chart: NatalChart): boolean {
  const moonAspects = chart.aspects.filter(
    (a) =>
      (a.planet1 === 'Moon' || a.planet2 === 'Moon') &&
      a.applying &&
      TRADITIONAL_PLANETS.includes(a.planet1 === 'Moon' ? a.planet2 : a.planet1),
  )
  return moonAspects.length === 0
}

function getMoonApplyingAspects(chart: NatalChart): Aspect[] {
  return chart.aspects.filter(
    (a) =>
      (a.planet1 === 'Moon' || a.planet2 === 'Moon') &&
      a.applying &&
      TRADITIONAL_PLANETS.includes(a.planet1 === 'Moon' ? a.planet2 : a.planet1),
  )
}

function getOtherPlanet(aspect: Aspect): Planet {
  return aspect.planet1 === 'Moon' ? aspect.planet2 : aspect.planet1
}

function gradeFromScore(score: number): ElectionalResult['grade'] {
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'good'
  if (score >= 40) return 'fair'
  if (score >= 20) return 'poor'
  return 'avoid'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ─── Scoring functions ──────────────────────────────────────────────────────

function scoreMoonVoidOfCourse(chart: NatalChart): ElectionalFactor | null {
  if (isMoonVoidOfCourse(chart)) {
    return {
      name: 'Moon Void of Course',
      score: -20,
      description:
        'The Moon makes no applying aspects to traditional planets — actions begun now tend to come to nothing.',
    }
  }
  return null
}

function scoreMoonApplyingAspects(chart: NatalChart): ElectionalFactor[] {
  const factors: ElectionalFactor[] = []
  const applyingAspects = getMoonApplyingAspects(chart)

  for (const aspect of applyingAspects) {
    const other = getOtherPlanet(aspect)
    if (BENEFICS.includes(other)) {
      factors.push({
        name: `Moon applying to ${other}`,
        score: 15,
        description: `The Moon applies to benefic ${other} by ${aspect.type} — favorable for initiating activities.`,
      })
    } else if (MALEFICS.includes(other)) {
      factors.push({
        name: `Moon applying to ${other}`,
        score: -10,
        description: `The Moon applies to malefic ${other} by ${aspect.type} — obstacles or difficulties may arise.`,
      })
    }
  }

  return factors
}

function scoreMoonSign(
  chart: NatalChart,
  activityType: ElectionalInput['activityType'],
): ElectionalFactor | null {
  const moonSign = chart.planets.Moon.sign
  if (COMPATIBLE_MOON_SIGNS[activityType].includes(moonSign)) {
    return {
      name: 'Moon in compatible sign',
      score: 10,
      description: `The Moon in ${moonSign} is well suited for ${activityType} activities.`,
    }
  }
  return null
}

function scorePlanetaryHour(
  jd: number,
  latitude: number,
  longitude: number,
  activityType: ElectionalInput['activityType'],
  candidateHour: number,
): ElectionalFactor | null {
  const hours = planetaryHours(jd, latitude, longitude)
  // Find the planetary hour that covers the candidate time
  const currentHour = hours.find((h) => h.hourNumber === Math.floor(candidateHour) % 24)
  if (!currentHour) return null

  const ruler = currentHour.ruler
  if (FAVORABLE_HOUR_RULERS[activityType].includes(ruler)) {
    return {
      name: 'Favorable planetary hour',
      score: 10,
      description: `The planetary hour is ruled by ${ruler}, which is favorable for ${activityType}.`,
    }
  }
  return null
}

function scoreAscendantRuler(chart: NatalChart): ElectionalFactor[] {
  const factors: ElectionalFactor[] = []
  const ascSign = signAtCusp(chart.houses.cusps, 1)
  const ascRuler = SIGN_RULERS[ascSign]
  const ascRulerPos = chart.planets[ascRuler]

  if (isDignified(ascRuler, ascRulerPos.sign)) {
    factors.push({
      name: 'ASC ruler dignified',
      score: 10,
      description: `The ascendant ruler ${ascRuler} is dignified in ${ascRulerPos.sign}, strengthening the chart.`,
    })
  }

  if (ascRulerPos.retrograde) {
    factors.push({
      name: 'ASC ruler retrograde',
      score: -10,
      description: `The ascendant ruler ${ascRuler} is retrograde — delays, reversals, or reconsiderations are likely.`,
    })
  }

  return factors
}

function scoreBeneficsMaleficsInAngles(chart: NatalChart): ElectionalFactor[] {
  const factors: ElectionalFactor[] = []
  const angularHouses = [1, 10]

  for (const planet of BENEFICS) {
    if (angularHouses.includes(chart.planets[planet].house)) {
      factors.push({
        name: `${planet} in angular house`,
        score: 10,
        description: `Benefic ${planet} is in house ${chart.planets[planet].house}, strengthening the election.`,
      })
    }
  }

  for (const planet of MALEFICS) {
    if (angularHouses.includes(chart.planets[planet].house)) {
      factors.push({
        name: `${planet} in angular house`,
        score: -10,
        description: `Malefic ${planet} is in house ${chart.planets[planet].house}, creating challenges.`,
      })
    }
  }

  return factors
}

function scoreMercuryRetrograde(
  chart: NatalChart,
  activityType: ElectionalInput['activityType'],
): ElectionalFactor | null {
  if (
    chart.planets.Mercury.retrograde &&
    (activityType === 'business' || activityType === 'travel' || activityType === 'legal')
  ) {
    return {
      name: 'Mercury retrograde',
      score: -5,
      description:
        'Mercury is retrograde — contracts, communication, and travel plans are prone to errors and misunderstandings.',
    }
  }
  return null
}

function scoreNoMajorAfflictions(chart: NatalChart): ElectionalFactor | null {
  // Check that Moon is not afflicted by hard aspects from malefics
  const moonHardAspects = chart.aspects.filter(
    (a) =>
      (a.planet1 === 'Moon' || a.planet2 === 'Moon') &&
      a.applying &&
      (a.type === 'Square' || a.type === 'Opposition') &&
      MALEFICS.includes(a.planet1 === 'Moon' ? a.planet2 : a.planet1),
  )
  if (moonHardAspects.length === 0) {
    return {
      name: 'No major afflictions',
      score: 5,
      description: 'The Moon is free from hard aspects to malefics — a clean start.',
    }
  }
  return null
}

// ─── Best hours computation ─────────────────────────────────────────────────

function computeBestHours(
  jd: number,
  latitude: number,
  longitude: number,
  activityType: ElectionalInput['activityType'],
): ElectionalResult['bestHours'] {
  const hours = planetaryHours(jd, latitude, longitude)
  return hours.map((h) => {
    const favorable = FAVORABLE_HOUR_RULERS[activityType].includes(h.ruler)
    return {
      hour: h.hourNumber,
      ruler: h.ruler,
      suitability: favorable ? 'favorable' : 'neutral',
    }
  })
}

// ─── Main entry point ───────────────────────────────────────────────────────

export async function scoreElection(input: {
  year: number
  month: number
  day: number
  hour: number
  latitude: number
  longitude: number
  activityType: ElectionalInput['activityType']
}): Promise<ElectionalResult> {
  const { year, month, day, hour, latitude, longitude, activityType } = input

  // 1. Compute chart at candidate time
  const engineInput: SwissEphemerisInput = {
    birthYear: year,
    birthMonth: month,
    birthDay: day,
    birthHour: hour,
    latitude,
    longitude,
    houseSystem: 'P', // Placidus for electional
  }
  const result = await run(engineInput)
  const chart = result.data

  const jd = julianDay(year, month, day, hour)

  // 2. Collect all scoring factors
  const factors: ElectionalFactor[] = []

  const vocFactor = scoreMoonVoidOfCourse(chart)
  if (vocFactor) factors.push(vocFactor)

  factors.push(...scoreMoonApplyingAspects(chart))

  const moonSignFactor = scoreMoonSign(chart, activityType)
  if (moonSignFactor) factors.push(moonSignFactor)

  const hourFactor = scorePlanetaryHour(jd, latitude, longitude, activityType, hour)
  if (hourFactor) factors.push(hourFactor)

  factors.push(...scoreAscendantRuler(chart))
  factors.push(...scoreBeneficsMaleficsInAngles(chart))

  const mercuryFactor = scoreMercuryRetrograde(chart, activityType)
  if (mercuryFactor) factors.push(mercuryFactor)

  const cleanFactor = scoreNoMajorAfflictions(chart)
  if (cleanFactor) factors.push(cleanFactor)

  // 3. Compute total score (base 50, clamped 0-100)
  const rawScore = factors.reduce((sum, f) => sum + f.score, 50)
  const score = clamp(rawScore, 0, 100)
  const grade = gradeFromScore(score)

  // 4. Best hours for the day
  const bestHours = computeBestHours(jd, latitude, longitude, activityType)

  // 5. Generate recommendation
  const recommendation = buildRecommendation(grade, factors, activityType)

  return { score, grade, factors, bestHours, recommendation }
}

// ─── Recommendation builder ─────────────────────────────────────────────────

function buildRecommendation(
  grade: ElectionalResult['grade'],
  factors: ElectionalFactor[],
  activityType: ElectionalInput['activityType'],
): string {
  const positives = factors.filter((f) => f.score > 0)
  const negatives = factors.filter((f) => f.score < 0)

  const parts: string[] = []

  switch (grade) {
    case 'excellent':
      parts.push(`This is an excellent time to begin ${activityType} activities.`)
      break
    case 'good':
      parts.push(
        `This is a good time for ${activityType} activities, with favorable conditions overall.`,
      )
      break
    case 'fair':
      parts.push(
        `Conditions are mixed for ${activityType} activities — proceed with awareness of potential challenges.`,
      )
      break
    case 'poor':
      parts.push(
        `This is a difficult time for ${activityType} activities — consider postponing if possible.`,
      )
      break
    case 'avoid':
      parts.push(
        `Strongly unfavorable conditions for ${activityType} activities — it is advisable to choose another time.`,
      )
      break
  }

  if (positives.length > 0) {
    parts.push(`Strengths: ${positives.map((f) => f.name.toLowerCase()).join(', ')}.`)
  }

  if (negatives.length > 0) {
    parts.push(`Concerns: ${negatives.map((f) => f.name.toLowerCase()).join(', ')}.`)
  }

  return parts.join(' ')
}
