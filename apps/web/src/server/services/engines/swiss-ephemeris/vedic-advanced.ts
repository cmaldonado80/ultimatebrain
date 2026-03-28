/**
 * Advanced Vedic Astrology Calculations
 *
 * Divisional charts (Vargas), Shadbala strength, Ashtakavarga,
 * Chara Karakas, and Muhurta scoring.
 */

import type { HouseCusps, Planet, Position, ZodiacSign } from './engine'
import { calcAllPlanets, DOMICILE, getHouseForLongitude, PLANET_LIST, SIGN_NAMES } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VargaPosition {
  planet: Planet
  vargaLongitude: number
  sign: ZodiacSign
  degree: number
}

export interface ShadbalaResult {
  planet: Planet
  sthanaBala: number
  digBala: number
  kalaBala: number
  cheshtaBala: number
  naisargikaBala: number
  drikBala: number
  total: number
}

export interface AshtakavargaResult {
  bav: Record<string, number[]>
  sav: number[]
}

export interface CharaKaraka {
  karaka: string
  planet: Planet
  degreeInSign: number
}

export interface MuhurtaResult {
  overall: string
  tithiScore: number
  varaScore: number
  nakshatraScore: number
  yogaScore: number
  karanaScore: number
  totalScore: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Exaltation degrees for Shadbala uchcha bala */
const EXALTATION_DEGREES: Partial<Record<Planet, number>> = {
  Sun: 10, // Aries 10
  Moon: 33, // Taurus 3
  Mercury: 165, // Virgo 15
  Venus: 357, // Pisces 27
  Mars: 298, // Capricorn 28
  Jupiter: 105, // Cancer 15
  Saturn: 201, // Libra 21
}

/** Directional strength houses (1-indexed) */
const DIG_BALA_HOUSES: Partial<Record<Planet, number>> = {
  Jupiter: 1,
  Mercury: 1,
  Sun: 10,
  Mars: 10,
  Saturn: 7,
  Moon: 4,
  Venus: 4,
}

/** Natural strength (Naisargika Bala) — fixed values */
const NAISARGIKA_BALA: Partial<Record<Planet, number>> = {
  Sun: 60,
  Moon: 51.43,
  Venus: 42.86,
  Jupiter: 34.29,
  Mercury: 25.71,
  Mars: 17.14,
  Saturn: 8.57,
}

/** Classical 7 planets used in Vedic calculations */
const CLASSICAL_PLANETS: Planet[] = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']

/** Chara Karaka planet list (7 + Rahu) */
const KARAKA_PLANETS: Planet[] = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'NorthNode',
]

const KARAKA_NAMES: string[] = [
  'Atmakaraka',
  'Amatyakaraka',
  'Bhratrikaraka',
  'Matrikaraka',
  'Putrakaraka',
  'Gnatikaraka',
  'Darakaraka',
]

/** Varga divisions to compute in allVargaCharts */
const VARGA_DIVISIONS: Record<string, number> = {
  'D-1 Rasi': 1,
  'D-2 Hora': 2,
  'D-3 Drekkana': 3,
  'D-4 Chaturthamsa': 4,
  'D-7 Saptamsa': 7,
  'D-9 Navamsa': 9,
  'D-10 Dasamsa': 10,
  'D-12 Dwadasamsa': 12,
  'D-16 Shodasamsa': 16,
  'D-20 Vimsamsa': 20,
  'D-24 Chaturvimsamsa': 24,
  'D-27 Bhamsa': 27,
  'D-30 Trimsamsa': 30,
  'D-40 Khavedamsa': 40,
  'D-45 Akshavedamsa': 45,
  'D-60 Shashtiamsa': 60,
}

