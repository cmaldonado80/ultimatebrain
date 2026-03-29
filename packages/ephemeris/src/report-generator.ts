/**
 * Natal Report Generator
 *
 * Orchestrates multiple ephemeris computations into a structured natal report
 * with readable text sections and raw data for each computation area.
 */

import {
  accidentalDignities,
  type AccidentalDignityResult,
  criticalDegrees,
  type SectAnalysis,
  sectAnalysis,
} from './accidental'
import { type ArabicPart, calcArabicParts } from './classical'
import {
  calcDeclinations,
  calcParallels,
  type DeclinationResult,
  type ParallelAspect,
} from './declinations'
import { dispositorChain, type DispositorChainResult } from './dispositors'
import {
  type Aspect,
  type Dignity,
  type HouseCusps,
  type NatalChart,
  type Position,
  run,
  type SwissEphemerisInput,
} from './engine'
import { calcFixedStars, fixedStarConjunctions, type StarConjunction } from './fixed-stars'
import {
  type LunarMansion,
  lunarMansion,
  moonPhase,
  type MoonPhaseResult,
  type PrenatalLunation,
  prenatalLunations,
} from './lunar'
import { type AspectPattern, findAspectPatterns } from './patterns'
import { calcDecanates, calcDwads, calcNavamsa, type Subdivision } from './subdivisions'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReportSection {
  title: string
  content: string // Structured text summary
  data: unknown // Raw computation data
}

export interface NatalReport {
  name: string
  birthData: { year: number; month: number; day: number; hour: number; lat: number; lon: number }
  summary: string // "Sun 24° Gem · Moon 16° Pis · ASC 26° Leo"
  sections: ReportSection[]
  generatedAt: string
}

// ─── Format Helpers ──────────────────────────────────────────────────────────

function formatOverview(
  summary: string,
  chart: NatalChart,
  moon: MoonPhaseResult,
  mansion: LunarMansion,
  sect: SectAnalysis,
): string {
  return [
    summary,
    `Chart Shape: ${chart.chartShape ?? 'Unknown'}`,
    `Dominant Element: ${chart.dominantElement ?? 'N/A'} | Mode: ${chart.dominantMode ?? 'N/A'}`,
    `Moon Phase: ${moon.phaseName} (${moon.illumination.toFixed(0)}% illuminated, ${moon.waxing ? 'waxing' : 'waning'})`,
    `Lunar Mansion: #${mansion.number} ${mansion.name} — ${mansion.meaning}`,
    `Chart Sect: ${sect.chartSect}`,
    `Sect Light: ${sect.sectLight} | Sect Benefic: ${sect.sectBenefic} | Sect Malefic: ${sect.sectMalefic}`,
  ].join('\n')
}

function formatPlanetPositions(planets: Record<string, Position>): string {
  return Object.entries(planets)
    .map(
      ([name, p]) =>
        `${name}: ${p.degree}°${String(p.minutes).padStart(2, '0')}' ${p.sign}${p.retrograde ? ' Rx' : ''} (House ${p.house})`,
    )
    .join('\n')
}

