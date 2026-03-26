/**
 * Classical / Traditional Astrology Techniques
 *
 * Solar condition analysis, Arabic Parts (Lots), and Planetary Hours
 * based on Chaldean order and traditional rulership schemes.
 */

import type { Planet, Position, ZodiacSign, HouseCusps } from './engine'
import { longitudeToSign } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SolarCondition {
  oriental: boolean
  combustPlanets: Planet[]
  cazimiPlanets: Planet[]
  underBeamsPlanets: Planet[]
}

export interface ArabicPart {
  name: string
  longitude: number
  sign: ZodiacSign
  degree: number
  house: number
}

export interface PlanetaryHour {
  hourNumber: number
  ruler: Planet
  startTime: string
  endTime: string
  isDaytime: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize an angle to 0–360 range */
function norm(lon: number): number {
  return ((lon % 360) + 360) % 360
}

/** Angular separation between two longitudes (0–180) */
function angularSep(a: number, b: number): number {
  const diff = Math.abs(norm(a) - norm(b))
  return diff > 180 ? 360 - diff : diff
}

/** Determine which house a longitude falls in given house cusps (1-indexed) */
function getHouse(lon: number, cusps: number[]): number {
  for (let h = 1; h <= 12; h++) {
    const next = h === 12 ? 1 : h + 1
    let start = cusps[h],
      end = cusps[next]
    if (end < start) end += 360
    let test = lon
    if (test < start) test += 360
    if (test >= start && test < end) return h
  }
  return 1
}

/** Format a fractional hour (0–24) as HH:MM */
function formatTime(hours: number): string {
  const h = ((Math.floor(hours) % 24) + 24) % 24
  const m = Math.round((hours - Math.floor(hours)) * 60)
  return `${String(h).padStart(2, '0')}:${String(m >= 60 ? 59 : m).padStart(2, '0')}`
}

// ─── Inner planets for oriental check ────────────────────────────────────────

// Planets to check for combustion (exclude Sun and Moon)
const COMBUST_CANDIDATES: Planet[] = [
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

// ─── Solar Condition ─────────────────────────────────────────────────────────

export function solarCondition(
  sunPos: Position,
  planets: Record<Planet, Position>,
): SolarCondition {
  const sunLon = sunPos.longitude
  const combustPlanets: Planet[] = []
  const cazimiPlanets: Planet[] = []
  const underBeamsPlanets: Planet[] = []

  // Oriental check: simplified rule
  // Inner planets (Mercury, Venus) are oriental when their longitude > Sun longitude
  // Outer planets are oriental when their longitude < Sun longitude
  // We evaluate the Sun's own orientality relative to the overall pattern
  // Here we report whether the Sun itself is "oriental" (rising before meridian)
  // Simplified: Sun is oriental if it is in houses 12,11,10,9 (eastern half)
  // But since we only have positions, use: Sun longitude < 180 means oriental half of ecliptic
  // More traditionally: just report based on the Sun's longitude relative to the chart.
  // We'll set oriental = true if the Sun is in the eastern hemisphere (lon < 180).
  const oriental = sunPos.longitude < 180

  for (const planet of COMBUST_CANDIDATES) {
    const pos = planets[planet]
    if (!pos) continue

    const sep = angularSep(sunLon, pos.longitude)

    if (sep <= 17 / 60) {
      // Within 0°17' (17 arcminutes) = cazimi
      cazimiPlanets.push(planet)
    } else if (sep <= 8.5) {
      // Within 8°30' = combust
      combustPlanets.push(planet)
    } else if (sep <= 17) {
      // Within 17° but not combust = under the beams
      underBeamsPlanets.push(planet)
    }
  }

  return { oriental, combustPlanets, cazimiPlanets, underBeamsPlanets }
}

// ─── Arabic Parts ────────────────────────────────────────────────────────────

export function calcArabicParts(
  planets: Record<Planet, Position>,
  houses: HouseCusps,
): ArabicPart[] {
  const asc = houses.ascendant
  const sunLon = planets.Sun.longitude
  const moonLon = planets.Moon.longitude
  const venusLon = planets.Venus.longitude
  const marsLon = planets.Mars.longitude
  const mercuryLon = planets.Mercury.longitude
  const saturnLon = planets.Saturn.longitude

  // Day chart: Sun is above the horizon (houses 7-12 in whole-sign, but we check
  // if Sun's longitude is in the upper hemisphere using house position)
  // Sun in houses 7–12 means above the horizon (daytime chart)
  const sunHouse = planets.Sun.house
  const isDayChart = sunHouse >= 7 && sunHouse <= 12

  // For night charts, swap A and B in the formula ASC + A - B
  function calcPart(name: string, dayA: number, dayB: number): ArabicPart {
    const a = isDayChart ? dayA : dayB
    const b = isDayChart ? dayB : dayA
    const longitude = norm(asc + a - b)
    const signInfo = longitudeToSign(longitude)
    const house = getHouse(longitude, houses.cusps)
    return { name, longitude, sign: signInfo.sign, degree: signInfo.degree, house }
  }

  // Calculate Part of Fortune first (needed for parts 9 and 10)
  const fortuneLon = norm(asc + (isDayChart ? moonLon - sunLon : sunLon - moonLon))

  const parts: ArabicPart[] = []

  // 1. Part of Fortune: ASC + Moon - Sun
  parts.push(calcPart('Part of Fortune', moonLon, sunLon))

  // 2. Part of Spirit: ASC + Sun - Moon
  parts.push(calcPart('Part of Spirit', sunLon, moonLon))

  // 3. Part of Eros: ASC + Venus - Mars
  parts.push(calcPart('Part of Eros', venusLon, marsLon))

  // 4. Part of Marriage: ASC + Venus - Saturn
  parts.push(calcPart('Part of Marriage', venusLon, saturnLon))

  // 5. Part of Commerce: ASC + Mercury - Sun
  parts.push(calcPart('Part of Commerce', mercuryLon, sunLon))

  // 6. Part of Death: ASC + cusp[8] - Moon
  parts.push(calcPart('Part of Death', houses.cusps[8], moonLon))

  // 7. Part of Passion: ASC + Mars - Sun
  parts.push(calcPart('Part of Passion', marsLon, sunLon))

  // 8. Part of Inheritance: ASC + Moon - Saturn
  parts.push(calcPart('Part of Inheritance', moonLon, saturnLon))

  // 9. Part of Necessity: ASC + Fortune - Saturn
  parts.push(calcPart('Part of Necessity', fortuneLon, saturnLon))

  // 10. Part of Courage: ASC + Mars - Fortune
  parts.push(calcPart('Part of Courage', marsLon, fortuneLon))

  return parts
}

// ─── Planetary Hours ─────────────────────────────────────────────────────────

/** Chaldean order of planets */
const CHALDEAN_ORDER: Planet[] = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon']

/** Day ruler by day-of-week index (0 = Sunday) */
const WEEKDAY_RULERS: Planet[] = [
  'Sun', // Sunday
  'Moon', // Monday
  'Mars', // Tuesday
  'Mercury', // Wednesday
  'Jupiter', // Thursday
  'Venus', // Friday
  'Saturn', // Saturday
]

export function planetaryHours(jd: number, lat: number, lon: number): PlanetaryHour[] {
  // Convert JD to calendar date to determine day of year and weekday
  // JD to calendar (Meeus algorithm)
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

  // Day of year
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const daysInMonth = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let dayOfYear = day
  for (let m = 1; m < month; m++) dayOfYear += daysInMonth[m]

  // Day of week from JD: (floor(JD + 1.5)) % 7 => 0=Sun, 1=Mon, ...
  const weekday = Math.floor(jd + 1.5) % 7

  // Sun declination (approximate)
  const declRad = ((23.44 * Math.PI) / 180) * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81))
  const latRad = (lat * Math.PI) / 180

