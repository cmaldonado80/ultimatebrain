/**
 * Synastry Route — relationship astrology with compatibility scoring.
 *
 * POST /astrology/synastry
 *
 * Computes synastry aspects and composite chart between two natal charts.
 * Optionally generates LLM narrative for compatibility interpretation.
 */

import type { BrainClient } from '@solarc/brain-sdk'
import {
  compositeChart,
  isAvailable,
  run as ephemerisRun,
  synastryAspects,
} from '@solarc/ephemeris'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HonoContext = any

interface BirthData {
  name?: string
  birthYear: number
  birthMonth: number
  birthDay: number
  birthHour: number
  latitude: number
  longitude: number
  timezone?: number
}

function validateBirthData(d: BirthData): string | null {
  if (
    d.birthYear == null ||
    d.birthMonth == null ||
    d.birthDay == null ||
    d.birthHour == null ||
    d.latitude == null ||
    d.longitude == null
  ) {
    return 'Missing required birth data fields'
  }
  return null
}

export const synastryRoute = {
  method: 'post' as const,
  path: '/astrology/synastry',
  handler: async (c: HonoContext, brain: BrainClient): Promise<Response> => {
    try {
      const input = await c.req.json()
      const { personA, personB } = input as { personA: BirthData; personB: BirthData }

      if (!personA || !personB) {
        return c.json({ error: 'Both personA and personB birth data required' }, 400)
      }

      const errA = validateBirthData(personA)
      if (errA) return c.json({ error: `personA: ${errA}` }, 400)
      const errB = validateBirthData(personB)
      if (errB) return c.json({ error: `personB: ${errB}` }, 400)

      if (!isAvailable()) {
        return c.json({ error: 'Swiss Ephemeris engine not available' }, 503)
      }

      // Compute both charts
      const [resultA, resultB] = await Promise.all([
        ephemerisRun({
          birthYear: personA.birthYear,
          birthMonth: personA.birthMonth,
          birthDay: personA.birthDay,
          birthHour: personA.birthHour,
          latitude: personA.latitude,
          longitude: personA.longitude,
          timezone: personA.timezone,
        }),
        ephemerisRun({
          birthYear: personB.birthYear,
          birthMonth: personB.birthMonth,
          birthDay: personB.birthDay,
          birthHour: personB.birthHour,
          latitude: personB.latitude,
          longitude: personB.longitude,
          timezone: personB.timezone,
        }),
      ])

      const chartA = resultA.data
      const chartB = resultB.data

      // Synastry aspects
      const aspects = synastryAspects(chartA, chartB)

      // Composite chart
      const composite = compositeChart(chartA, chartB)

      // Compatibility score (heuristic based on aspect quality)
      let score = 50
      for (const a of aspects) {
        const weight = a.orb < 2 ? 3 : a.orb < 5 ? 2 : 1
        if (a.type === 'Conjunction' || a.type === 'Trine' || a.type === 'Sextile') {
          score += weight
        } else if (a.type === 'Square' || a.type === 'Opposition') {
          score -= weight * 0.5
        }
      }
      score = Math.max(0, Math.min(100, Math.round(score)))

      // Optional LLM narrative
      let narrative: string | undefined
      if (input.narrative && brain) {
        try {
          const topAspects = aspects
            .slice(0, 8)
            .map((a) => `${a.planet1} ${a.type} ${a.planet2} (${a.orb.toFixed(1)}°)`)
            .join(', ')

          const prompt = `You are an expert relationship astrologer. Provide a warm, insightful compatibility reading based on this synastry data.

Person A: ${resultA.summary}
Person B: ${resultB.summary}
Key synastry aspects: ${topAspects}
Compatibility score: ${score}/100

Write 3-4 paragraphs covering emotional connection, communication style, and growth potential.`

          const llmResponse = await brain.llm.chat({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            maxTokens: 800,
          })
          narrative = llmResponse?.content ?? undefined
        } catch {
          // LLM narrative is non-blocking
        }
      }

      return c.json({
        personA: { name: personA.name ?? 'Person A', summary: resultA.summary },
        personB: { name: personB.name ?? 'Person B', summary: resultB.summary },
        synastryAspects: aspects.slice(0, 20).map((a) => ({
          planet1: a.planet1,
          planet2: a.planet2,
          type: a.type,
          orb: Math.round(a.orb * 100) / 100,
        })),
        compositeHighlights: {
          sunSign: composite.planets.Sun?.sign ?? null,
          moonSign: composite.planets.Moon?.sign ?? null,
          ascendantSign: composite.houses
            ? (() => {
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
                return signs[Math.floor(composite.houses.ascendant / 30)] ?? null
              })()
            : null,
        },
        compatibilityScore: score,
        narrative,
        computedAt: new Date().toISOString(),
      })
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Synastry computation failed' },
        500,
      )
    }
  },
}