/** Nakshatra names for muhurta scoring */
const NAKSHATRA_NAMES: string[] = [
  'Ashwini',
  'Bharani',
  'Krittika',
  'Rohini',
  'Mrigashira',
  'Ardra',
  'Punarvasu',
  'Pushya',
  'Ashlesha',
  'Magha',
  'Purva Phalguni',
  'Uttara Phalguni',
  'Hasta',
  'Chitra',
  'Swati',
  'Vishakha',
  'Anuradha',
  'Jyeshtha',
  'Mula',
  'Purva Ashadha',
  'Uttara Ashadha',
  'Shravana',
  'Dhanishta',
  'Shatabhisha',
  'Purva Bhadrapada',
  'Uttara Bhadrapada',
  'Revati',
]

/** Good nakshatras for muhurta */
const GOOD_NAKSHATRAS = new Set([
  'Ashwini',
  'Rohini',
  'Mrigashira',
  'Pushya',
  'Hasta',
  'Chitra',
  'Swati',
  'Anuradha',
  'Revati',
])

/** Simplified BAV contribution tables: for each planet, which houses from
 *  other planets yield a bindu. Key = source planet, values = house offsets
 *  (1-indexed) from the source planet that contribute a point. */
const BAV_TABLES: Record<string, Record<string, number[]>> = {
  Sun: {
    Sun: [1, 2, 4, 7, 8, 9, 10, 11],
    Moon: [3, 6, 10, 11],
    Mars: [1, 2, 4, 7, 8, 9, 10, 11],
    Mercury: [3, 5, 6, 9, 10, 11, 12],
    Jupiter: [5, 6, 9, 11],
    Venus: [6, 7, 12],
    Saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    Ascendant: [3, 4, 6, 10, 11, 12],
  },
  Moon: {
    Sun: [3, 6, 7, 8, 10, 11],
    Moon: [1, 3, 6, 7, 10, 11],
    Mars: [2, 3, 5, 6, 9, 10, 11],
    Mercury: [1, 3, 4, 5, 7, 8, 10, 11],
    Jupiter: [1, 4, 7, 8, 10, 11, 12],
    Venus: [3, 4, 5, 7, 9, 10, 11],
    Saturn: [3, 5, 6, 11],
    Ascendant: [3, 6, 10, 11],
  },
  Mars: {
    Sun: [3, 5, 6, 10, 11],
    Moon: [3, 6, 11],
    Mars: [1, 2, 4, 7, 8, 10, 11],
    Mercury: [3, 5, 6, 11],
    Jupiter: [6, 10, 11, 12],
    Venus: [6, 8, 11, 12],
    Saturn: [1, 4, 7, 8, 9, 10, 11],
    Ascendant: [1, 3, 6, 10, 11],
  },
  Mercury: {
    Sun: [5, 6, 9, 11, 12],
    Moon: [2, 4, 6, 8, 10, 11],
    Mars: [1, 2, 4, 7, 8, 9, 10, 11],
    Mercury: [1, 3, 5, 6, 9, 10, 11, 12],
    Jupiter: [6, 8, 11, 12],
    Venus: [1, 2, 3, 4, 5, 8, 9, 11],
    Saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    Ascendant: [1, 2, 4, 6, 8, 10, 11],
  },
  Jupiter: {
    Sun: [1, 2, 3, 4, 7, 8, 9, 10, 11],
    Moon: [2, 5, 7, 9, 11],
    Mars: [1, 2, 4, 7, 8, 10, 11],
    Mercury: [1, 2, 4, 5, 6, 9, 10, 11],
    Jupiter: [1, 2, 3, 4, 7, 8, 10, 11],
    Venus: [2, 5, 6, 9, 10, 11],
    Saturn: [3, 5, 6, 12],
    Ascendant: [1, 2, 4, 5, 6, 7, 9, 10, 11],
  },
  Venus: {
    Sun: [8, 11, 12],
    Moon: [1, 2, 3, 4, 5, 8, 9, 11, 12],
    Mars: [3, 4, 6, 8, 9, 11, 12],
    Mercury: [3, 5, 6, 9, 11],
    Jupiter: [5, 8, 9, 10, 11],
    Venus: [1, 2, 3, 4, 5, 8, 9, 10, 11],
    Saturn: [3, 4, 5, 8, 9, 10, 11],
    Ascendant: [1, 2, 3, 4, 5, 8, 9, 11],
  },
  Saturn: {
    Sun: [1, 2, 4, 7, 8, 10, 11],
    Moon: [3, 6, 11],
    Mars: [3, 5, 6, 10, 11, 12],
    Mercury: [6, 8, 9, 10, 11, 12],
    Jupiter: [5, 6, 11, 12],
    Venus: [6, 11, 12],
    Saturn: [3, 5, 6, 11],
    Ascendant: [1, 3, 4, 6, 10, 11],
  },
}