  // Approximate day length in hours
  // dayLength = 2 * (12/pi) * acos(-tan(lat) * tan(decl))
  const tanProduct = Math.tan(latRad) * Math.tan(declRad)
  let dayLengthHours: number
  if (tanProduct >= 1) {
    // Midnight sun
    dayLengthHours = 24
  } else if (tanProduct <= -1) {
    // Polar night
    dayLengthHours = 0
  } else {
    dayLengthHours = (24 / Math.PI) * Math.acos(-tanProduct)
  }

  // Solar noon in UTC hours
  const solarNoonUTC = 12 - lon / 15

  // Sunrise/sunset in UTC fractional hours
  const sunriseUTC = solarNoonUTC - dayLengthHours / 2
  const sunsetUTC = solarNoonUTC + dayLengthHours / 2
  const nightLengthHours = 24 - dayLengthHours
  // Daytime hour length and nighttime hour length
  const dayHourLen = dayLengthHours / 12
  const nightHourLen = nightLengthHours / 12

  // Find starting planet index in Chaldean order
  const dayRuler = WEEKDAY_RULERS[weekday]
  let chaldeanIdx = CHALDEAN_ORDER.indexOf(dayRuler)

  const hours: PlanetaryHour[] = []

  // 12 daytime hours
  for (let i = 0; i < 12; i++) {
    const startH = sunriseUTC + i * dayHourLen
    const endH = sunriseUTC + (i + 1) * dayHourLen
    hours.push({
      hourNumber: i + 1,
      ruler: CHALDEAN_ORDER[chaldeanIdx % 7],
      startTime: formatTime(startH),
      endTime: formatTime(endH),
      isDaytime: true,
    })
    chaldeanIdx++
  }

  // 12 nighttime hours
  for (let i = 0; i < 12; i++) {
    const startH = sunsetUTC + i * nightHourLen
    const endH = sunsetUTC + (i + 1) * nightHourLen
    hours.push({
      hourNumber: i + 13,
      ruler: CHALDEAN_ORDER[chaldeanIdx % 7],
      startTime: formatTime(startH),
      endTime: formatTime(endH),
      isDaytime: false,
    })
    chaldeanIdx++
  }

  return hours
}
