/**
 * POST /api/astrology/chart — compute natal chart summary.
 * Calls the Brain's Swiss Ephemeris engine directly.
 */
import { waitForSchema } from '@solarc/db'

import { run } from '../../../../server/services/engines/swiss-ephemeris/engine'

function longitudeToSign(longitude: number): string {
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
  return signs[Math.floor(longitude / 30) % 12]
}

export async function POST(req: Request) {
  try {
    await waitForSchema()
    const body = await req.json()
    const { birthYear, birthMonth, birthDay, birthHour, latitude, longitude, name } = body as {
      birthYear: number
      birthMonth: number
      birthDay: number
      birthHour: number
      latitude: number
      longitude: number
      name?: string
    }

    if (!birthYear || !birthMonth || !birthDay || latitude == null || longitude == null) {
      return Response.json({ error: 'Missing required birth data fields' }, { status: 400 })
    }

    const result = await run({
      birthYear,
      birthMonth,
      birthDay,
      birthHour: birthHour ?? 12,
      latitude,
      longitude,
      houseSystem: 'P',
    })

    const chart = result.data
    const sun = chart.planets.Sun
    const moon = chart.planets.Moon
    const ascDeg = chart.houses?.ascendant

    return Response.json({
      name: name ?? 'Chart',
      sun: sun ? { sign: sun.sign, degree: sun.longitude } : null,
      moon: moon ? { sign: moon.sign, degree: moon.longitude } : null,
      ascendant: ascDeg != null ? { sign: longitudeToSign(ascDeg), degree: ascDeg } : null,
      planets: Object.entries(chart.planets).map(([pName, pos]) => ({
        name: pName,
        sign: pos.sign,
        degree: pos.longitude,
        retrograde: pos.retrograde,
        house: pos.house,
      })),
      houses: chart.houses?.cusps ?? [],
      aspects: chart.aspects.map((a) => ({
        planet1: a.planet1,
        planet2: a.planet2,
        type: a.type,
        orb: a.orb,
        applying: a.applying,
      })),
    })
  } catch (err) {
    console.error('[Astrology/chart] Computation failed:', err)
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Chart computation failed. Please check your inputs.',
      },
      { status: 500 },
    )
  }
}