// ─── Divisional Charts ───────────────────────────────────────────────────────

/**
 * Compute a divisional (Varga) chart for a given division number.
 *
 * For D-9 (Navamsa): the zodiac is divided into 108 navamsas of 3°20' each.
 * For general D-N: the 30-degree sign is divided into N equal parts, and the
 * sub-part index determines the varga sign.
 */
export function divisionalChart(
  planets: Record<Planet, Position>,
  division: number,
): VargaPosition[] {
  const results: VargaPosition[] = []

  for (const name of PLANET_LIST) {
    const pos = planets[name]
    if (!pos) continue

    const lon = pos.longitude
    let vargaSignIndex: number
    let degreeInVarga: number

    if (division === 1) {
      // D-1 Rasi: same as natal
      vargaSignIndex = Math.floor(lon / 30)
      degreeInVarga = lon % 30
    } else if (division === 9) {
      // D-9 Navamsa: 108 navamsas of 3.3333 degrees each
      const navamsaIndex = Math.floor(lon / (360 / 108))
      vargaSignIndex = navamsaIndex % 12
      degreeInVarga = (lon % (360 / 108)) * 9
    } else {
      // General D-N: divide each sign into N parts
      const signIndex = Math.floor(lon / 30)
      const degInSign = lon % 30
      const partIndex = Math.floor((degInSign * division) / 30)
      vargaSignIndex = (signIndex + partIndex) % 12
      degreeInVarga = (degInSign * division) % 30
    }

    vargaSignIndex = ((vargaSignIndex % 12) + 12) % 12
    const sign = SIGN_NAMES[vargaSignIndex]
    const vargaLon = vargaSignIndex * 30 + degreeInVarga

    results.push({
      planet: name,
      vargaLongitude: vargaLon,
      sign,
      degree: degreeInVarga,
    })
  }

  return results
}

/**
 * Compute all 16 standard Varga charts.
 */
export function allVargaCharts(planets: Record<Planet, Position>): Record<string, VargaPosition[]> {
  const result: Record<string, VargaPosition[]> = {}
  for (const [label, div] of Object.entries(VARGA_DIVISIONS)) {
    result[label] = divisionalChart(planets, div)
  }
  return result
}

// ─── Shadbala ────────────────────────────────────────────────────────────────

/**
 * Compute Shadbala (six-fold strength) for the 7 classical planets.
 */
