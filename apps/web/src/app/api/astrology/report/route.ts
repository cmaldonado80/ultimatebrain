/**
 * POST /api/astrology/report — generate a full natal report.
 * Calls the Brain's Swiss Ephemeris report generator directly.
 */
import { waitForSchema } from '@solarc/db'

import { generateNatalReport } from '../../../../server/services/engines/swiss-ephemeris/report-generator'

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

    const report = await generateNatalReport({
      birthYear,
      birthMonth,
      birthDay,
      birthHour: birthHour ?? 12,
      latitude,
      longitude,
      houseSystem: 'P',
      name,
    })

    return Response.json(report)
  } catch (err) {
    console.error('[Astrology/report] Report generation failed:', err)
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Report generation failed. Please check your inputs.',
      },
      { status: 500 },
    )
  }
}
