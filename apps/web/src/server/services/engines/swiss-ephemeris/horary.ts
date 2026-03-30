/**
 * Horary Chart Assessment Engine
 *
 * Evaluates a horary chart cast for the moment a question is asked,
 * applying traditional strictures and significator analysis to render
 * a judgment on the querent's question.
 */

import {
  type NatalChart,
  type Planet,
  type Position,
  run,
  type SwissEphemerisInput,
  type ZodiacSign,
} from './engine'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HoraryInput {
  questionTime: { year: number; month: number; day: number; hour: number }
  latitude: number
  longitude: number
  questionHouse: number // which house rules the matter (e.g., 7 for relationships, 10 for career)
}

export interface HoraryResult {
  chartMoment: string
  strictures: Stricture[]
  isRadical: boolean
  querent: SignificatorInfo
  quesited: SignificatorInfo
  applyingAspects: ApplyingAspect[]
  moonCondition: MoonCondition
  judgment: HoraryJudgment
}

interface Stricture {
  type: string
  description: string
  severity: 'warning' | 'prohibition'
}

interface SignificatorInfo {
  planet: Planet
  sign: ZodiacSign
  house: number
  dignity: string
  retrograde: boolean
  speed: string
}

interface ApplyingAspect {
  planet1: Planet
  planet2: Planet
  type: string
  orb: number
  applying: boolean
}

interface MoonCondition {
  sign: ZodiacSign
  voidOfCourse: boolean
  lastAspect: { planet: Planet; type: string } | null
  nextAspect: { planet: Planet; type: string } | null
  phase: string
}

interface HoraryJudgment {
  outcome: 'yes' | 'no' | 'conditional' | 'too_early' | 'not_radical'
  confidence: number
  reasoning: string[]
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

const DETRIMENT_SIGNS: Record<string, ZodiacSign[]> = {
  Sun: ['Aquarius'],
  Moon: ['Capricorn'],
  Mercury: ['Sagittarius', 'Pisces'],
  Venus: ['Aries', 'Scorpio'],
  Mars: ['Taurus', 'Libra'],
  Jupiter: ['Gemini', 'Virgo'],
  Saturn: ['Cancer', 'Leo'],
}

const FALL_SIGNS: Record<string, ZodiacSign> = {
  Sun: 'Libra',
  Moon: 'Scorpio',
  Mercury: 'Pisces',
  Venus: 'Virgo',
  Mars: 'Cancer',
  Jupiter: 'Capricorn',
  Saturn: 'Aries',
}

const TRADITIONAL_PLANETS: Planet[] = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
]

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

function getDignity(planet: Planet, sign: ZodiacSign): string {
  if (DOMICILE_SIGNS[planet]?.includes(sign)) return 'domicile'
  if (EXALTATION_SIGNS[planet] === sign) return 'exaltation'
  if (FALL_SIGNS[planet] === sign) return 'fall'
  if (DETRIMENT_SIGNS[planet]?.includes(sign)) return 'detriment'
  return 'peregrine'
}

function getPlanetSpeed(planet: Planet, position: Position): string {
  const absSpeed = Math.abs(position.speed)
  if (absSpeed < 0.01) return 'stationary'
  const avgSpeeds: Partial<Record<Planet, number>> = {
    Sun: 1.0,
    Moon: 13.2,
    Mercury: 1.2,
    Venus: 1.2,
    Mars: 0.5,
    Jupiter: 0.08,
    Saturn: 0.03,
  }
  const avg = avgSpeeds[planet]
  if (!avg) return 'fast'
  return absSpeed < avg * 0.5 ? 'slow' : 'fast'
}

function angleBetween(lon1: number, lon2: number): number {
  let diff = Math.abs(lon1 - lon2)
  if (diff > 180) diff = 360 - diff
  return diff
}

function isCombust(planet: Position, sun: Position): boolean {
  return angleBetween(planet.longitude, sun.longitude) < 8
}

function getMoonPhase(sunLon: number, moonLon: number): string {
  let angle = moonLon - sunLon
  if (angle < 0) angle += 360
  if (angle < 45) return 'new'
  if (angle < 90) return 'crescent'
  if (angle < 135) return 'first_quarter'
  if (angle < 180) return 'gibbous'
  if (angle < 225) return 'full'
  if (angle < 270) return 'disseminating'
  if (angle < 315) return 'last_quarter'
  return 'balsamic'
}