function formatHouses(houses: HouseCusps): string {
  const lines: string[] = []
  for (let i = 1; i <= 12 && i < houses.cusps.length; i++) {
    const lon = houses.cusps[i]
    const signIndex = Math.floor(lon / 30) % 12
    const signs = [
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
    const deg = Math.floor(lon % 30)
    const min = Math.floor((lon % 1) * 60)
    lines.push(`House ${i}: ${deg}°${String(min).padStart(2, '0')}' ${signs[signIndex]}`)
  }
  lines.push(
    `ASC: ${houses.ascendant.toFixed(2)}° | MC: ${houses.mc.toFixed(2)}° | Vertex: ${houses.vertex.toFixed(2)}°`,
  )
  return lines.join('\n')
}

function formatAspects(aspects: Aspect[]): string {
  if (aspects.length === 0) return 'No major aspects found.'
  return aspects
    .map((a) => {
      const status = a.applying ? 'applying' : 'separating'
      const exact = a.exact ? ' (exact)' : ''
      return `${a.planet1} ${a.type} ${a.planet2} — orb ${a.orb.toFixed(2)}° ${status}${exact}`
    })
    .join('\n')
}

function formatPatterns(patterns: AspectPattern[]): string {
  return patterns.map((p) => `${p.type}: ${p.planets.join(', ')} — ${p.description}`).join('\n')
}

function formatDignities(dignities: Record<string, Dignity>): string {
  return Object.entries(dignities)
    .map(([planet, d]) => {
      const conditions: string[] = []
      if (d.domicile) conditions.push('Domicile')
      if (d.exaltation) conditions.push('Exaltation')
      if (d.triplicity) conditions.push('Triplicity')
      if (d.term) conditions.push('Term')
      if (d.face) conditions.push('Face')
      if (d.detriment) conditions.push('Detriment')
      if (d.fall) conditions.push('Fall')
      if (d.peregrine) conditions.push('Peregrine')
      const label = conditions.length > 0 ? conditions.join(', ') : 'None'
      return `${planet}: ${label} (score: ${d.score})`
    })
    .join('\n')
}

function formatSectAndAccidental(
  sect: SectAnalysis,
  accidental: AccidentalDignityResult[],
): string {
  const lines: string[] = [
    `Chart Sect: ${sect.chartSect}`,
    `Sect Light: ${sect.sectLight} | Benefic: ${sect.sectBenefic} | Malefic: ${sect.sectMalefic}`,
    '',
    'Planet Sect Status:',
    ...Object.entries(sect.planetSect).map(([p, status]) => `  ${p}: ${status}`),
    '',
    'Accidental Dignity Scores:',
  ]
  for (const ad of accidental) {
    const flags: string[] = []
    if (ad.isHayz) flags.push('Hayz')
    if (ad.isOriental) flags.push('Oriental')
    if (ad.isBesieged) flags.push('Besieged')
    const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : ''
    lines.push(
      `  ${ad.planet}: House ${ad.house}, Angular +${ad.angularScore}, Speed: ${ad.speedClass}, Total: ${ad.totalScore}${flagStr}`,
    )
  }
  return lines.join('\n')
}

function formatMoon(
  moon: MoonPhaseResult,
  mansion: LunarMansion,
  prenatal: { newMoon: PrenatalLunation; fullMoon: PrenatalLunation },
): string {
  const lines: string[] = [
    `Phase: ${moon.phaseName}`,
    `Angle: ${moon.angle.toFixed(2)}°`,
    `Illumination: ${moon.illumination.toFixed(1)}%`,
    `Direction: ${moon.waxing ? 'Waxing' : 'Waning'}`,
    `Lunar Mansion: #${mansion.number} ${mansion.name}`,
    `Mansion Meaning: ${mansion.meaning}`,
    '',
    'Prenatal Lunations:',
    `  New Moon: ${prenatal.newMoon.date} at ${prenatal.newMoon.moonLongitude.toFixed(2)}° ${prenatal.newMoon.sign}`,
    `  Full Moon: ${prenatal.fullMoon.date} at ${prenatal.fullMoon.moonLongitude.toFixed(2)}° ${prenatal.fullMoon.sign}`,
  ]
  return lines.join('\n')
}

function formatSubdivisions(
  dwads: Record<string, Subdivision>,
  navamsa: Record<string, Subdivision>,
  decanates: Record<string, Subdivision>,
): string {
  const lines: string[] = ['Dwads (Dodecatemoria):']
  for (const [planet, sub] of Object.entries(dwads)) {
    lines.push(
      `  ${planet}: ${sub.degree}° ${sub.sign}${sub.ruler ? ` (ruler: ${sub.ruler})` : ''}`,
    )
  }
  lines.push('', 'Navamsa (D-9):')
  for (const [planet, sub] of Object.entries(navamsa)) {
    lines.push(
      `  ${planet}: ${sub.degree}° ${sub.sign}${sub.ruler ? ` (ruler: ${sub.ruler})` : ''}`,
    )
  }
  lines.push('', 'Decanates:')
  for (const [planet, sub] of Object.entries(decanates)) {
    lines.push(
      `  ${planet}: ${sub.degree}° ${sub.sign}${sub.ruler ? ` (ruler: ${sub.ruler})` : ''}`,
    )
  }
  return lines.join('\n')
}

function formatStarAspects(starAspects: StarConjunction[]): string {
  return starAspects
    .map((sa) => `${sa.star} conjunct ${sa.planet} — orb ${sa.orb.toFixed(2)}°`)
    .join('\n')
}

function formatArabicParts(parts: ArabicPart[]): string {
  return parts.map((p) => `${p.name}: ${p.degree}° ${p.sign} (House ${p.house})`).join('\n')
}

function formatDispositors(dispositors: DispositorChainResult): string {
  const lines: string[] = ['Dispositor Chain:']
  for (const [planet, ruler] of Object.entries(dispositors.dispositors)) {
    lines.push(`  ${planet} -> ${ruler}`)
  }
  if (dispositors.finalDispositor) {
    lines.push(`\nFinal Dispositor: ${dispositors.finalDispositor}`)
  } else {
    lines.push('\nNo single final dispositor (mutual reception loop)')
  }
  if (dispositors.mutualReceptions.length > 0) {
    lines.push('\nMutual Receptions:')
    for (const [a, b] of dispositors.mutualReceptions) {
      lines.push(`  ${a} <-> ${b}`)
    }
  }
  return lines.join('\n')
}

function formatDeclinations(decl: DeclinationResult[], parallels: ParallelAspect[]): string {
  const lines: string[] = ['Declinations:']
  for (const d of decl) {
    const oob = d.isOutOfBounds ? ' (OUT OF BOUNDS)' : ''
    lines.push(`  ${d.planet}: ${d.declination > 0 ? '+' : ''}${d.declination.toFixed(2)}°${oob}`)
  }
  if (parallels.length > 0) {
    lines.push('', 'Parallels & Contraparallels:')
    for (const p of parallels) {
      lines.push(`  ${p.planet1} ${p.type} ${p.planet2} — orb ${p.orb.toFixed(2)}°`)
    }
  }
  return lines.join('\n')
}

function formatLots(lots: { fortune: Position; spirit: Position; eros: Position }): string {
  const fmt = (name: string, pos: Position) =>
    `${name}: ${pos.degree}°${String(pos.minutes).padStart(2, '0')}' ${pos.sign} (House ${pos.house})`
  return [
    fmt('Lot of Fortune', lots.fortune),
    fmt('Lot of Spirit', lots.spirit),
    fmt('Lot of Eros', lots.eros),
  ].join('\n')
}

// ─── Main Report Generator ──────────────────────────────────────────────────

export async function generateNatalReport(
  input: SwissEphemerisInput & { name?: string },
): Promise<NatalReport> {
  // 1. Run the core natal chart
  const engineResult = await run(input)
  const chart = engineResult.data
  const jd = chart.julianDay
  const planets = chart.planets

  // 2. Aspect patterns
  const patterns = findAspectPatterns(chart.aspects, planets)

  // 3. Moon data
  const moon = moonPhase(planets.Sun.longitude, planets.Moon.longitude)
  const mansion = lunarMansion(planets.Moon.longitude)
  const prenatal = prenatalLunations(jd)

  // 4. Sect & accidental dignities
  const sect = sectAnalysis(planets, chart.houses)
  const accidental = accidentalDignities(planets, chart.houses, chart.aspects)
  const critical = criticalDegrees(planets)

  // 5. Subdivisions
  const dwads = calcDwads(planets)
  const navamsa = calcNavamsa(planets)
  const decanates = calcDecanates(planets)

  // 6. Fixed stars
  const stars = calcFixedStars(jd)
  const starAspects = fixedStarConjunctions(stars, planets)

  // 7. Arabic parts
  const arabicParts = calcArabicParts(planets, chart.houses)

  // 8. Dispositors
  const dispositors = dispositorChain(planets)

  // 9. Declinations
  const decl = calcDeclinations(planets)
  const parallels = calcParallels(decl)

  // Build sections
  const sections: ReportSection[] = []

  // Section 1: Chart Overview
  sections.push({
    title: 'Chart Overview',
    content: formatOverview(engineResult.summary, chart, moon, mansion, sect),
    data: {
      summary: engineResult.summary,
      chartShape: chart.chartShape,
      dominantElement: chart.dominantElement,
      dominantMode: chart.dominantMode,
    },
  })

  // Section 2: Planetary Positions
  sections.push({
    title: 'Planetary Positions',
    content: formatPlanetPositions(planets),
    data: planets,
  })

  // Section 3: House Cusps
  sections.push({
    title: 'Houses',
    content: formatHouses(chart.houses),
    data: chart.houses,
  })

  // Section 4: Aspects
  sections.push({
    title: 'Aspects',
    content: formatAspects(chart.aspects),
    data: chart.aspects,
  })

  // Section 5: Aspect Patterns
  if (patterns.length > 0) {
    sections.push({
      title: 'Aspect Patterns',
      content: formatPatterns(patterns),
      data: patterns,
    })
  }

  // Section 6: Dignities
  sections.push({
    title: 'Essential Dignities',
    content: formatDignities(chart.dignities),
    data: chart.dignities,
  })

  // Section 7: Sect & Accidental Dignities
  sections.push({
    title: 'Sect & Accidental Dignities',
    content: formatSectAndAccidental(sect, accidental),
    data: { sect, accidental },
  })

  // Section 8: Moon Data
  sections.push({
    title: 'Moon',
    content: formatMoon(moon, mansion, prenatal),
    data: { moon, mansion, prenatal },
  })

  // Section 9: Subdivisions
  sections.push({
    title: 'Subdivisions (Dwad, Navamsa, Decanate)',
    content: formatSubdivisions(dwads, navamsa, decanates),
    data: { dwads, navamsa, decanates },
  })

  // Section 10: Fixed Stars
  if (starAspects.length > 0) {
    sections.push({
      title: 'Fixed Star Conjunctions',
      content: formatStarAspects(starAspects),
      data: starAspects,
    })
  }

  // Section 11: Arabic Parts
  sections.push({
    title: 'Arabic Parts / Lots',
    content: formatArabicParts(arabicParts),
    data: arabicParts,
  })

  // Section 12: Dispositor Chain
  sections.push({
    title: 'Dispositor Chain',
    content: formatDispositors(dispositors),
    data: dispositors,
  })

  // Section 13: Declinations
  sections.push({
    title: 'Declinations & Parallels',
    content: formatDeclinations(decl, parallels),
    data: { declinations: decl, parallels },
  })

  // Section 14: Critical Degrees
  if (critical.length > 0) {
    sections.push({
      title: 'Critical Degrees',
      content: critical
        .map((c) => `${c.planet} at ${c.degree}° ${c.sign}: ${c.description}`)
        .join('\n'),
      data: critical,
    })
  }

  // Section 15: Lots
  if (chart.lots) {
    sections.push({
      title: 'Arabic Lots (Fortune, Spirit, Eros)',
      content: formatLots(chart.lots),
      data: chart.lots,
    })
  }

  return {
    name: input.name ?? 'Native',
    birthData: {
      year: input.birthYear,
      month: input.birthMonth,
      day: input.birthDay,
      hour: input.birthHour,
      lat: input.latitude,
      lon: input.longitude,
    },
    summary: engineResult.summary,
    sections,
    generatedAt: new Date().toISOString(),
  }
}
