/**
 * Chart Wheel Constants — zodiac signs, planet glyphs, aspect colors, element colors.
 */

// ── Zodiac Signs ────────────────────────────────────────────────────────

export const ZODIAC_SIGNS = [
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
] as const

export type ZodiacSign = (typeof ZODIAC_SIGNS)[number]

export const SIGN_GLYPHS: Record<string, string> = {
  Aries: '\u2648',
  Taurus: '\u2649',
  Gemini: '\u264A',
  Cancer: '\u264B',
  Leo: '\u264C',
  Virgo: '\u264D',
  Libra: '\u264E',
  Scorpio: '\u264F',
  Sagittarius: '\u2650',
  Capricorn: '\u2651',
  Aquarius: '\u2652',
  Pisces: '\u2653',
}

export const SIGN_ELEMENT: Record<string, 'fire' | 'earth' | 'air' | 'water'> = {
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

export const ELEMENT_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  fire: { fill: 'rgba(255, 58, 92, 0.08)', stroke: 'rgba(255, 58, 92, 0.3)', text: '#ff3a5c' },
  earth: { fill: 'rgba(0, 255, 136, 0.06)', stroke: 'rgba(0, 255, 136, 0.25)', text: '#00ff88' },
  air: { fill: 'rgba(0, 212, 255, 0.06)', stroke: 'rgba(0, 212, 255, 0.25)', text: '#00d4ff' },
  water: { fill: 'rgba(139, 92, 246, 0.08)', stroke: 'rgba(139, 92, 246, 0.3)', text: '#8b5cf6' },
}

// ── Planet Glyphs ───────────────────────────────────────────────────────

export const PLANET_GLYPHS: Record<string, string> = {
  Sun: '\u2609',
  Moon: '\u263D',
  Mercury: '\u263F',
  Venus: '\u2640',
  Mars: '\u2642',
  Jupiter: '\u2643',
  Saturn: '\u2644',
  Uranus: '\u2645',
  Neptune: '\u2646',
  Pluto: '\u2647',
  NorthNode: '\u260A',
  SouthNode: '\u260B',
  Chiron: '\u26B7',
  Lilith: '\u26B8',
}

export const PLANET_COLORS: Record<string, string> = {
  Sun: '#ffd200',
  Moon: '#c4c4c4',
  Mercury: '#00d4ff',
  Venus: '#00ff88',
  Mars: '#ff3a5c',
  Jupiter: '#8b5cf6',
  Saturn: '#64748b',
  Uranus: '#00c4cc',
  Neptune: '#818cf8',
  Pluto: '#94a3b8',
  NorthNode: '#a78bfa',
  SouthNode: '#6b7280',
  Chiron: '#f472b6',
  Lilith: '#475569',
}

// ── Aspect Colors ───────────────────────────────────────────────────────

export const ASPECT_COLORS: Record<string, string> = {
  Conjunction: '#8b5cf6',
  Sextile: '#00d4ff',
  Square: '#ff3a5c',
  Trine: '#00ff88',
  Opposition: '#ff3a5c',
  Quincunx: '#ffd200',
  SemiSquare: '#f97316',
  Sesquiquadrate: '#f97316',
}

export const ASPECT_DASH: Record<string, string> = {
  Conjunction: '',
  Sextile: '4,3',
  Square: '',
  Trine: '',
  Opposition: '',
  Quincunx: '2,2',
  SemiSquare: '1,2',
  Sesquiquadrate: '1,2',
}

// ── Utility ─────────────────────────────────────────────────────────────

/** Convert ecliptic longitude to sign index (0-11) */
export function signIndex(longitude: number): number {
  return Math.floor((((longitude % 360) + 360) % 360) / 30)
}

/** Get sign name from longitude */
export function signFromLongitude(longitude: number): string {
  return ZODIAC_SIGNS[signIndex(longitude)]
}
