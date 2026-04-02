/**
 * POST /api/astrology/synastry — compute synastry aspects between two charts.
 * Calls the Brain's Swiss Ephemeris engine directly.
 */
import { waitForSchema } from '@solarc/db'

import { synastryAspects } from '../../../../server/services/engines/swiss-ephemeris/composite'
import {
  run,
  type SwissEphemerisInput,
} from '../../../../server/services/engines/swiss-ephemeris/engine'

export async function POST(req: Request) {
  try {
    await waitForSchema()
    const body = await req.json()
    const { chart1, chart2 } = body as {
      chart1: {
        birthYear: number
        birthMonth: number
        birthDay: number
        birthHour: number
        latitude: number
        longitude: number
        name?: string
      }
      chart2: {
        birthYear: number
        birthMonth: number
        birthDay: number
        birthHour: number
        latitude: number
        longitude: number
        name?: string
      }
    }

    if (!chart1 || !chart2) {
      return Response.json({ error: 'Missing chart1 and/or chart2 birth data' }, { status: 400 })
    }

    for (const [label, c] of [
      ['chart1', chart1],
      ['chart2', chart2],
    ] as const) {
      if (
        !c.birthYear ||
        !c.birthMonth ||
        !c.birthDay ||
        c.latitude == null ||
        c.longitude == null
      ) {
        return Response.json({ error: `Missing required fields in ${label}` }, { status: 400 })
      }
    }

    // Build both natal charts in parallel
    const [result1, result2] = await Promise.all([
      run({
        birthYear: chart1.birthYear,
        birthMonth: chart1.birthMonth,
        birthDay: chart1.birthDay,
        birthHour: chart1.birthHour ?? 12,
        latitude: chart1.latitude,
        longitude: chart1.longitude,
        houseSystem: 'P',
      } as SwissEphemerisInput),
      run({
        birthYear: chart2.birthYear,
        birthMonth: chart2.birthMonth,
        birthDay: chart2.birthDay,
        birthHour: chart2.birthHour ?? 12,
        latitude: chart2.latitude,
        longitude: chart2.longitude,
        houseSystem: 'P',
      } as SwissEphemerisInput),
    ])

    // Calculate inter-chart aspects
    const aspects = synastryAspects(result1.data, result2.data)

    return Response.json({
      chart1Summary: result1.summary,
      chart2Summary: result2.summary,
      aspects: aspects.map((a) => ({
        planet1: a.planet1,
        planet2: a.planet2,
        type: a.type,
        orb: a.orb,
        applying: a.applying,
        exact: a.exact,
      })),
    })
  } catch (err) {
    console.error('[Astrology/synastry] Computation failed:', err)
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Synastry computation failed. Please check your inputs.',
      },
      { status: 500 },
    )
  }
}
