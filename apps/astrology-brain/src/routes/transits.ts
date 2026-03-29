/**
 * Transits Route — current and upcoming transits to natal chart.
 *
 * POST /astrology/transits
 */

import type { BrainClient } from '@solarc/brain-sdk'
import {
  annualProfections,
  isAvailable,
  lunarMansion,
  moonPhase,
  run as ephemerisRun,
  SIGN_NAMES,
  transitCalendar,
} from '@solarc/ephemeris'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HonoContext = any

export const transitsRoute = {
  method: 'post' as const,
  path: '/astrology/transits',
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

      // Transit calendar: startDate and endDate as ISO strings
      const now = new Date()
      const days = input.days ?? 30
      const startDate = input.startDate ?? now.toISOString().split('T')[0]!
      const endDate = new Date(now.getTime() + days * 86400000).toISOString().split('T')[0]!

      const transits = await transitCalendar(chart.planets, startDate, endDate)

      // Current moon
      const currentMoon = moonPhase(chart.planets.Sun.longitude, chart.planets.Moon.longitude)
      const mansion = lunarMansion(chart.planets.Moon.longitude)

      // Current profection
      const currentYear = now.getFullYear()
      const ascSign = SIGN_NAMES[Math.floor((chart.houses?.ascendant ?? 0) / 30)] ?? 'Aries'
      const profection = annualProfections(
        input.birthYear,
        currentYear,
        ascSign as Parameters<typeof annualProfections>[2],
      )

      return c.json({
        transits: transits.slice(0, 50),
        moonPhase: currentMoon,
        lunarMansion: { number: mansion.number, name: mansion.name, meaning: mansion.meaning },
        profection,
        period: { startDate, endDate, days },
        computedAt: new Date().toISOString(),
      })
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Transit computation failed' },
        500,
      )
    }
  },
}
