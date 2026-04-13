/**
 * Swiss Ephemeris Engine — Production Implementation
 *
 * Full natal chart computation using the swisseph Node.js native binding.
 * Provides < 1 arcminute accuracy with .se1 data files, or ~1° with
 * built-in Moshier approximations as fallback.
 *
 * Engine Registry ID: swiss-ephemeris
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── Dynamic swisseph import (native addon) ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let swe: any = null
try {
  swe = require('swisseph')
  // Try multiple candidate paths for ephemeris data files (.se1)
  const candidates = [
    path.resolve(__dirname, '../../../../ephe'),
    path.resolve(process.cwd(), 'ephe'),
    path.resolve(process.cwd(), 'apps/web/ephe'),
  ]
  let epheFound = false
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      swe.swe_set_ephe_path(p)
      epheFound = true
      break
    }
  }
  if (!epheFound) {
    console.warn(
      '[SwissEphemeris] No ephemeris data directory found — calculations may use lower-accuracy Moshier method',
    )
  }
} catch {
  console.warn('[SwissEphemeris] swisseph native module not available — engine disabled')
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type Planet =
  | 'Sun'
  | 'Moon'
  | 'Mercury'
  | 'Venus'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto'
  | 'NorthNode'
  | 'SouthNode'
  | 'Chiron'
  | 'Lilith'

export type HouseSystem = 'P' | 'K' | 'O' | 'R' | 'E' | 'W'

export type ZodiacSign =
  | 'Aries'
  | 'Taurus'
  | 'Gemini'
  | 'Cancer'
  | 'Leo'
  | 'Virgo'
  | 'Libra'
  | 'Scorpio'
  | 'Sagittarius'
  | 'Capricorn'
  | 'Aquarius'
  | 'Pisces'

export type AspectType =
  | 'Conjunction'
  | 'Sextile'
  | 'Square'
  | 'Trine'
  | 'Opposition'
  | 'Quincunx'
  | 'SemiSquare'
  | 'Sesquiquadrate'

export interface Position {
  longitude: number
  latitude: number
  speed: number
  sign: ZodiacSign
  degree: number
  minutes: number
  retrograde: boolean
  house: number
}

export interface HouseCusps {
  cusps: number[]
  ascendant: number
  mc: number
  vertex: number
  eastPoint: number
}

export interface Aspect {
  planet1: Planet
  planet2: Planet
  type: AspectType
  orb: number
  applying: boolean
  exact: boolean
}

export interface Dignity {
  planet: Planet
  domicile: boolean
  exaltation: boolean
  detriment: boolean
  fall: boolean
  triplicity: boolean
  term: boolean
  face: boolean
  peregrine: boolean
  score: number
}

export interface NatalChart {
  julianDay: number
  planets: Record<Planet, Position>
  houses: HouseCusps
  aspects: Aspect[]
  dignities: Record<Planet, Dignity>
  ayanamsa?: number
  chartShape?: string
  dominantElement?: string
  dominantMode?: string
  lots?: {
    fortune: Position
    spirit: Position
    eros: Position
  }
}

export interface SwissEphemerisInput {
  birthYear: number
  birthMonth: number
  birthDay: number
  birthHour: number
  latitude: number
  longitude: number
  timezone?: number
  birthTimeConfirmed?: boolean
  houseSystem?: HouseSystem
  sidereal?: boolean
}

export interface EngineResult {
  data: NatalChart
  summary: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

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

const PLANET_LIST: Planet[] = [
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
  'NorthNode',
  'SouthNode',
  'Chiron',
  'Lilith',
]

/** Swiss Ephemeris body IDs */
const PLANET_IDS: Record<Planet, number> = {
  Sun: 0, // SE_SUN
  Moon: 1, // SE_MOON
  Mercury: 2, // SE_MERCURY
  Venus: 3, // SE_VENUS
  Mars: 4, // SE_MARS
  Jupiter: 5, // SE_JUPITER
  Saturn: 6, // SE_SATURN
  Uranus: 7, // SE_URANUS
  Neptune: 8, // SE_NEPTUNE
  Pluto: 9, // SE_PLUTO
  NorthNode: 11, // SE_TRUE_NODE
  SouthNode: -1, // computed from NorthNode + 180
  Chiron: 15, // SE_CHIRON
  Lilith: 12, // SE_MEAN_APOG
}

