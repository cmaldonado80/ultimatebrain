/**
 * Timeline Route — unified timeline of significant astrological events.
 *
 * POST /astrology/timeline
 */

import type { BrainClient } from '@solarc/brain-sdk'
import {
  annualProfections,
  firdaria,
  isAvailable,
  run as ephemerisRun,
  SIGN_NAMES,
  transitCalendar,
  zodiacalReleasing,
} from '@solarc/ephemeris'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HonoContext = any

const PERIOD_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '3m': 90,
  '1y': 365,
}

export const timelineRoute = {
  method: 'post' as const,
  path: '/astrology/timeline',
  handler: async (c: HonoContext, _brain: BrainClient): Promise<Response> => {
    try {
      const input = await c.req.json()

      if (
        input.birthYear == null ||
        input.birthMonth == null ||
        input.birthDay == null ||
        input.birthHour == null ||
        input.latitude == null ||
        input.longitude == null
      ) {
        return c.json({ error: 'Missing required birth data fields' }, 400)
      }

      if (!isAvailable()) {
        return c.json({ error: 'Swiss Ephemeris engine not available' }, 503)
      }

      const period = input.period ?? '30d'
      const days = PERIOD_DAYS[period] ?? 30

      // Compute natal chart
      const result = await ephemerisRun({
        birthYear: input.birthYear,
        birthMonth: input.birthMonth,
        birthDay: input.birthDay,
        birthHour: input.birthHour,
        latitude: input.latitude,
        longitude: input.longitude,
        timezone: input.timezone,
      })
      const chart = result.data

      // Transits
      const now = new Date()
      const startDate = now.toISOString().split('T')[0]!
      const endDate = new Date(now.getTime() + days * 86400000).toISOString().split('T')[0]!
      const transits = await transitCalendar(chart.planets, startDate, endDate)

      // Current profection
      const currentYear = now.getFullYear()
      const ascSign = SIGN_NAMES[Math.floor((chart.houses?.ascendant ?? 0) / 30)] ?? 'Aries'
      const profection = annualProfections(
        input.birthYear,
        currentYear,
        ascSign as Parameters<typeof annualProfections>[2],
      )

      // Time lords
      const isDayChart = chart.planets.Sun.house <= 6
      const firdariaResult = firdaria(isDayChart)
      const lotLon = chart.lots?.fortune?.longitude ?? chart.planets.Moon.longitude
      const lotSign = Math.floor(lotLon / 30)
      const zrResult = zodiacalReleasing(lotSign)

      // Build unified timeline events
      const events: Array<{
        date: string
        type: string
        title: string
        description: string
        significance: 'low' | 'medium' | 'high'
      }> = []

      const outerPlanets = ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']
      for (const t of transits) {
        const isOuter = outerPlanets.includes(t.transitPlanet)
        const isMajor = ['Conjunction', 'Opposition', 'Square', 'Trine'].includes(t.aspectType)
        if (isOuter || (isMajor && t.orb < 1)) {
          events.push({
            date: t.date,
            type: 'transit',
            title: `${t.transitPlanet} ${t.aspectType} ${t.natalPlanet}`,
            description: `Transit ${t.transitPlanet} forms ${t.aspectType} to natal ${t.natalPlanet} (orb ${t.orb.toFixed(1)}°)`,
            significance: isOuter && isMajor ? 'high' : 'medium',
          })
        }
      }

      events.sort((a, b) => a.date.localeCompare(b.date))

      return c.json({
        events: events.slice(0, 100),
        currentPeriod: {
          profection,
          firdaria: firdariaResult.slice(0, 3),
          zodiacalReleasing: zrResult.slice(0, 3),
        },
        period,
        computedAt: new Date().toISOString(),
      })
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Timeline computation failed' },
        500,
      )
    }
  },
}
