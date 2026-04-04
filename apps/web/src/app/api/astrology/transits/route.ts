/**
 * POST /api/astrology/transits — compute current transits against a natal chart.
 * Calls the Brain's Swiss Ephemeris engine directly.
 */
import { waitForSchema } from '@solarc/db'

import { logger } from '../../../../lib/logger'
import {
  calcAllPlanets,
  julianDay,
  run,
  type SwissEphemerisInput,
} from '../../../../server/services/engines/swiss-ephemeris/engine'

export async function POST(req: Request) {
  try {
    await waitForSchema()
    const body = await req.json()
    const { birthYear, birthMonth, birthDay, birthHour, latitude, longitude } = body as {
      birthYear: number
      birthMonth: number
      birthDay: number
      birthHour: number
      latitude: number
      longitude: number
    }

    if (!birthYear || !birthMonth || !birthDay || latitude == null || longitude == null) {
      return Response.json({ error: 'Missing required birth data fields' }, { status: 400 })
    }

    // 1. Compute natal chart
    const input: SwissEphemerisInput = {
      birthYear,
      birthMonth,
      birthDay,
      birthHour: birthHour ?? 12,
      latitude,
      longitude,
      houseSystem: 'P',
    }
    const natalResult = await run(input)
    const natalChart = natalResult.data

    // 2. Calculate current transit positions
    const now = new Date()
    const nowJd = julianDay(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
      now.getUTCDate(),
      now.getUTCHours() + now.getUTCMinutes() / 60,
    )
    const transitPositions = calcAllPlanets(nowJd, false)

    // 3. Calculate aspects between natal and transit positions
    // Build cross-chart aspects by comparing each transit planet to each natal planet
    const aspects: Array<{
      transitPlanet: string
      natalPlanet: string
      type: string
      orb: number
      applying: boolean
      exact: boolean
    }> = []

    const ASPECT_CONFIG: Record<string, { angle: number; orb: number }> = {
      Conjunction: { angle: 0, orb: 2 },
      Sextile: { angle: 60, orb: 1.5 },
      Square: { angle: 90, orb: 2 },
      Trine: { angle: 120, orb: 2 },
      Opposition: { angle: 180, orb: 2 },
      Quincunx: { angle: 150, orb: 1 },
    }

    for (const [tName, tPos] of Object.entries(transitPositions)) {
      for (const [nName, nPos] of Object.entries(natalChart.planets)) {
        const diff = Math.abs(tPos.longitude - nPos.longitude) % 360
        const angle = diff > 180 ? 360 - diff : diff

        for (const [aspectType, config] of Object.entries(ASPECT_CONFIG)) {
          const orbDeviation = Math.abs(angle - config.angle)
          if (orbDeviation <= config.orb) {
            // Determine applying/separating using speed
            const futureLon = tPos.longitude + tPos.speed / 24
            const futureAngle = (() => {
              const d = Math.abs(futureLon - nPos.longitude) % 360
              return d > 180 ? 360 - d : d
            })()
            const futureOrb = Math.abs(futureAngle - config.angle)
            const applying = futureOrb < orbDeviation

            aspects.push({
              transitPlanet: tName,
              natalPlanet: nName,
              type: aspectType,
              orb: parseFloat(orbDeviation.toFixed(2)),
              applying,
              exact: orbDeviation < 0.5,
            })
            break
          }
        }
      }
    }

    aspects.sort((a, b) => a.orb - b.orb)

    return Response.json({
      transitDate: now.toISOString(),
      transitPositions: Object.entries(transitPositions).map(([name, pos]) => ({
        name,
        sign: pos.sign,
        degree: pos.longitude,
        retrograde: pos.retrograde,
      })),
      aspects,
    })
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err : undefined },
      'astrology transit computation failed',
    )
    return Response.json(
      { error: 'Transit computation failed. Please check your inputs.' },
      { status: 500 },
    )
  }
}
