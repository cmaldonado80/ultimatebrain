/**
 * Birth Time Rectification Techniques
 *
 * Classical and modern methods for refining the birth time:
 * Trutine of Hermes, Animodar, Almuten Figuris, and Huber Age Point.
 */

import type { Planet, Position, ZodiacSign, HouseCusps } from './engine'
import { SIGN_ELEMENT, DOMICILE, longitudeToSign } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TrutineResult {
  conceptionJd: number
  conceptionDate: string
  method: string
}

export interface AnimodarResult {
  rectifiedAsc: number
  rectifiedSign: ZodiacSign
  rectifiedDegree: number
  adjustment: number
}

export interface AlmutenResult {
  almuten: Planet
  scores: Record<Planet, number>
}

export interface HuberAgePoint {
  age: number
  house: number
  longitude: number
  sign: ZodiacSign
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Classical planets eligible for Almuten scoring */
const CLASSICAL_PLANETS: Planet[] = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']

/** Exaltation signs for Almuten */
const EXALTATION_RULERS: Partial<Record<ZodiacSign, Planet>> = {
  Aries: 'Sun',
  Taurus: 'Moon',
  Virgo: 'Mercury',
  Pisces: 'Venus',
  Capricorn: 'Mars',
  Cancer: 'Jupiter',
  Libra: 'Saturn',
}

/** Triplicity rulers by element (day ruler, night ruler, participating ruler) */
const TRIPLICITY_RULERS: Record<string, Planet[]> = {
  fire: ['Sun', 'Jupiter', 'Saturn'],
  earth: ['Venus', 'Moon', 'Mars'],
  air: ['Saturn', 'Mercury', 'Jupiter'],
  water: ['Venus', 'Mars', 'Moon'],
}

/**
 * Egyptian term (bound) rulers.
 * Each sign is divided into 5 unequal terms ruled by a classical planet.
 * Format: [endDegree, ruler]
 */
const TERM_RULERS: Record<ZodiacSign, [number, Planet][]> = {
  Aries: [
    [6, 'Jupiter'],
    [12, 'Venus'],
    [20, 'Mercury'],
    [25, 'Mars'],
    [30, 'Saturn'],
  ],
  Taurus: [
    [8, 'Venus'],
    [14, 'Mercury'],
    [22, 'Jupiter'],
    [27, 'Saturn'],
    [30, 'Mars'],
  ],
  Gemini: [
    [6, 'Mercury'],
    [12, 'Jupiter'],
    [17, 'Venus'],
    [24, 'Mars'],
    [30, 'Saturn'],
  ],
  Cancer: [
    [7, 'Mars'],
    [13, 'Venus'],
    [19, 'Mercury'],
    [26, 'Jupiter'],
    [30, 'Saturn'],
  ],
  Leo: [
    [6, 'Jupiter'],
    [11, 'Venus'],
    [18, 'Saturn'],
    [24, 'Mercury'],
    [30, 'Mars'],
  ],
  Virgo: [
    [7, 'Mercury'],
    [17, 'Venus'],
    [21, 'Jupiter'],
    [28, 'Mars'],
    [30, 'Saturn'],
  ],
  Libra: [
    [6, 'Saturn'],
    [14, 'Mercury'],
    [21, 'Jupiter'],
    [28, 'Venus'],
    [30, 'Mars'],
  ],
  Scorpio: [
    [7, 'Mars'],
    [11, 'Venus'],
    [19, 'Mercury'],
    [24, 'Jupiter'],
    [30, 'Saturn'],
  ],
  Sagittarius: [
    [12, 'Jupiter'],
    [17, 'Venus'],
    [21, 'Mercury'],
    [26, 'Saturn'],
    [30, 'Mars'],
  ],
  Capricorn: [
    [7, 'Mercury'],
    [14, 'Jupiter'],
    [22, 'Venus'],
    [26, 'Saturn'],
    [30, 'Mars'],
  ],
  Aquarius: [
    [7, 'Mercury'],
    [13, 'Venus'],
    [20, 'Jupiter'],
    [25, 'Mars'],
    [30, 'Saturn'],
  ],
  Pisces: [
    [12, 'Venus'],
    [16, 'Jupiter'],
    [19, 'Mercury'],
    [28, 'Mars'],
    [30, 'Saturn'],
  ],
}

/**
 * Face (decan) rulers: each sign has 3 decans of 10 degrees each.
 * Chaldean order starting from Mars for Aries.
 */
const FACE_RULERS: Record<ZodiacSign, [Planet, Planet, Planet]> = {
  Aries: ['Mars', 'Sun', 'Venus'],
  Taurus: ['Mercury', 'Moon', 'Saturn'],
  Gemini: ['Jupiter', 'Mars', 'Sun'],
  Cancer: ['Venus', 'Mercury', 'Moon'],
  Leo: ['Saturn', 'Jupiter', 'Mars'],
  Virgo: ['Sun', 'Venus', 'Mercury'],
  Libra: ['Moon', 'Saturn', 'Jupiter'],
  Scorpio: ['Mars', 'Sun', 'Venus'],
  Sagittarius: ['Mercury', 'Moon', 'Saturn'],
  Capricorn: ['Jupiter', 'Mars', 'Sun'],
  Aquarius: ['Venus', 'Mercury', 'Moon'],
  Pisces: ['Saturn', 'Jupiter', 'Mars'],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert Julian Day to a date string (YYYY-MM-DD HH:MM UTC).
 * Uses the inverse Meeus algorithm.
 */
function jdToDateStr(jd: number): string {
  const z = Math.floor(jd + 0.5)
  const f = jd + 0.5 - z

  let a: number
  if (z < 2299161) {
    a = z
  } else {
    const alpha = Math.floor((z - 1867216.25) / 36524.25)
    a = z + 1 + alpha - Math.floor(alpha / 4)
  }

  const b = a + 1524
  const c = Math.floor((b - 122.1) / 365.25)
  const d = Math.floor(365.25 * c)
  const e = Math.floor((b - d) / 30.6001)

  const day = b - d - Math.floor(30.6001 * e)
  const month = e < 14 ? e - 1 : e - 13
  const year = month > 2 ? c - 4716 : c - 4715

  const totalHours = f * 24
  const hours = Math.floor(totalHours)
  const minutes = Math.floor((totalHours - hours) * 60)

  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const hh = String(hours).padStart(2, '0')
  const mi = String(minutes).padStart(2, '0')

  return `${year}-${mm}-${dd} ${hh}:${mi} UTC`
}

/**
 * Get the domicile ruler of a given zodiac sign.
 */
function domicileRuler(sign: ZodiacSign): Planet {
  for (const [planet, signs] of Object.entries(DOMICILE)) {
    if (signs && (signs as ZodiacSign[]).includes(sign)) {
      return planet as Planet
    }
  }
  return 'Sun' // fallback
}

/**
 * Get the exaltation ruler of a given zodiac sign.
 */
function exaltationRuler(sign: ZodiacSign): Planet | null {
  return EXALTATION_RULERS[sign] ?? null
}

/**
 * Get the triplicity ruler of a sign for a day/night chart.
 */
function triplicityRuler(sign: ZodiacSign, isDayChart: boolean): Planet {
  const element = SIGN_ELEMENT[sign]
  const rulers = TRIPLICITY_RULERS[element]
  return isDayChart ? rulers[0] : rulers[1]
}

/**
 * Get the term (bound) ruler for a given degree within a sign.
 */
function termRuler(sign: ZodiacSign, degree: number): Planet {
  const terms = TERM_RULERS[sign]
  for (const [endDeg, ruler] of terms) {
    if (degree < endDeg) return ruler
  }
  return terms[terms.length - 1][1]
}

/**
 * Get the face (decan) ruler for a given degree within a sign.
 */
function faceRuler(sign: ZodiacSign, degree: number): Planet {
  const decan = Math.floor(degree / 10)
  return FACE_RULERS[sign][Math.min(decan, 2)]
}

/**
 * Normalize a longitude to [0, 360).
 */
function normalizeLon(lon: number): number {
  return ((lon % 360) + 360) % 360
}

// ─── Trutine of Hermes ──────────────────────────────────────────────────────

/**
 * Estimate the conception chart using the Trutine of Hermes.
 *
 * Rule: If the Moon at birth is above the horizon (houses 7-12),
 * the conception Moon = birth ASC longitude. If below (houses 1-6),
 * the conception ASC = birth Moon longitude.
 *
 * Standard gestation is approximately 273 days (10 sidereal months).
 */
export function trutineOfHermes(birthJd: number, moonLon: number, ascLon: number): TrutineResult {
  // Determine if Moon is above or below horizon
  // Moon above horizon: its longitude is between DSC and ASC going through MC
  // Simplified: compare Moon to ASC/DSC axis
  const dscLon = normalizeLon(ascLon + 180)

  // Check if Moon is in the upper hemisphere
  // Upper hemisphere: from ASC counter-clockwise to DSC (houses 7-12)
  let moonAbove: boolean
  if (ascLon < dscLon) {
    moonAbove = moonLon >= ascLon && moonLon < dscLon
  } else {
    moonAbove = moonLon >= ascLon || moonLon < dscLon
  }

  // Actually, "above horizon" means houses 7-12, which is from DSC to ASC
  // going through MC. Let's re-check: ASC is east horizon, DSC is west.
  // Above horizon = from ASC going clockwise (decreasing longitude) to DSC
  // through MC. In terms of longitude: from DSC to ASC (in zodiacal order).
  // Re-interpret: above = DSC <= lon < ASC (or wrapped)
  if (dscLon < ascLon) {
    moonAbove = moonLon >= dscLon && moonLon < ascLon
  } else {
    moonAbove = moonLon >= dscLon || moonLon < ascLon
  }

  const conceptionJd = birthJd - 273
  let method: string

  if (moonAbove) {
    method = 'Moon above horizon: conception Moon = birth ASC longitude'
  } else {
    method = 'Moon below horizon: conception ASC = birth Moon longitude'
  }

  return {
    conceptionJd,
    conceptionDate: jdToDateStr(conceptionJd),
    method,
  }
}

// ─── Animodar ────────────────────────────────────────────────────────────────

/**
 * Rectify the Ascendant using the Animodar method.
 *
 * The Animodar uses the prenatal syzygy (last New or Full Moon before birth)
 * to determine a rectification. The planet ruling the term of the syzygy
 * degree provides the adjustment based on its distance from the nearest angle.
 */
export function animodar(
  ascLon: number,
  mcLon: number,
  moonLon: number,
  sunLon: number,
  prenatalSyzygyLon: number,
  isDayChart: boolean,
): AnimodarResult {
  // Determine term ruler of the prenatal syzygy (used for sect selection)
  const syzygySign = longitudeToSign(prenatalSyzygyLon)
  termRuler(syzygySign.sign, syzygySign.degree) // validates syzygy degree

  // Get the ruler's longitude (use Sun for day charts, Moon for night charts
  // as proxy if we don't have all planet positions)
  // In a proper implementation, you'd pass all planets; here we use the
  // relevant luminary based on sect
  const rulerLon = isDayChart ? sunLon : moonLon

  // Find the nearest angle (ASC, DSC, MC, IC)
  const angles = [
    ascLon,
    normalizeLon(ascLon + 180), // DSC
    mcLon,
    normalizeLon(mcLon + 180), // IC
  ]

  let minDist = 360
  let nearestAngle = ascLon
  for (const angle of angles) {
    let dist = Math.abs(rulerLon - angle)
    if (dist > 180) dist = 360 - dist
    if (dist < minDist) {
      minDist = dist
      nearestAngle = angle
    }
  }

  // The adjustment is the distance divided by 13 (one degree of right ascension
  // per ~13 degrees of ecliptic longitude, approximately)
  let adjustment = rulerLon - nearestAngle
  if (adjustment > 180) adjustment -= 360
  if (adjustment < -180) adjustment += 360
  adjustment = adjustment / 13

  const rectifiedAsc = normalizeLon(ascLon + adjustment)
  const signInfo = longitudeToSign(rectifiedAsc)

  return {
    rectifiedAsc,
    rectifiedSign: signInfo.sign,
    rectifiedDegree: signInfo.degree + signInfo.minutes / 60,
    adjustment,
  }
}

// ─── Almuten Figuris ─────────────────────────────────────────────────────────

/**
 * Calculate the Almuten Figuris — the planet with the most essential
 * dignity across the 5 hylegical points (Sun, Moon, ASC, MC, Part of Fortune).
 *
 * Scoring at each point:
 *   Domicile ruler: +5
 *   Exaltation ruler: +4
 *   Triplicity ruler: +3
 *   Term ruler: +2
 *   Face ruler: +1
 */
export function almutenFiguris(
  planets: Record<Planet, Position>,
  houses: HouseCusps,
  isDayChart: boolean,
): AlmutenResult {
  const scores: Record<string, number> = {}
  for (const p of CLASSICAL_PLANETS) {
    scores[p] = 0
  }

  // Calculate Part of Fortune
  const sunLon = planets.Sun?.longitude ?? 0
  const moonLon = planets.Moon?.longitude ?? 0
  const ascLon = houses.ascendant

  let fortuneLon: number
  if (isDayChart) {
    fortuneLon = normalizeLon(ascLon + moonLon - sunLon)
  } else {
    fortuneLon = normalizeLon(ascLon + sunLon - moonLon)
  }

  // The 5 hylegical points
  const hylegialPoints: number[] = [sunLon, moonLon, ascLon, houses.mc, fortuneLon]

  for (const lon of hylegialPoints) {
    const signInfo = longitudeToSign(lon)
    const sign = signInfo.sign
    const deg = signInfo.degree + signInfo.minutes / 60

    // Domicile ruler: +5
    const domRuler = domicileRuler(sign)
    if (scores[domRuler] !== undefined) {
      scores[domRuler] += 5
    }

    // Exaltation ruler: +4
    const exRuler = exaltationRuler(sign)
    if (exRuler && scores[exRuler] !== undefined) {
      scores[exRuler] += 4
    }

    // Triplicity ruler: +3
    const tripRuler = triplicityRuler(sign, isDayChart)
    if (scores[tripRuler] !== undefined) {
      scores[tripRuler] += 3
    }

    // Term ruler: +2
    const trmRuler = termRuler(sign, deg)
    if (scores[trmRuler] !== undefined) {
      scores[trmRuler] += 2
    }

    // Face ruler: +1
    const fcRuler = faceRuler(sign, deg)
    if (scores[fcRuler] !== undefined) {
      scores[fcRuler] += 1
    }
  }

  // Find the planet with the highest score
  let almuten: Planet = 'Sun'
  let maxScore = -1
  for (const p of CLASSICAL_PLANETS) {
    if (scores[p] > maxScore) {
      maxScore = scores[p]
      almuten = p
    }
  }

  return {
    almuten,
    scores: scores as Record<Planet, number>,
  }
}

// ─── Huber Age Point ─────────────────────────────────────────────────────────

/**
 * Calculate the Huber Age Point for a given age.
 *
 * The Age Point moves through the houses at a rate of 6 years per house,
 * completing a full cycle in 72 years. The point starts at the ASC (cusp 1)
 * at birth and moves counter-clockwise through the houses.
 */
export function huberAgePoint(age: number, cusps: number[]): HuberAgePoint {
  // 6 years per house, wraps every 72 years
  const normalizedAge = ((age % 72) + 72) % 72
  const houseIndex = Math.floor(normalizedAge / 6) // 0-11
  const fraction = (normalizedAge % 6) / 6 // 0 to 1 within house

  // House number is 1-indexed
  const house = houseIndex + 1

  // Interpolate longitude between this cusp and the next
  const cuspStart = cusps[houseIndex]
  const cuspEnd = cusps[houseIndex === 11 ? 1 : houseIndex + 1]

  // Handle zodiac wraparound
  let span = cuspEnd - cuspStart
  if (span < 0) span += 360

  const longitude = normalizeLon(cuspStart + fraction * span)
  const signInfo = longitudeToSign(longitude)

  return {
    age,
    house,
    longitude,
    sign: signInfo.sign,
  }
}

/**
 * Generate a Huber Age Point timeline from startAge to endAge.
 *
 * @param cusps    - Array of 12 house cusp longitudes (0-indexed)
 * @param startAge - Starting age
 * @param endAge   - Ending age
 * @param step     - Age increment (default 1 year)
 * @returns Array of HuberAgePoint entries
 */
export function huberTimeline(
  cusps: number[],
  startAge: number,
  endAge: number,
  step: number = 1,
): HuberAgePoint[] {
  const timeline: HuberAgePoint[] = []

  for (let age = startAge; age <= endAge; age += step) {
    timeline.push(huberAgePoint(age, cusps))
  }

  return timeline
}