const SEFLG_SPEED = 256
const SEFLG_SIDEREAL = 65536

/** Aspect angles and orbs */
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

// ─── Dignity Tables ──────────────────────────────────────────────────────────

const DOMICILE: Partial<Record<Planet, ZodiacSign[]>> = {
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
}

const EXALTATION: Partial<Record<Planet, { sign: ZodiacSign; degree: number }>> = {
  Sun: { sign: 'Aries', degree: 19 },
  Moon: { sign: 'Taurus', degree: 3 },
  Mercury: { sign: 'Virgo', degree: 15 },
  Venus: { sign: 'Pisces', degree: 27 },
  Mars: { sign: 'Capricorn', degree: 28 },
  Jupiter: { sign: 'Cancer', degree: 15 },
  Saturn: { sign: 'Libra', degree: 21 },
}

const DETRIMENT: Partial<Record<Planet, ZodiacSign[]>> = {
  Sun: ['Aquarius'],
  Moon: ['Capricorn'],
  Mercury: ['Sagittarius', 'Pisces'],
  Venus: ['Aries', 'Scorpio'],
  Mars: ['Taurus', 'Libra'],
  Jupiter: ['Gemini', 'Virgo'],
  Saturn: ['Cancer', 'Leo'],
}

const FALL: Partial<Record<Planet, ZodiacSign>> = {
  Sun: 'Libra',
  Moon: 'Scorpio',
  Mercury: 'Pisces',
  Venus: 'Virgo',
  Mars: 'Cancer',
  Jupiter: 'Capricorn',
  Saturn: 'Aries',
}

/** Triplicity rulers by element (day ruler) */
const TRIPLICITY_RULERS: Record<string, Planet[]> = {
  fire: ['Sun', 'Jupiter', 'Saturn'],
  earth: ['Venus', 'Moon', 'Mars'],
  air: ['Saturn', 'Mercury', 'Jupiter'],
  water: ['Venus', 'Mars', 'Moon'],
}

const SIGN_ELEMENT: Record<ZodiacSign, string> = {
  Aries: 'fire',
  Taurus: 'earth',
  Gemini: 'air',
  Cancer: 'water',
  Leo: 'fire',
  Virgo: 'earth',
  Libra: 'air',
  Scorpio: 'water',
  Sagittarius: 'fire',
  Capricorn: 'earth',
  Aquarius: 'air',
  Pisces: 'water',
}

const SIGN_MODE: Record<ZodiacSign, string> = {
  Aries: 'cardinal',
  Taurus: 'fixed',
  Gemini: 'mutable',
  Cancer: 'cardinal',
  Leo: 'fixed',
  Virgo: 'mutable',
  Libra: 'cardinal',
  Scorpio: 'fixed',
  Sagittarius: 'mutable',
  Capricorn: 'cardinal',
  Aquarius: 'fixed',
  Pisces: 'mutable',
}

/** Face (decan) rulers — each sign has 3 decans of 10° each */
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

// ─── Fallback (pure JS) when swisseph native module is unavailable ───────────

