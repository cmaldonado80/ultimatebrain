/**
 * Natal Summary Route — computes a natal chart and returns structured data.
 *
 * POST /astrology/natal-summary
 *
 * This is the first real domain endpoint proving the three-tier architecture:
 * Development → Astrology Mini Brain (this) → Brain shared services
 *
 * The chart computation runs LOCALLY via @solarc/ephemeris.
 * Brain SDK is available for LLM interpretation or memory if needed.
 */

import type { BrainClient } from '@solarc/brain-sdk'
import { isAvailable, run as ephemerisRun } from '@solarc/ephemeris'

interface NatalSummaryInput {
  name?: string
  birthYear: number
  birthMonth: number
  birthDay: number
  birthHour: number
  latitude: number
  longitude: number
  timezone?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HonoContext = any

export const natalSummaryRoute = {
  method: 'post' as const,
  path: '/astrology/natal-summary',
  handler: async (c: HonoContext, _brain: BrainClient): Promise<Response> => {
    try {
      const input: NatalSummaryInput = await c.req.json()

      // Validate required fields
      if (
        input.birthYear == null ||
        input.birthMonth == null ||
        input.birthDay == null ||
        input.birthHour == null ||
        input.latitude == null ||
        input.longitude == null
      ) {
        return c.json(
          {
            error:
              'Missing required fields: birthYear, birthMonth, birthDay, birthHour, latitude, longitude',
          },
          400,
        )
      }

      // Check ephemeris availability
      if (!isAvailable()) {
        return c.json(
          { error: 'Swiss Ephemeris engine not available — swisseph native module not loaded' },
          503,
        )
      }

      // Compute chart locally (domain engine — no Brain call needed)
      const result = await ephemerisRun({
        birthYear: input.birthYear,
        birthMonth: input.birthMonth,
        birthDay: input.birthDay,
        birthHour: input.birthHour,
        latitude: input.latitude,
        longitude: input.longitude,
        timezone: input.timezone,
      })

      // Extract key placements for a concise summary
      const chart = result.data
      const sunSign = chart.planets.find((p) => p.name === 'Sun')?.sign
      const moonSign = chart.planets.find((p) => p.name === 'Moon')?.sign
      const ascendant = chart.houseCusps?.ascendant

      return c.json({
        name: input.name ?? 'Chart',
        chart: {
          planets: chart.planets,
          aspects: chart.aspects,
          houseCusps: chart.houseCusps,
          dignities: chart.dignities,
        },
        highlights: {
          sunSign,
          moonSign,
          ascendantDegree: ascendant,
        },
        summary: result.summary,
        engine: 'swiss-ephemeris',
        computedAt: new Date().toISOString(),
      })
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Chart computation failed' }, 500)
    }
  },
}