export function shadbala(
  planets: Record<Planet, Position>,
  houses: HouseCusps,
  jd: number,
): ShadbalaResult[] {
  const results: ShadbalaResult[] = []

  for (const planet of CLASSICAL_PLANETS) {
    const pos = planets[planet]
    if (!pos) continue

    // 1. Sthana Bala (positional strength)
    let sthanaBala = 0

    // Uchcha Bala (exaltation strength)
    const exDeg = EXALTATION_DEGREES[planet]
    if (exDeg !== undefined) {
      let diff = Math.abs(pos.longitude - exDeg)
      if (diff > 180) diff = 360 - diff
      sthanaBala += (180 - diff) / 3
    }

    // Own-sign bonus (Swa-kshetra)
    const domicileSigns = DOMICILE[planet]
    if (domicileSigns && domicileSigns.includes(pos.sign)) {
      sthanaBala += 30
    }

    // Moolatrikona bonus (simplified: same as domicile first sign)
    if (domicileSigns && domicileSigns[0] === pos.sign) {
      sthanaBala += 15
    }

    // 2. Dig Bala (directional strength)
    let digBala = 0
    const strengthHouse = DIG_BALA_HOUSES[planet]
    if (strengthHouse !== undefined) {
      const currentHouse = pos.house || getHouseForLongitude(pos.longitude, houses.cusps)
      let houseDist = Math.abs(currentHouse - strengthHouse)
      if (houseDist > 6) houseDist = 12 - houseDist
      digBala = Math.max(0, (180 - houseDist * 30) / 3)
    }

    // 3. Kala Bala (temporal strength)
    let kalaBala = 0
    // Day/night sect bonus
    const sunLon = planets.Sun?.longitude ?? 0
    const isDayChart = (() => {
      // Sun above horizon = day chart
      const sunHouse = getHouseForLongitude(sunLon, houses.cusps)
      return sunHouse >= 7 && sunHouse <= 12
    })()

    // Day planets (Sun, Jupiter, Saturn) get bonus in day charts
    const dayPlanets: Planet[] = ['Sun', 'Jupiter', 'Saturn']
    const nightPlanets: Planet[] = ['Moon', 'Venus', 'Mars']
    if (isDayChart && dayPlanets.includes(planet)) {
      kalaBala += 30
    } else if (!isDayChart && nightPlanets.includes(planet)) {
      kalaBala += 30
    }
    // Mercury is benefic in both
    if (planet === 'Mercury') {
      kalaBala += 30
    }

    // Weekday lord bonus (simplified from JD)
    const dayOfWeek = Math.floor(jd + 1.5) % 7
    // 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
    const weekdayLords: Planet[] = ['Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Sun']
    if (weekdayLords[dayOfWeek] === planet) {
      kalaBala += 15
    }

    // Hora lord bonus (simplified)
    const hora = Math.floor((jd * 24) % 24)
    const horaSequence: Planet[] = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon']
    if (horaSequence[hora % 7] === planet) {
      kalaBala += 15
    }

    // 4. Cheshta Bala (motional strength)
    let cheshtaBala = 0
    if (planet === 'Sun' || planet === 'Moon') {
      // Luminaries: based on speed relative to mean
      const meanSpeed = planet === 'Sun' ? 0.9856 : 13.1763
      cheshtaBala = Math.min(60, (pos.speed / meanSpeed) * 60)
    } else {
      // Planets: retrograde = max strength
      if (pos.retrograde) {
        cheshtaBala = 60
      } else {
        // Mean daily motions for speed ratio
        const meanSpeeds: Partial<Record<Planet, number>> = {
          Mercury: 4.0923,
          Venus: 1.6021,
          Mars: 0.524,
          Jupiter: 0.0831,
          Saturn: 0.0335,
        }
        const mean = meanSpeeds[planet] ?? 1
        cheshtaBala = Math.min(60, Math.abs(pos.speed / mean) * 60)
      }
    }

    // 5. Naisargika Bala (natural strength)
    const naisargikaBala = NAISARGIKA_BALA[planet] ?? 0

    // 6. Drik Bala (aspectual strength)
    let drikBala = 0
    const benefics: Planet[] = ['Jupiter', 'Venus', 'Mercury', 'Moon']
    const malefics: Planet[] = ['Saturn', 'Mars', 'Sun']
    for (const other of CLASSICAL_PLANETS) {
      if (other === planet) continue
      const otherPos = planets[other]
      if (!otherPos) continue
      let diff = Math.abs(pos.longitude - otherPos.longitude)
      if (diff > 180) diff = 360 - diff

      // Check if aspect exists (within rough orb)
      const isAspect = [0, 60, 90, 120, 180].some((a) => Math.abs(diff - a) < 10)
      if (isAspect) {
        if (benefics.includes(other)) {
          drikBala += 15
        } else if (malefics.includes(other)) {
          drikBala -= 15
        }
      }
    }

    const total = sthanaBala + digBala + kalaBala + cheshtaBala + naisargikaBala + drikBala

    results.push({
      planet,
      sthanaBala: Math.round(sthanaBala * 100) / 100,
      digBala: Math.round(digBala * 100) / 100,
      kalaBala: Math.round(kalaBala * 100) / 100,
      cheshtaBala: Math.round(cheshtaBala * 100) / 100,
      naisargikaBala: Math.round(naisargikaBala * 100) / 100,
      drikBala: Math.round(drikBala * 100) / 100,
      total: Math.round(total * 100) / 100,
    })
  }

  return results
}