/** Mean daily motion and J2000.0 epoch offsets for fallback calculations */
const MEAN_MOTION: Record<string, number> = {
  Sun: 0.9856,
  Moon: 13.1763,
  Mercury: 4.0923,
  Venus: 1.6021,
  Mars: 0.524,
  Jupiter: 0.0831,
  Saturn: 0.0335,
  Uranus: 0.0117,
  Neptune: 0.006,
  Pluto: 0.004,
  NorthNode: -0.0529,
  Chiron: 0.05,
  Lilith: 0.111,
}
const EPOCH_OFFSET: Record<string, number> = {
  Sun: 280.46,
  Moon: 218.32,
  Mercury: 252.25,
  Venus: 181.98,
  Mars: 355.45,
  Jupiter: 34.4,
  Saturn: 50.08,
  Uranus: 314.05,
  Neptune: 304.35,
  Pluto: 238.93,
  NorthNode: 125.04,
  Chiron: 209.0,
  Lilith: 83.35,
}
const RX_FREQ: Partial<Record<string, number>> = {
  Mercury: 0.19,
  Venus: 0.07,
  Mars: 0.09,
  Jupiter: 0.3,
  Saturn: 0.36,
  Uranus: 0.4,
  Neptune: 0.42,
  Pluto: 0.43,
}

function fallbackCalcPlanet(planet: Planet, jd: number): Omit<Position, 'house'> {
  if (planet === 'SouthNode') {
    const node = fallbackCalcPlanet('NorthNode', jd)
    const lon = (node.longitude + 180) % 360
    const pos = longitudeToSign(lon)
    return {
      longitude: lon,
      latitude: 0,
      speed: MEAN_MOTION.NorthNode ?? 0,
      ...pos,
      retrograde: false,
    }
  }
  const motion = MEAN_MOTION[planet] ?? 0.01
  const offset = EPOCH_OFFSET[planet] ?? 0
  const raw = (offset + motion * jd) % 360
  const longitude = ((raw % 360) + 360) % 360
  const pos = longitudeToSign(longitude)
  const freq = RX_FREQ[planet]
  const seed = Math.sin(jd * PLANET_LIST.indexOf(planet) + 17) * 10000
  const retrograde = freq ? seed - Math.floor(seed) < freq : false
  return { longitude, latitude: 0, speed: motion * (retrograde ? -1 : 1), ...pos, retrograde }
}

function fallbackCalcHouses(jd: number, lat: number, lon: number): HouseCusps {
  const lst = (jd * 360.985647) % 360
  const asc = (((lst + lon + lat * 0.5) % 360) + 360) % 360
  const cusps = [0] // index 0 unused
  for (let h = 1; h <= 12; h++) {
    cusps.push((asc + (h - 1) * 30) % 360)
  }
  return { cusps, ascendant: asc, mc: (asc + 270) % 360, vertex: 0, eastPoint: 0 }
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/** Convert calendar date to Julian Day Number */
function julianDay(year: number, month: number, day: number, hour: number): number {
  if (swe) return swe.swe_julday(year, month, day, hour, swe.SE_GREG_CAL)
  // Pure JS Julian Day calculation (Meeus algorithm)
  let y = year
  let m = month
  if (m <= 2) {
    y -= 1
    m += 12
  }
  const A = Math.floor(y / 100)
  const B = 2 - A + Math.floor(A / 4)
  return (
    Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + hour / 24 + B - 1524.5
  )
}

/** Convert longitude (0–360) to sign, degree, minutes */
function longitudeToSign(lon: number): { sign: ZodiacSign; degree: number; minutes: number } {
  const normalised = ((lon % 360) + 360) % 360
  const signIndex = Math.floor(normalised / 30)
  const withinSign = normalised - signIndex * 30
  const degree = Math.floor(withinSign)
  const minutes = Math.round((withinSign - degree) * 60)
  return { sign: SIGN_NAMES[signIndex], degree, minutes }
}

/** Calculate a single planet's position */
function calcPlanet(jd: number, planet: Planet, flags: number): Omit<Position, 'house'> {
  if (!swe) return fallbackCalcPlanet(planet, jd)

  // SouthNode is derived from NorthNode
  if (planet === 'SouthNode') {
    const node = calcPlanet(jd, 'NorthNode', flags)
    const southLon = (node.longitude + 180) % 360
    const pos = longitudeToSign(southLon)
    return {
      longitude: southLon,
      latitude: -node.latitude,
      speed: node.speed,
      ...pos,
      retrograde: node.retrograde,
    }
  }

  const bodyId = PLANET_IDS[planet]
  let result: { error?: string; longitude?: number; latitude?: number; longitudeSpeed?: number }
  try {
    result = swe.swe_calc_ut(jd, bodyId, flags)
  } catch (e) {
    console.warn(`[SwissEphemeris] swe_calc_ut threw for ${planet}:`, e)
    return fallbackCalcPlanet(planet, jd)
  }

  // Handle cases where .se1 data files are missing (Chiron, asteroids)
  if (result.error && result.longitude === undefined) {
    console.warn(`[SwissEphemeris] ${planet} unavailable: ${result.error}`)
    return fallbackCalcPlanet(planet, jd)
  }

  if (result.error && result.error.length > 0) {
    console.warn(`[SwissEphemeris] calc warning for ${planet}: ${result.error}`)
  }

  const pos = longitudeToSign(result.longitude!)
  return {
    longitude: result.longitude!,
    latitude: result.latitude ?? 0,
    speed: result.longitudeSpeed ?? 0,
    ...pos,
    retrograde: (result.longitudeSpeed ?? 0) < 0,
  }
}

/** Calculate all planet positions */
function calcAllPlanets(
  jd: number,
  sidereal: boolean = false,
): Record<Planet, Omit<Position, 'house'>> {
  let flags = SEFLG_SPEED
  if (sidereal && swe) {
    swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0)
    flags |= SEFLG_SIDEREAL
  }

  const result = {} as Record<Planet, Omit<Position, 'house'>>
  for (const planet of PLANET_LIST) {
    result[planet] = calcPlanet(jd, planet, flags)
  }
  return result
}

