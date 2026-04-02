/**
 * Vedic / Jyotish Astrology Calculations
 *
 * Panchanga (five limbs of time) and Vimshottari Dasha system.
 */

import type { Planet } from './engine'
import { calcAllPlanets } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PanchangaResult {
  tithi: { number: number; name: string; lord: Planet }
  vara: { name: string; lord: Planet }
  nakshatra: { number: number; name: string; lord: Planet; pada: number }
  yoga: { number: number; name: string }
  karana: { number: number; name: string }
}

export interface DashaPeriod {
  planet: Planet
  level: 'maha' | 'bhukti' | 'antara'
  startDate: string
  endDate: string
  years: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TITHI_NAMES: string[] = [
  'Pratipada',
  'Dwitiya',
  'Tritiya',
  'Chaturthi',
  'Panchami',
  'Shashthi',
  'Saptami',
  'Ashtami',
  'Navami',
  'Dashami',
  'Ekadashi',
  'Dwadashi',
  'Trayodashi',
  'Chaturdashi',
  'Purnima',
  'Pratipada',
  'Dwitiya',
  'Tritiya',
  'Chaturthi',
  'Panchami',
  'Shashthi',
  'Saptami',
  'Ashtami',
  'Navami',
  'Dashami',
  'Ekadashi',
  'Dwadashi',
  'Trayodashi',
  'Chaturdashi',
  'Amavasya',
]

const TITHI_LORDS: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']

const VARA_NAMES: string[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

const VARA_LORDS: Planet[] = ['Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Sun']

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

/** Vimshottari nakshatra lords: Ketu, Venus, Sun, Moon, Mars, Rahu, Jupiter, Saturn, Mercury (x3) */
const NAKSHATRA_LORDS: Planet[] = [
  'SouthNode',
  'Venus',
  'Sun',
  'Moon',
  'Mars',
  'NorthNode',
  'Jupiter',
  'Saturn',
  'Mercury',
  'SouthNode',
  'Venus',
  'Sun',
  'Moon',
  'Mars',
  'NorthNode',
  'Jupiter',
  'Saturn',
  'Mercury',
  'SouthNode',
  'Venus',
  'Sun',
  'Moon',
  'Mars',
  'NorthNode',
  'Jupiter',
  'Saturn',
  'Mercury',
]

const YOGA_NAMES: string[] = [
  'Vishkambha',
  'Priti',
  'Ayushman',
  'Saubhagya',
  'Shobhana',
  'Atiganda',
  'Sukarma',
  'Dhriti',
  'Shula',
  'Ganda',
  'Vriddhi',
  'Dhruva',
  'Vyaghata',
  'Harshana',
  'Vajra',
  'Siddhi',
  'Vyatipata',
  'Variyana',
  'Parigha',
  'Shiva',
  'Siddha',
  'Sadhya',
  'Shubha',
  'Shukla',
  'Brahma',
  'Indra',
  'Vaidhriti',
]

/** 7 repeating karanas + 4 fixed karanas */
const REPEATING_KARANAS: string[] = [
  'Bava',
  'Balava',
  'Kaulava',
  'Taitila',
  'Garaja',
  'Vanija',
  'Vishti',
]

const FIXED_KARANAS: string[] = ['Shakuni', 'Chatushpada', 'Naga', 'Kimstughna']

/** Dasha sequence with period lengths in years */
const DASHA_SEQUENCE: { planet: Planet; years: number }[] = [
  { planet: 'SouthNode', years: 7 }, // Ketu
  { planet: 'Venus', years: 20 },
  { planet: 'Sun', years: 6 },
  { planet: 'Moon', years: 10 },
  { planet: 'Mars', years: 7 },
  { planet: 'NorthNode', years: 18 }, // Rahu
  { planet: 'Jupiter', years: 16 },
  { planet: 'Saturn', years: 19 },
  { planet: 'Mercury', years: 17 },
]

const TOTAL_DASHA_YEARS = 120

const NAKSHATRA_SPAN = 360 / 27 // 13.333...

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert Julian Day to an ISO date string (YYYY-MM-DD) */
function jdToISODate(jd: number): string {
  // Meeus algorithm (inverse of Julian Day)
  const z = Math.floor(jd + 0.5)
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

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

/** Get karana name from its 1-based number (1-60 cycle) */
function karanaName(num: number): string {
  // Karana 1 is Kimstughna (fixed), karanas 2-57 cycle through 7 repeating,
  // karanas 58-60 are the remaining fixed karanas.
  // However, the traditional mapping is:
  // Karana 1 = Kimstughna (fixed)
  // Karanas 2-8 = Bava..Vishti, 9-15 = Bava..Vishti, ... up to karana 57
  // Karana 58 = Shakuni, 59 = Chatushpada, 60 = Naga
  if (num === 1) return FIXED_KARANAS[3] // Kimstughna
  if (num >= 58) return FIXED_KARANAS[num - 58]
  // Karanas 2-57: cycling through the 7 repeating karanas
  return REPEATING_KARANAS[(num - 2) % 7]
}

// ─── Panchanga ───────────────────────────────────────────────────────────────

export function panchanga(jd: number): PanchangaResult {
  // Get Sun and Moon longitudes
  const positions = calcAllPlanets(jd)
  const sunLon = positions.Sun.longitude
  const moonLon = positions.Moon.longitude

  // Tithi (lunar day, 1-30)
  const tithiAngle = (moonLon - sunLon + 360) % 360
  const tithiNumber = Math.floor(tithiAngle / 12) + 1
  const tithiName = TITHI_NAMES[tithiNumber - 1]
  const tithiLord = TITHI_LORDS[(tithiNumber - 1) % 7]

  // Vara (weekday)
  const varaIndex = Math.floor(jd + 1.5) % 7
  const varaName = VARA_NAMES[varaIndex]
  const varaLord = VARA_LORDS[varaIndex]

  // Nakshatra (lunar mansion) — clamp to 0-26 in case moonLon is exactly 360
  const nakshatraIndex = Math.min(Math.floor(moonLon / NAKSHATRA_SPAN), 26)
  const nakshatraNumber = nakshatraIndex + 1
  const nakshatraName = NAKSHATRA_NAMES[nakshatraIndex]
  const nakshatraLord = NAKSHATRA_LORDS[nakshatraIndex]
  const positionInNakshatra = moonLon % NAKSHATRA_SPAN
  const pada = Math.floor(positionInNakshatra / (NAKSHATRA_SPAN / 4)) + 1

  // Yoga (Sun + Moon combination)
  const yogaRaw = (sunLon + moonLon) % 360
  const yogaIndex = Math.min(Math.floor(yogaRaw / NAKSHATRA_SPAN), 26)
  const yogaNumber = yogaIndex + 1
  const yogaName = YOGA_NAMES[yogaIndex]

  // Karana (half of a tithi)
  const karanaRaw = Math.floor(tithiAngle / 6) + 1
  const karanaNumber = karanaRaw
  const karName = karanaName(karanaNumber)

  return {
    tithi: { number: tithiNumber, name: tithiName, lord: tithiLord },
    vara: { name: varaName, lord: varaLord },
    nakshatra: { number: nakshatraNumber, name: nakshatraName, lord: nakshatraLord, pada },
    yoga: { number: yogaNumber, name: yogaName },
    karana: { number: karanaNumber, name: karName },
  }
}

// ─── Vimshottari Dasha ───────────────────────────────────────────────────────

export function vimshottariDasha(moonLon: number, birthJd: number): DashaPeriod[] {
  const periods: DashaPeriod[] = []

  // Determine birth nakshatra — clamp to 0-26
  const nakshatraIndex = Math.min(Math.floor(moonLon / NAKSHATRA_SPAN), 26)
  const nakshatraLord = NAKSHATRA_LORDS[nakshatraIndex]

  // Find starting position in dasha sequence
  let startIndex = DASHA_SEQUENCE.findIndex((d) => d.planet === nakshatraLord)
  if (startIndex === -1) startIndex = 0

  // Calculate balance of first dasha period
  const positionInNakshatra = moonLon % NAKSHATRA_SPAN
  const fractionElapsed = positionInNakshatra / NAKSHATRA_SPAN
  const firstDashaYears = DASHA_SEQUENCE[startIndex].years
  const remainingYears = (1 - fractionElapsed) * firstDashaYears

  // Generate all 9 Maha Dasha periods (covering 120 years)
  let currentJd = birthJd

  for (let i = 0; i < 9; i++) {
    const seqIndex = (startIndex + i) % 9
    const mahaEntry = DASHA_SEQUENCE[seqIndex]
    const mahaYears = i === 0 ? remainingYears : mahaEntry.years
    const mahaEndJd = currentJd + mahaYears * 365.25

    const mahaPeriod: DashaPeriod = {
      planet: mahaEntry.planet,
      level: 'maha',
      startDate: jdToISODate(currentJd),
      endDate: jdToISODate(mahaEndJd),
      years: parseFloat(mahaYears.toFixed(4)),
    }
    periods.push(mahaPeriod)

    // Generate Bhukti (sub-periods) within this Maha Dasha
    let bhuktiJd = currentJd

    for (let b = 0; b < 9; b++) {
      const bhuktiSeqIndex = (seqIndex + b) % 9
      const bhuktiEntry = DASHA_SEQUENCE[bhuktiSeqIndex]
      const bhuktiYears = (mahaYears * bhuktiEntry.years) / TOTAL_DASHA_YEARS
      const bhuktiEndJd = bhuktiJd + bhuktiYears * 365.25

      const bhuktiPeriod: DashaPeriod = {
        planet: bhuktiEntry.planet,
        level: 'bhukti',
        startDate: jdToISODate(bhuktiJd),
        endDate: jdToISODate(bhuktiEndJd),
        years: parseFloat(bhuktiYears.toFixed(4)),
      }
      periods.push(bhuktiPeriod)

      // Generate Antara (sub-sub-periods) within this Bhukti
      let antaraJd = bhuktiJd

      for (let a = 0; a < 9; a++) {
        const antaraSeqIndex = (bhuktiSeqIndex + a) % 9
        const antaraEntry = DASHA_SEQUENCE[antaraSeqIndex]
        const antaraYears = (bhuktiYears * antaraEntry.years) / TOTAL_DASHA_YEARS
        const antaraEndJd = antaraJd + antaraYears * 365.25

        const antaraPeriod: DashaPeriod = {
          planet: antaraEntry.planet,
          level: 'antara',
          startDate: jdToISODate(antaraJd),
          endDate: jdToISODate(antaraEndJd),
          years: parseFloat(antaraYears.toFixed(4)),
        }
        periods.push(antaraPeriod)

        antaraJd = antaraEndJd
      }

      bhuktiJd = bhuktiEndJd
    }

    currentJd = mahaEndJd
  }

  return periods
}
