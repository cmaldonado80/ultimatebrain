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
import { isAvailable, run as ephemerisRun, SIGN_NAMES } from '@solarc/ephemeris'

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

      // Extract key placements (planets is Record<Planet, Position>)
      const chart = result.data
      const sunSign = chart.planets['Sun']?.sign ?? null
      const moonSign = chart.planets['Moon']?.sign ?? null
      const ascendantDegree = chart.houses?.ascendant ?? null
      const ascendantSign =
        ascendantDegree != null ? (SIGN_NAMES[Math.floor(ascendantDegree / 30)] ?? null) : null

      // Normalize response for Development apps (stable contract)
      return c.json({
        name: input.name ?? 'Chart',
        highlights: {
          sunSign,
          moonSign,
          ascendantSign,
          ascendantDegree,
        },
        planets: Object.entries(chart.planets).map(([name, pos]) => ({
          name,
          sign: (pos as { sign: string }).sign,
          degree: (pos as { degree: number }).degree,
          minutes: (pos as { minutes: number }).minutes,
          retrograde: (pos as { retrograde: boolean }).retrograde,
          house: (pos as { house: number }).house,
        })),
        aspects: chart.aspects.slice(0, 12).map((a) => ({
          planet1: a.planet1,
          planet2: a.planet2,
          type: a.type,
          orb: Math.round(a.orb * 100) / 100,
        })),
        summary: result.summary,
        computedAt: new Date().toISOString(),
      })
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Chart computation failed' }, 500)
    }
  },
}