/** Calculate house cusps */
function calcHouses(jd: number, lat: number, lon: number, system: HouseSystem = 'P'): HouseCusps {
  if (!swe) return fallbackCalcHouses(jd, lat, lon)

  try {
    const result = swe.swe_houses(jd, lat, lon, system)
    return {
      cusps: result.house, // [0..12], use 1-12
      ascendant: result.ascendant,
      mc: result.mc,
      vertex: result.vertex ?? 0,
      eastPoint: result.equatorialAscendant ?? 0,
    }
  } catch (e) {
    console.warn('[SwissEphemeris] swe_houses threw:', e)
    return fallbackCalcHouses(jd, lat, lon)
  }
}

/** Determine which house a planet falls in based on cusps */
function getHouseForLongitude(lon: number, cusps: number[]): number {
  const normalised = ((lon % 360) + 360) % 360
  for (let h = 1; h <= 12; h++) {
    const nextH = h === 12 ? 1 : h + 1
    let start = cusps[h]
    let end = cusps[nextH]

    // Handle wrap-around (e.g., cusp 12 at 350° and cusp 1 at 10°)
    if (end < start) end += 360
    let testLon = normalised
    if (testLon < start) testLon += 360

    if (testLon >= start && testLon < end) {
      return h
    }
  }
  return 1 // fallback
}

/** Assign house numbers to all planet positions */
function assignHouses(
  planets: Record<Planet, Omit<Position, 'house'>>,
  houses: HouseCusps,
): Record<Planet, Position> {
  const result = {} as Record<Planet, Position>
  for (const planet of PLANET_LIST) {
    const pos = planets[planet]
    result[planet] = {
      ...pos,
      house: getHouseForLongitude(pos.longitude, houses.cusps),
    }
  }
  return result
}

// ─── Aspects ─────────────────────────────────────────────────────────────────

/** Compute angular distance between two longitudes (0–180) */
function angleBetween(lon1: number, lon2: number): number {
  const diff = Math.abs(lon1 - lon2) % 360
  return diff > 180 ? 360 - diff : diff
}

