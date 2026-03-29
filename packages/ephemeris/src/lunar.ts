/**
 * Lunar Calculations
 *
 * Moon phase, lunar mansions, and prenatal lunation computations.
 */

import type { Planet, ZodiacSign } from './engine'
import { calcPlanet, longitudeToSign, SEFLG_SPEED } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MoonPhaseResult {
  phaseName: string
  angle: number
  illumination: number
  waxing: boolean
}

export interface LunarMansion {
  number: number
  name: string
  meaning: string
}

export interface PrenatalLunation {
  type: 'newMoon' | 'fullMoon'
  jd: number
  date: string
  moonLongitude: number
  sign: ZodiacSign
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PHASE_NAMES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent',
] as const

const MANSION_DATA: { name: string; meaning: string }[] = [
  { name: 'Al Sharatain', meaning: 'The Two Signs — beginnings and courage' },
  { name: 'Al Butain', meaning: 'The Little Belly — finding lost things, reconciliation' },
  { name: 'Al Thurayya', meaning: 'The Many Little Ones — abundance and blessings' },
  { name: 'Al Dabaran', meaning: 'The Follower — conflict, pursuit, enmity' },
  { name: "Al Haq'ah", meaning: 'The Brand — health, wisdom, good fortune' },
  { name: "Al Han'ah", meaning: 'The Mark — favor, love, healing' },
  { name: 'Al Dhira', meaning: 'The Forearm — commerce, harvest, gain' },
  { name: 'Al Nathrah', meaning: 'The Gap — love, friendship, travel' },
  { name: 'Al Tarf', meaning: 'The Glance — protection and deflection of harm' },
  { name: 'Al Jabhah', meaning: 'The Forehead — victory, strength, leadership' },
  { name: 'Al Zubrah', meaning: 'The Mane — fear, retreat, caution' },
  { name: 'Al Sarfah', meaning: 'The Changer — change of conditions, harvest' },
  { name: 'Al Awwa', meaning: 'The Barker — gain, commerce, harvest' },
  { name: 'Al Simak', meaning: 'The Unarmed — love, healing, friendship' },
  { name: 'Al Ghafr', meaning: 'The Cover — hidden matters, digging, secrets' },
  { name: 'Al Zubana', meaning: 'The Claws — commerce, ransom, liberation' },
  { name: 'Al Iklil', meaning: 'The Crown — building, planting, establishment' },
  { name: 'Al Qalb', meaning: 'The Heart — authority, power, advancement' },
  { name: 'Al Shaulah', meaning: 'The Sting — discord, war, sedition' },
  { name: "Al Na'am", meaning: 'The Ostriches — taming animals, healing, bonds' },
  { name: 'Al Baldah', meaning: 'The City — harvest, building, protection' },
  { name: "Sa'd al Dhabih", meaning: 'Luck of the Slaughterer — flight, escape, healing' },
  { name: "Sa'd Bula", meaning: 'Luck of the Swallower — healing, alchemy, building' },
  { name: "Sa'd al Su'ud", meaning: 'Luck of Lucks — marriage, freedom, good fortune' },
  { name: "Sa'd al Akhbiyah", meaning: 'Luck of the Tents — vengeance, siege, destruction' },
  { name: 'Al Fargh al Awwal', meaning: 'The First Spout — union, love, profit' },
  { name: 'Al Fargh al Thani', meaning: 'The Second Spout — increase, gain, building' },
  { name: 'Batn al Hut', meaning: 'The Belly of the Fish — commerce, harvest, marriage' },
]

/** Mean synodic period of the Moon in days */
const SYNODIC_MONTH = 29.530588853

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert Julian Day to date string (Meeus inverse algorithm).
 */
