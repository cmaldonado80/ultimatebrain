/**
 * POST /api/astrology/timeline — generate a transit calendar for a date range.
 * Calls the Brain's Swiss Ephemeris engine directly.
 */
import { waitForSchema } from '@solarc/db'

import { logger } from '../../../../lib/logger'
import {
  run,
  type SwissEphemerisInput,
} from '../../../../server/services/engines/swiss-ephemeris/engine'
import { transitCalendar } from '../../../../server/services/engines/swiss-ephemeris/predictive'

export async function POST(req: Request) {
  try {
    await waitForSchema()
    const body = await req.json()
    const { birthYear, birthMonth, birthDay, birthHour, latitude, longitude, startDate, endDate } =
      body as {
        birthYear: number
        birthMonth: number
        birthDay: number
        birthHour: number
        latitude: number
        longitude: number
        startDate: string
        endDate: string
      }

    if (!birthYear || !birthMonth || !birthDay || latitude == null || longitude == null) {
      return Response.json({ error: 'Missing required birth data fields' }, { status: 400 })
    }

    if (!startDate || !endDate) {
      return Response.json(
        { error: 'Missing startDate and/or endDate (YYYY-MM-DD format)' },
        { status: 400 },
      )
    }

    // Build the natal chart
    const result = await run({
      birthYear,
      birthMonth,
      birthDay,
      birthHour: birthHour ?? 12,
      latitude,
      longitude,
      houseSystem: 'P',
    } as SwissEphemerisInput)

    // Generate the transit calendar over the requested date range
    const events = await transitCalendar(result.data.planets, startDate, endDate)

    return Response.json({
      startDate,
      endDate,
      totalEvents: events.length,
      events,
    })
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'timeline computation failed')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