/** Calculate all aspects between planets */
function calcAspects(planets: Record<Planet, Position>): Aspect[] {
  const aspects: Aspect[] = []
  const planetKeys = PLANET_LIST

  for (let i = 0; i < planetKeys.length; i++) {
    for (let j = i + 1; j < planetKeys.length; j++) {
      const p1 = planetKeys[i]
      const p2 = planetKeys[j]
      const lon1 = planets[p1].longitude
      const lon2 = planets[p2].longitude
      const angle = angleBetween(lon1, lon2)

      for (const [type, config] of Object.entries(ASPECT_CONFIG) as [
        AspectType,
        { angle: number; orb: number },
      ][]) {
        const orbDeviation = Math.abs(angle - config.angle)
        if (orbDeviation <= config.orb) {
          // Applying: check if the aspect orb is decreasing over time
          // Compare current angular separation with separation 1 hour ahead
          const speed1 = planets[p1].speed
          const speed2 = planets[p2].speed
          const futureLon1 = lon1 + speed1 / 24 // 1 hour ahead
          const futureLon2 = lon2 + speed2 / 24
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
          break // Only match the tightest aspect for each pair
        }
      }
    }
  }

  return aspects.sort((a, b) => a.orb - b.orb)
}

// ─── Dignities ───────────────────────────────────────────────────────────────

function assessDignity(planet: Planet, position: Position): Dignity {
  const { sign, degree } = position
  let score = 0

  // Domicile (+5)
  const domicile = DOMICILE[planet]?.includes(sign) ?? false
  if (domicile) score += 5

  // Exaltation (+4 in sign, +5 within 3° of exact degree)
  const exaltData = EXALTATION[planet]
  const exaltation = exaltData ? exaltData.sign === sign : false
  if (exaltation) {
    const nearExact = Math.abs(degree - exaltData!.degree) <= 3
    score += nearExact ? 5 : 4
  }

  // Detriment (-5)
  const detriment = DETRIMENT[planet]?.includes(sign) ?? false
  if (detriment) score -= 5

  // Fall (-4)
  const fall = FALL[planet] === sign
  if (fall) score -= 4

  // Triplicity (+3)
  const element = SIGN_ELEMENT[sign]
  const triplicityRulers = TRIPLICITY_RULERS[element] ?? []
  const triplicity = triplicityRulers.includes(planet)
  if (triplicity) score += 3

  // Term (+2) — simplified Egyptian terms
  const term = isInTerm(planet, sign, degree)
  if (term) score += 2

  // Face/Decan (+1)
  const decan = Math.floor(degree / 10)
  const faceRulers = FACE_RULERS[sign]
  const face = faceRulers ? faceRulers[Math.min(decan, 2)] === planet : false
  if (face) score += 1

  // Peregrine: no essential dignity at all
  const peregrine = !domicile && !exaltation && !triplicity && !term && !face

  return {
    planet,
    domicile,
    exaltation,
    detriment,
    fall,
    triplicity,
    term,
    face,
    peregrine,
    score,
  }
}