// ─── Ashtakavarga ────────────────────────────────────────────────────────────

/**
 * Compute Ashtakavarga — Bindu/Ashtakavarga Varga (BAV) for each planet
 * and the Sarvashtakavarga (SAV) aggregate.
 */
export function ashtakavarga(planets: Record<Planet, Position>): AshtakavargaResult {
  const bavResult: Record<string, number[]> = {}
  const sav: number[] = new Array(12).fill(0)

  // Get sign indices for all planets + ascendant
  const signOf: Record<string, number> = {}
  for (const p of CLASSICAL_PLANETS) {
    const pos = planets[p]
    if (pos) {
      signOf[p] = Math.floor(pos.longitude / 30)
    }
  }

  // Compute BAV for each of the 7 classical planets
  for (const targetPlanet of CLASSICAL_PLANETS) {
    const bavArray: number[] = new Array(12).fill(0)
    const table = BAV_TABLES[targetPlanet]
    if (!table) {
      bavResult[targetPlanet] = bavArray
      continue
    }

    for (const [sourcePlanet, offsets] of Object.entries(table)) {
      if (sourcePlanet === 'Ascendant') continue // handled separately
      const sourceSign = signOf[sourcePlanet]
      if (sourceSign === undefined) continue

      for (const offset of offsets) {
        const targetSign = (sourceSign + offset - 1) % 12
        bavArray[targetSign] = Math.min(bavArray[targetSign] + 1, 8)
      }
    }

    // Ascendant contribution (use Sun's sign as proxy if ascendant not in planets)
    if (table.Ascendant) {
      const ascSign = signOf.Sun ?? 0
      for (const offset of table.Ascendant) {
        const targetSign = (ascSign + offset - 1) % 12
        bavArray[targetSign] = Math.min(bavArray[targetSign] + 1, 8)
      }
    }

    bavResult[targetPlanet] = bavArray

    // Accumulate into SAV
    for (let i = 0; i < 12; i++) {
      sav[i] += bavArray[i]
    }
  }

  return { bav: bavResult, sav }
}

// ─── Chara Karakas ───────────────────────────────────────────────────────────

/**
 * Compute Jaimini Chara Karakas — variable significators based on
 * planetary degrees within their signs.
 */
export function charaKarakas(planets: Record<Planet, Position>): CharaKaraka[] {
  const entries: { planet: Planet; degreeInSign: number }[] = []

  for (const planet of KARAKA_PLANETS) {
    const pos = planets[planet]
    if (!pos) continue

    let degInSign: number
    if (planet === 'NorthNode') {
      // Rahu's degree is calculated as 30 - degreeInSign
      degInSign = 30 - (pos.longitude % 30)
    } else {
      degInSign = pos.longitude % 30
    }

    entries.push({ planet, degreeInSign: degInSign })
  }

  // Sort descending by degree in sign
  entries.sort((a, b) => b.degreeInSign - a.degreeInSign)

  const results: CharaKaraka[] = []
  for (let i = 0; i < Math.min(entries.length, KARAKA_NAMES.length); i++) {
    results.push({
      karaka: KARAKA_NAMES[i],
      planet: entries[i].planet,
      degreeInSign: Math.round(entries[i].degreeInSign * 100) / 100,
    })
  }

  return results
}

// ─── Muhurta Scoring ─────────────────────────────────────────────────────────

/**
 * Calculate a Muhurta (electional astrology) score for a given moment.
 * Evaluates the five limbs of Panchanga and scores them.
 */