function buildSignificatorInfo(
  planet: Planet,
  planets: Record<Planet, Position>,
): SignificatorInfo {
  const pos = planets[planet]
  return {
    planet,
    sign: pos.sign,
    house: pos.house,
    dignity: getDignity(planet, pos.sign),
    retrograde: pos.retrograde,
    speed: getPlanetSpeed(planet, pos),
  }
}

// ─── Stricture checks ──────────────────────────────────────────────────────

function checkStrictures(chart: NatalChart, querentPlanet: Planet): Stricture[] {
  const strictures: Stricture[] = []
  const { planets, houses } = chart

  // Saturn in 7th house
  if (planets.Saturn.house === 7) {
    strictures.push({
      type: 'saturn_in_7th',
      description:
        'Saturn in the 7th house warns the astrologer may be biased or the question misleading.',
      severity: 'warning',
    })
  }

  // Moon void of course — no applying aspects from Moon to traditional planets
  const moonVOC = isMoonVoidOfCourse(chart)
  if (moonVOC) {
    strictures.push({
      type: 'void_of_course_moon',
      description: 'The Moon is void of course — nothing will come of the matter.',
      severity: 'prohibition',
    })
  }

  // Early ASC (< 3 degrees)
  const ascDeg = houses.ascendant % 30
  if (ascDeg < 3) {
    strictures.push({
      type: 'early_asc',
      description: `Ascendant at ${ascDeg.toFixed(1)}\u00b0 — too early to judge; the situation has not fully formed.`,
      severity: 'warning',
    })
  }

  // Late ASC (> 27 degrees)
  if (ascDeg > 27) {
    strictures.push({
      type: 'late_asc',
      description: `Ascendant at ${ascDeg.toFixed(1)}\u00b0 — too late; the matter is already decided or the querent already knows the answer.`,
      severity: 'warning',
    })
  }

  // Lord of ASC combust
  if (querentPlanet !== 'Sun' && isCombust(planets[querentPlanet], planets.Sun)) {
    strictures.push({
      type: 'combust_lord',
      description: `The querent's significator (${querentPlanet}) is combust the Sun — the querent is unable to act or is hidden from view.`,
      severity: 'prohibition',
    })
  }

  return strictures
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

// ─── Moon condition ─────────────────────────────────────────────────────────

function assessMoonCondition(chart: NatalChart): MoonCondition {
  const { planets, aspects } = chart
  const moon = planets.Moon

  // Separate applying vs separating aspects for Moon
  const moonAspects = aspects.filter(
    (a) =>
      (a.planet1 === 'Moon' || a.planet2 === 'Moon') &&
      TRADITIONAL_PLANETS.includes(a.planet1 === 'Moon' ? a.planet2 : a.planet1),
  )
  const applyingMoon = moonAspects.filter((a) => a.applying)
  const separatingMoon = moonAspects.filter((a) => !a.applying)

  // Sort by orb to find closest
  const lastAspect = separatingMoon.sort((a, b) => a.orb - b.orb)[0] ?? null
  const nextAspect = applyingMoon.sort((a, b) => a.orb - b.orb)[0] ?? null

  return {
    sign: moon.sign,
    voidOfCourse: applyingMoon.length === 0,
    lastAspect: lastAspect
      ? {
          planet: lastAspect.planet1 === 'Moon' ? lastAspect.planet2 : lastAspect.planet1,
          type: lastAspect.type,
        }
      : null,
    nextAspect: nextAspect
      ? {
          planet: nextAspect.planet1 === 'Moon' ? nextAspect.planet2 : nextAspect.planet1,
          type: nextAspect.type,
        }
      : null,
    phase: getMoonPhase(planets.Sun.longitude, moon.longitude),
  }
}

// ─── Applying aspects between significators ─────────────────────────────────

function findApplyingAspects(
  chart: NatalChart,
  querentPlanet: Planet,
  quesitedPlanet: Planet,
): ApplyingAspect[] {
  return chart.aspects
    .filter(
      (a) =>
        a.applying &&
        ((a.planet1 === querentPlanet && a.planet2 === quesitedPlanet) ||
          (a.planet1 === quesitedPlanet && a.planet2 === querentPlanet)),
    )
    .map((a) => ({
      planet1: a.planet1,
      planet2: a.planet2,
      type: a.type,
      orb: a.orb,
      applying: a.applying,
    }))
}

function checkCollectionOfLight(
  chart: NatalChart,
  querentPlanet: Planet,
  quesitedPlanet: Planet,
): Planet | null {
  // A slower planet receives applying aspects from both significators
  for (const candidate of TRADITIONAL_PLANETS) {
    if (candidate === querentPlanet || candidate === quesitedPlanet) continue
    const aspectsToCandidate = chart.aspects.filter(
      (a) =>
        a.applying &&
        ((a.planet1 === candidate &&
          (a.planet2 === querentPlanet || a.planet2 === quesitedPlanet)) ||
          (a.planet2 === candidate &&
            (a.planet1 === querentPlanet || a.planet1 === quesitedPlanet))),
    )
    // Both significators must apply to the same collector
    const touchesQuerent = aspectsToCandidate.some(
      (a) => a.planet1 === querentPlanet || a.planet2 === querentPlanet,
    )
    const touchesQuesited = aspectsToCandidate.some(
      (a) => a.planet1 === quesitedPlanet || a.planet2 === quesitedPlanet,
    )
    if (touchesQuerent && touchesQuesited) return candidate
  }
  return null
}

function checkTranslationOfLight(
  chart: NatalChart,
  querentPlanet: Planet,
  quesitedPlanet: Planet,
): Planet | null {
  // A faster planet separates from one significator and applies to the other
  for (const candidate of TRADITIONAL_PLANETS) {
    if (candidate === querentPlanet || candidate === quesitedPlanet) continue
    const candidateAspects = chart.aspects.filter(
      (a) =>
        (a.planet1 === candidate || a.planet2 === candidate) &&
        (a.planet1 === querentPlanet ||
          a.planet2 === querentPlanet ||
          a.planet1 === quesitedPlanet ||
          a.planet2 === quesitedPlanet),
    )
    const separatingFromOne = candidateAspects.some(
      (a) =>
        !a.applying &&
        (a.planet1 === querentPlanet ||
          a.planet2 === querentPlanet ||
          a.planet1 === quesitedPlanet ||
          a.planet2 === quesitedPlanet),
    )
    const applyingToOther = candidateAspects.some(
      (a) =>
        a.applying &&
        (a.planet1 === querentPlanet ||
          a.planet2 === querentPlanet ||
          a.planet1 === quesitedPlanet ||
          a.planet2 === quesitedPlanet),
    )
    if (separatingFromOne && applyingToOther) return candidate
  }
  return null
}

// ─── Judgment ───────────────────────────────────────────────────────────────

function generateJudgment(
  strictures: Stricture[],
  applyingAspects: ApplyingAspect[],
  querent: SignificatorInfo,
  quesited: SignificatorInfo,
  moonCondition: MoonCondition,
  chart: NatalChart,
): HoraryJudgment {
  const reasoning: string[] = []
  let confidence = 0.5

  // Check for prohibitive strictures
  const hasProhibition = strictures.some((s) => s.severity === 'prohibition')
  const ascDeg = chart.houses.ascendant % 30

  if (ascDeg < 3) {
    return {
      outcome: 'too_early',
      confidence: 0.3,
      reasoning: [
        'Ascendant is below 3 degrees — the question is premature and the chart cannot be judged yet.',
      ],
    }
  }

  if (
    hasProhibition &&
    strictures.some((s) => s.type === 'void_of_course_moon') &&
    applyingAspects.length === 0
  ) {
    reasoning.push(
      'The Moon is void of course with no applying aspects between significators — the matter will not materialize.',
    )
    return { outcome: 'no', confidence: 0.7, reasoning }
  }

  // Direct applying aspects between querent and quesited
  if (applyingAspects.length > 0) {
    const best = applyingAspects.sort((a, b) => a.orb - b.orb)[0]
    switch (best.type) {
      case 'Trine':
      case 'Sextile':
        reasoning.push(
          `${querent.planet} applies to ${quesited.planet} by ${best.type} (orb ${best.orb.toFixed(1)}\u00b0) — the matter resolves favorably.`,
        )
        confidence = 0.8
        return { outcome: 'yes', confidence, reasoning }
      case 'Square':
        reasoning.push(
          `${querent.planet} applies to ${quesited.planet} by Square (orb ${best.orb.toFixed(1)}\u00b0) — the matter may succeed but with difficulty and delays.`,
        )
        confidence = 0.6
        return { outcome: 'conditional', confidence, reasoning }
      case 'Opposition':
        reasoning.push(
          `${querent.planet} applies to ${quesited.planet} by Opposition (orb ${best.orb.toFixed(1)}\u00b0) — the matter faces strong resistance; success is unlikely or comes only with great effort.`,
        )
        confidence = 0.55
        return { outcome: 'no', confidence, reasoning }
      case 'Conjunction':
        reasoning.push(
          `${querent.planet} applies to conjunction with ${quesited.planet} (orb ${best.orb.toFixed(1)}\u00b0) — the significators come together; strong indication of a positive outcome.`,
        )
        confidence = 0.85
        return { outcome: 'yes', confidence, reasoning }
      default:
        reasoning.push(
          `${querent.planet} applies to ${quesited.planet} by minor aspect (${best.type}) — a weak but possible connection.`,
        )
        confidence = 0.45
        return { outcome: 'conditional', confidence, reasoning }
    }
  }

  // Collection of light
  const collector = checkCollectionOfLight(chart, querent.planet, quesited.planet)
  if (collector) {
    reasoning.push(
      `No direct aspect, but ${collector} collects the light of both ${querent.planet} and ${quesited.planet} — a third party may bring the matter to completion.`,
    )
    return { outcome: 'conditional', confidence: 0.6, reasoning }
  }

  // Translation of light
  const translator = checkTranslationOfLight(chart, querent.planet, quesited.planet)
  if (translator) {
    reasoning.push(
      `No direct aspect, but ${translator} translates light between ${querent.planet} and ${quesited.planet} — an intermediary may help connect the parties.`,
    )
    return { outcome: 'conditional', confidence: 0.55, reasoning }
  }

  // No connection at all
  reasoning.push(
    `No applying aspect, collection, or translation of light between ${querent.planet} and ${quesited.planet} — the matter will not come to fruition.`,
  )

  // Adjust confidence if Moon supports
  if (moonCondition.nextAspect) {
    const benefics: Planet[] = ['Venus', 'Jupiter']
    if (benefics.includes(moonCondition.nextAspect.planet)) {
      reasoning.push(
        `However, the Moon's next aspect is to benefic ${moonCondition.nextAspect.planet}, which may lend some hope.`,
      )
      confidence = 0.4
    }
  }

  return { outcome: 'no', confidence: Math.max(confidence, 0.35), reasoning }
}

// ─── Main entry point ───────────────────────────────────────────────────────

export async function assessHoraryChart(input: {
  year: number
  month: number
  day: number
  hour: number
  latitude: number
  longitude: number
  questionHouse: number
}): Promise<HoraryResult> {
  const { year, month, day, hour, latitude, longitude, questionHouse } = input

  // 1. Compute chart at question time
  const engineInput: SwissEphemerisInput = {
    birthYear: year,
    birthMonth: month,
    birthDay: day,
    birthHour: hour,
    latitude,
    longitude,
    houseSystem: 'R', // Regiomontanus — traditional horary system
  }
  const result = await run(engineInput)
  const chart = result.data

  // 2. Identify significators
  const ascSign = signAtCusp(chart.houses.cusps, 1)
  const quesitedSign = signAtCusp(chart.houses.cusps, questionHouse)
  const querentPlanet = SIGN_RULERS[ascSign]
  const quesitedPlanet = SIGN_RULERS[quesitedSign]

  const querent = buildSignificatorInfo(querentPlanet, chart.planets)
  const quesited = buildSignificatorInfo(quesitedPlanet, chart.planets)

  // 3. Check strictures
  const strictures = checkStrictures(chart, querentPlanet)
  const isRadical = !strictures.some((s) => s.severity === 'prohibition')

  // 4. Applying aspects between significators
  const applyingAspects = findApplyingAspects(chart, querentPlanet, quesitedPlanet)

  // 5. Moon condition
  const moonCondition = assessMoonCondition(chart)

  // 6. Judgment
  const judgment = generateJudgment(
    strictures,
    applyingAspects,
    querent,
    quesited,
    moonCondition,
    chart,
  )

  return {
    chartMoment: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')} UTC`,
    strictures,
    isRadical,
    querent,
    quesited,
    applyingAspects,
    moonCondition,
    judgment,
  }
}