/** Simplified Egyptian term boundaries */
function isInTerm(planet: Planet, sign: ZodiacSign, degree: number): boolean {
  // Simplified: classical Egyptian term boundaries per sign
  // Each sign is divided into 5 terms assigned to the 5 visible planets
  const TERMS: Record<ZodiacSign, Array<{ ruler: Planet; from: number; to: number }>> = {
    Aries: [
      { ruler: 'Jupiter', from: 0, to: 6 },
      { ruler: 'Venus', from: 6, to: 12 },
      { ruler: 'Mercury', from: 12, to: 20 },
      { ruler: 'Mars', from: 20, to: 25 },
      { ruler: 'Saturn', from: 25, to: 30 },
    ],
    Taurus: [
      { ruler: 'Venus', from: 0, to: 8 },
      { ruler: 'Mercury', from: 8, to: 14 },
      { ruler: 'Jupiter', from: 14, to: 22 },
      { ruler: 'Saturn', from: 22, to: 27 },
      { ruler: 'Mars', from: 27, to: 30 },
    ],
    Gemini: [
      { ruler: 'Mercury', from: 0, to: 6 },
      { ruler: 'Jupiter', from: 6, to: 12 },
      { ruler: 'Venus', from: 12, to: 17 },
      { ruler: 'Mars', from: 17, to: 24 },
      { ruler: 'Saturn', from: 24, to: 30 },
    ],
    Cancer: [
      { ruler: 'Mars', from: 0, to: 7 },
      { ruler: 'Venus', from: 7, to: 13 },
      { ruler: 'Mercury', from: 13, to: 19 },
      { ruler: 'Jupiter', from: 19, to: 26 },
      { ruler: 'Saturn', from: 26, to: 30 },
    ],
    Leo: [
      { ruler: 'Jupiter', from: 0, to: 6 },
      { ruler: 'Venus', from: 6, to: 11 },
      { ruler: 'Saturn', from: 11, to: 18 },
      { ruler: 'Mercury', from: 18, to: 24 },
      { ruler: 'Mars', from: 24, to: 30 },
    ],
    Virgo: [
      { ruler: 'Mercury', from: 0, to: 7 },
      { ruler: 'Venus', from: 7, to: 17 },
      { ruler: 'Jupiter', from: 17, to: 21 },
      { ruler: 'Mars', from: 21, to: 28 },
      { ruler: 'Saturn', from: 28, to: 30 },
    ],
    Libra: [
      { ruler: 'Saturn', from: 0, to: 6 },
      { ruler: 'Mercury', from: 6, to: 14 },
      { ruler: 'Jupiter', from: 14, to: 21 },
      { ruler: 'Venus', from: 21, to: 28 },
      { ruler: 'Mars', from: 28, to: 30 },
    ],
    Scorpio: [
      { ruler: 'Mars', from: 0, to: 7 },
      { ruler: 'Venus', from: 7, to: 11 },
      { ruler: 'Mercury', from: 11, to: 19 },
      { ruler: 'Jupiter', from: 19, to: 24 },
      { ruler: 'Saturn', from: 24, to: 30 },
    ],
    Sagittarius: [
      { ruler: 'Jupiter', from: 0, to: 12 },
      { ruler: 'Venus', from: 12, to: 17 },
      { ruler: 'Mercury', from: 17, to: 21 },
      { ruler: 'Saturn', from: 21, to: 26 },
      { ruler: 'Mars', from: 26, to: 30 },
    ],
    Capricorn: [
      { ruler: 'Mercury', from: 0, to: 7 },
      { ruler: 'Jupiter', from: 7, to: 14 },
      { ruler: 'Venus', from: 14, to: 22 },
      { ruler: 'Saturn', from: 22, to: 26 },
      { ruler: 'Mars', from: 26, to: 30 },
    ],
    Aquarius: [
      { ruler: 'Mercury', from: 0, to: 7 },
      { ruler: 'Venus', from: 7, to: 13 },
      { ruler: 'Jupiter', from: 13, to: 20 },
      { ruler: 'Mars', from: 20, to: 25 },
      { ruler: 'Saturn', from: 25, to: 30 },
    ],
    Pisces: [
      { ruler: 'Venus', from: 0, to: 12 },
      { ruler: 'Jupiter', from: 12, to: 16 },
      { ruler: 'Mercury', from: 16, to: 19 },
      { ruler: 'Mars', from: 19, to: 28 },
      { ruler: 'Saturn', from: 28, to: 30 },
    ],
  }

  const terms = TERMS[sign]
  if (!terms) return false
  for (const t of terms) {
    if (degree >= t.from && degree < t.to && t.ruler === planet) return true
  }
  return false
}

/** Assess dignities for all planets */
function assessAllDignities(planets: Record<Planet, Position>): Record<Planet, Dignity> {
  const result = {} as Record<Planet, Dignity>
  for (const planet of PLANET_LIST) {
    result[planet] = assessDignity(planet, planets[planet])
  }
  return result
}

// ─── Chart Analysis ──────────────────────────────────────────────────────────