export function muhurtaScore(jd: number): MuhurtaResult {
  const planets = calcAllPlanets(jd, false)

  const sunLon = planets.Sun.longitude
  const moonLon = planets.Moon.longitude

  // ── Tithi ──
  let diff = moonLon - sunLon
  if (diff < 0) diff += 360
  const tithiNum = Math.floor(diff / 12) + 1 // 1 to 30

  // Good tithis: 2,3,5,7,10,11,13 (in both halves)
  const tithiInHalf = tithiNum <= 15 ? tithiNum : tithiNum - 15
  const goodTithis = new Set([2, 3, 5, 7, 10, 11, 13])
  const badTithis = new Set([4, 6, 8, 9, 14])
  let tithiScore: number
  if (goodTithis.has(tithiInHalf)) {
    tithiScore = 2
  } else if (badTithis.has(tithiInHalf)) {
    tithiScore = 0
  } else {
    tithiScore = 1
  }

  // ── Vara (weekday) ──
  const dayOfWeek = Math.floor(jd + 1.5) % 7
  // 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  const goodVaras = new Set([0, 2, 3, 4]) // Mon, Wed, Thu, Fri
  const varaScore = goodVaras.has(dayOfWeek) ? 2 : 1

  // ── Nakshatra ──
  const nakshatraIndex = Math.floor(moonLon / (360 / 27))
  const nakshatraName = NAKSHATRA_NAMES[nakshatraIndex] ?? 'Unknown'
  const nakshatraScore = GOOD_NAKSHATRAS.has(nakshatraName) ? 2 : 1

  // ── Yoga ──
  // Yoga = (Sun longitude + Moon longitude) / (360/27)
  const yogaLon = (sunLon + moonLon) % 360
  const yogaNum = Math.floor(yogaLon / (360 / 27)) + 1
  // Good yogas: Siddhi(21), Shiva(3), Siddha(22), Sadhya(23), Shubha(24)
  const goodYogas = new Set([3, 21, 22, 23, 24])
  // Bad yogas: Vishkambha(1), Atiganda(6), Shoola(9), Gandanta(10), Vyaghata(13), Vajra(14), Vyatipata(17), Parigha(19), Vaidhriti(27)
  const badYogas = new Set([1, 6, 9, 10, 13, 14, 17, 19, 27])
  let yogaScore: number
  if (goodYogas.has(yogaNum)) {
    yogaScore = 2
  } else if (badYogas.has(yogaNum)) {
    yogaScore = 0
  } else {
    yogaScore = 1
  }

  // ── Karana ──
  // Karana = half-tithi; 60 karanas in a month
  const karanaNum = Math.floor(diff / 6) + 1
  // Fixed karanas (bad): Shakuni(58), Chatushpada(59), Nagava(60), Kimstughna(1)
  const badKaranas = new Set([1, 58, 59, 60])
  // Good movable karanas: Bava, Balava, Kaulava, Taitila, Garija, Vanija, Vishti(bad)
  // Vishti (Bhadra) karanas occur at positions 8,15,22,29,36,43,50,57
  const vishtiKaranas = new Set([8, 15, 22, 29, 36, 43, 50, 57])
  let karanaScore: number
  if (badKaranas.has(karanaNum) || vishtiKaranas.has(karanaNum)) {
    karanaScore = 0
  } else {
    karanaScore = 2
  }

  // ── Total ──
  const totalScore = tithiScore + varaScore + nakshatraScore + yogaScore + karanaScore

  let overall: string
  if (totalScore >= 8) {
    overall = 'Excellent'
  } else if (totalScore >= 6) {
    overall = 'Good'
  } else if (totalScore >= 4) {
    overall = 'Average'
  } else if (totalScore >= 2) {
    overall = 'Below Average'
  } else {
    overall = 'Poor'
  }

  return {
    overall,
    tithiScore,
    varaScore,
    nakshatraScore,
    yogaScore,
    karanaScore,
    totalScore,
  }
}