function jdToDateStr(jd: number): string {
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

/**
 * Get Sun and Moon longitudes at a given Julian Day.
 */
function sunMoonAt(jd: number): { sunLon: number; moonLon: number } {
  const sun = calcPlanet(jd, 'Sun' as Planet, SEFLG_SPEED)
  const moon = calcPlanet(jd, 'Moon' as Planet, SEFLG_SPEED)
  return { sunLon: sun.longitude, moonLon: moon.longitude }
}

/**
 * Normalise an angle to 0-360.
 */
function norm360(a: number): number {
  return ((a % 360) + 360) % 360
}

// ─── Moon Phase ──────────────────────────────────────────────────────────────

/**
 * Calculate moon phase from Sun and Moon longitudes.
 */
export function moonPhase(sunLon: number, moonLon: number): MoonPhaseResult {
  const angle = norm360(moonLon - sunLon)
  const phaseIndex = Math.floor(angle / 45) % 8
  const phaseName = PHASE_NAMES[phaseIndex]
  const illumination = ((1 - Math.cos((angle * Math.PI) / 180)) / 2) * 100
  const waxing = angle < 180

  return {
    phaseName,
    angle: parseFloat(angle.toFixed(4)),
    illumination: parseFloat(illumination.toFixed(2)),
    waxing,
  }
}

// ─── Lunar Mansions ──────────────────────────────────────────────────────────

/**
 * Calculate which of the 28 lunar mansions the Moon occupies.
 * Each mansion spans 360/28 = 12.857142...degrees.
 */
export function lunarMansion(moonLon: number): LunarMansion {
  const normalized = norm360(moonLon)
  const mansionSize = 360 / 28
  const index = Math.floor(normalized / mansionSize)
  const clamped = Math.min(index, 27)
  const data = MANSION_DATA[clamped]

  return {
    number: clamped + 1,
    name: data.name,
    meaning: data.meaning,
  }
}

// ─── Prenatal Lunations ──────────────────────────────────────────────────────

/**
 * Binary search for the Julian Day where the Sun-Moon elongation matches a target.
 * target = 0 for new moon, 180 for full moon.
 */
function findLunation(startJd: number, target: number): number {
  let lo = startJd - SYNODIC_MONTH
  let hi = startJd

  // Initial step-back: find a window where the elongation crosses the target.
  // Step back in 1-day increments to find the rough window.
  const elongation = (jd: number): number => {
    const { sunLon, moonLon } = sunMoonAt(jd)
    return norm360(moonLon - sunLon)
  }

  // We want the most recent JD < startJd where elongation is near target.
  // Step back day-by-day from startJd to find when elongation crossed the target.
  let prevElong = elongation(hi)
  let found = false

  for (let jd = startJd - 0.5; jd >= startJd - SYNODIC_MONTH - 1; jd -= 0.5) {
    const elong = elongation(jd)
    // Detect crossing: for new moon (target=0), elongation wraps from ~360 back to ~0.
    // For full moon (target=180), elongation crosses 180.
    if (target === 0) {
      // New moon: look for wrap-around (prevElong small, elong large) going backward
      if (elong > 300 && prevElong < 60) {
        lo = jd
        hi = jd + 0.5
        found = true
        break
      }
    } else {
      // Full moon: look for crossing 180 going backward
      if (elong > 180 && prevElong < 180) {
        lo = jd
        hi = jd + 0.5
        found = true
        break
      }
      if (elong < 180 && prevElong > 180) {
        lo = jd
        hi = jd + 0.5
        found = true
        break
      }
    }
    prevElong = elong
  }

  if (!found) {
    // Fallback: just use the rough window
    lo = startJd - SYNODIC_MONTH
    hi = startJd
  }

  // Binary search to refine
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    const elong = elongation(mid)

    if (target === 0) {
      // New moon: elongation near 0 (or 360). We want the point where it's closest to 0.
      const diff = elong < 180 ? elong : 360 - elong
      if (diff < 0.5) {
        // Close enough, but refine direction
        // Check if we should go lower or higher
        const elongLo = elongation(lo)
        const diffLo = elongLo < 180 ? elongLo : 360 - elongLo
        if (diffLo < diff) {
          hi = mid
        } else {
          lo = mid
        }
      } else if (elong > 180) {
        // Moon hasn't caught up to sun yet (going backward means we're before new moon)
        hi = mid
      } else {
        lo = mid
      }
    } else {
      // Full moon: elongation near 180
      const diff = Math.abs(elong - 180)
      if (diff < 0.5) {
        const elongLo = elongation(lo)
        const diffLo = Math.abs(elongLo - 180)
        if (diffLo < diff) {
          hi = mid
        } else {
          lo = mid
        }
      } else if (elong < 180) {
        hi = mid
      } else {
        lo = mid
      }
    }

    if (Math.abs(hi - lo) < 0.00001) break
  }

  return (lo + hi) / 2
}

/**
 * Find the prenatal new moon and full moon before a birth Julian Day.
 */
export function prenatalLunations(birthJd: number): {
  newMoon: PrenatalLunation
  fullMoon: PrenatalLunation
} {
  const nmJd = findLunation(birthJd, 0)
  const { moonLon: nmMoonLon } = sunMoonAt(nmJd)
  const nmSign = longitudeToSign(nmMoonLon)

  const fmJd = findLunation(birthJd, 180)
  const { moonLon: fmMoonLon } = sunMoonAt(fmJd)
  const fmSign = longitudeToSign(fmMoonLon)

  return {
    newMoon: {
      type: 'newMoon',
      jd: parseFloat(nmJd.toFixed(5)),
      date: jdToDateStr(nmJd),
      moonLongitude: parseFloat(nmMoonLon.toFixed(4)),
      sign: nmSign.sign,
    },
    fullMoon: {
      type: 'fullMoon',
      jd: parseFloat(fmJd.toFixed(5)),
      date: jdToDateStr(fmJd),
      moonLongitude: parseFloat(fmMoonLon.toFixed(4)),
      sign: fmSign.sign,
    },
  }
}