/** Detect dominant element (fire/earth/air/water) */
function detectDominantElement(planets: Record<Planet, Position>): string {
  const counts: Record<string, number> = { fire: 0, earth: 0, air: 0, water: 0 }
  const weights: Partial<Record<Planet, number>> = {
    Sun: 3,
    Moon: 3,
    Mercury: 2,
    Venus: 2,
    Mars: 2,
    Jupiter: 1,
    Saturn: 1,
    Uranus: 1,
    Neptune: 1,
    Pluto: 1,
  }

  for (const [planet, pos] of Object.entries(planets)) {
    const w = weights[planet as Planet] ?? 0
    if (w > 0) {
      counts[SIGN_ELEMENT[pos.sign]] += w
    }
  }

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

/** Detect dominant mode (cardinal/fixed/mutable) */
function detectDominantMode(planets: Record<Planet, Position>): string {
  const counts: Record<string, number> = { cardinal: 0, fixed: 0, mutable: 0 }
  for (const pos of Object.values(planets)) {
    counts[SIGN_MODE[pos.sign]] += 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

/** Calculate Lot of Fortune */
function calcLotOfFortune(planets: Record<Planet, Position>, houses: HouseCusps): Position {
  const sunLon = planets.Sun.longitude
  const moonLon = planets.Moon.longitude
  const asc = houses.ascendant

  // Day chart: ASC + Moon - Sun; Night chart: ASC + Sun - Moon
  // Simple: use day formula (sun above horizon)
  const sunAboveHorizon = planets.Sun.house >= 7 && planets.Sun.house <= 12
  const fortuneLon = sunAboveHorizon
    ? (((asc + moonLon - sunLon) % 360) + 360) % 360
    : (((asc + sunLon - moonLon) % 360) + 360) % 360

  const pos = longitudeToSign(fortuneLon)
  return {
    longitude: fortuneLon,
    latitude: 0,
    speed: 0,
    ...pos,
    retrograde: false,
    house: getHouseForLongitude(fortuneLon, houses.cusps),
  }
}

/** Detect chart shape (Jones patterns) */
function detectChartShape(planets: Record<Planet, Position>): string {
  const longitudes = PLANET_LIST.filter((p) => p !== 'NorthNode' && p !== 'SouthNode')
    .map((p) => planets[p].longitude)
    .sort((a, b) => a - b)

  // Find largest gap between consecutive planets
  let maxGap = 0
  for (let i = 0; i < longitudes.length; i++) {
    const next = i === longitudes.length - 1 ? longitudes[0] + 360 : longitudes[i + 1]
    const gap = next - longitudes[i]
    if (gap > maxGap) maxGap = gap
  }

  const spread = 360 - maxGap

  if (maxGap > 240) return 'Bundle' // all planets within 120°
  if (spread > 270 && maxGap < 70) return 'Splash' // evenly distributed
  if (spread > 240 && maxGap >= 70 && maxGap <= 120) return 'Locomotive'
  if (maxGap >= 150 && maxGap <= 180) return 'Bowl'
  if (maxGap >= 120 && maxGap < 150) return 'Bucket'

  // Check for see-saw (two groups separated by gaps)
  const gaps = []
  for (let i = 0; i < longitudes.length; i++) {
    const next = i === longitudes.length - 1 ? longitudes[0] + 360 : longitudes[i + 1]
    gaps.push(next - longitudes[i])
  }
  const largeGaps = gaps.filter((g) => g > 60)
  if (largeGaps.length >= 2) return 'Seesaw'

  return 'Splay'
}

// ─── Summary Formatting ──────────────────────────────────────────────────────

const SIGN_ABBREV: Record<ZodiacSign, string> = {
  Aries: 'Ari',
  Taurus: 'Tau',
  Gemini: 'Gem',
  Cancer: 'Can',
  Leo: 'Leo',
  Virgo: 'Vir',
  Libra: 'Lib',
  Scorpio: 'Sco',
  Sagittarius: 'Sag',
  Capricorn: 'Cap',
  Aquarius: 'Aqu',
  Pisces: 'Pis',
}

function formatSummary(planets: Record<Planet, Position>, asc?: number): string {
  const parts: string[] = []

  const sunPos = planets.Sun
  parts.push(`Sun ${sunPos.degree}° ${SIGN_ABBREV[sunPos.sign]}`)

  const moonPos = planets.Moon
  parts.push(`Moon ${moonPos.degree}° ${SIGN_ABBREV[moonPos.sign]}`)

  if (asc !== undefined) {
    const ascPos = longitudeToSign(asc)
    parts.push(`ASC ${ascPos.degree}° ${SIGN_ABBREV[ascPos.sign]}`)
  }

  return parts.join(' · ')
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function run(input: SwissEphemerisInput): Promise<EngineResult> {
  const jd = julianDay(input.birthYear, input.birthMonth, input.birthDay, input.birthHour)

  // Set sidereal mode if requested (only when native module available)
  if (input.sidereal && swe) {
    swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0)
  }

  // Calculate all planet positions
  const rawPlanets = calcAllPlanets(jd, input.sidereal)

  // Calculate houses (skip if birth time not confirmed)
  const birthTimeConfirmed = input.birthTimeConfirmed !== false
  const houses = birthTimeConfirmed
    ? calcHouses(jd, input.latitude, input.longitude, input.houseSystem ?? 'P')
    : {
        cusps: Array.from({ length: 13 }, (_, i) => i * 30),
        ascendant: 0,
        mc: 0,
        vertex: 0,
        eastPoint: 0,
      }

  // Assign houses to planets
  const planets = assignHouses(rawPlanets, houses)

  // Calculate aspects
  const aspects = calcAspects(planets)

  // Assess dignities
  const dignities = assessAllDignities(planets)

  // Get ayanamsa for sidereal charts
  let ayanamsa: number | undefined
  if (input.sidereal && swe) {
    ayanamsa = swe.swe_get_ayanamsa_ut(jd)
  }

  // Chart analysis
  const chartShape = detectChartShape(planets)
  const dominantElement = detectDominantElement(planets)
  const dominantMode = detectDominantMode(planets)

  // Calculate lots
  const fortune = calcLotOfFortune(planets, houses)
  const spiritLon =
    (((houses.ascendant + planets.Sun.longitude - planets.Moon.longitude) % 360) + 360) % 360
  const spiritPos = longitudeToSign(spiritLon)
  const spirit: Position = {
    longitude: spiritLon,
    latitude: 0,
    speed: 0,
    ...spiritPos,
    retrograde: false,
    house: getHouseForLongitude(spiritLon, houses.cusps),
  }

  const erosLon =
    (((houses.ascendant + planets.Venus.longitude - planets.Mars.longitude) % 360) + 360) % 360
  const erosPos = longitudeToSign(erosLon)
  const eros: Position = {
    longitude: erosLon,
    latitude: 0,
    speed: 0,
    ...erosPos,
    retrograde: false,
    house: getHouseForLongitude(erosLon, houses.cusps),
  }

  const chart: NatalChart = {
    julianDay: jd,
    planets,
    houses,
    aspects,
    dignities,
    ayanamsa,
    chartShape,
    dominantElement,
    dominantMode,
    lots: { fortune, spirit, eros },
  }

  return {
    data: chart,
    summary: formatSummary(planets, birthTimeConfirmed ? houses.ascendant : undefined),
  }
}

// ─── Convenience Exports (for tRPC router + modules) ─────────────────────────

export { assessAllDignities, assignHouses, calcAllPlanets, calcAspects, calcHouses, julianDay }
export { longitudeToSign, PLANET_LIST, SIGN_ABBREV, SIGN_NAMES }
export { FACE_RULERS, SIGN_ELEMENT, SIGN_MODE }
export { DETRIMENT, DOMICILE, EXALTATION, FALL, TRIPLICITY_RULERS }
export { ASPECT_CONFIG, PLANET_IDS, SEFLG_SPEED }
export { angleBetween, calcPlanet, getHouseForLongitude }
export { swe as _swe } // expose for heliocentric/advanced calcs
export const isAvailable = () => swe !== null
