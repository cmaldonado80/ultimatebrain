/**
 * Report Route — generates comprehensive natal reports.
 *
 * POST /astrology/report
 *
 * Uses generateNatalReport() which orchestrates 15+ ephemeris modules
 * into a structured report with readable sections.
 * Optionally calls Brain LLM for narrative interpretation.
 */

import type { BrainClient } from '@solarc/brain-sdk'
import { generateNatalReport, isAvailable } from '@solarc/ephemeris'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HonoContext = any

export const reportRoute = {
  method: 'post' as const,
  path: '/astrology/report',
  handler: async (c: HonoContext, brain: BrainClient): Promise<Response> => {
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

      const report = await generateNatalReport({
        birthYear: input.birthYear,
        birthMonth: input.birthMonth,
        birthDay: input.birthDay,
        birthHour: input.birthHour,
        latitude: input.latitude,
        longitude: input.longitude,
        timezone: input.timezone,
        name: input.name,
      })

      // Optional: Generate LLM narrative for key sections
      const narrativeDepth = input.narrativeDepth ?? 'none'
      if (narrativeDepth !== 'none' && brain) {
        try {
          const sectionsToNarrate =
            narrativeDepth === 'detailed' ? report.sections : report.sections.slice(0, 4) // basic: overview, planets, houses, aspects

          for (const section of sectionsToNarrate) {
            const prompt = `You are an expert astrologer. Based on this chart data, provide a personalized interpretation for the "${section.title}" section.\n\nChart: ${report.summary}\n\nData:\n${section.content}\n\nProvide a warm, insightful 2-3 paragraph interpretation. Be specific to this chart.`

            const llmResponse = await brain.llm.chat({
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.7,
              maxTokens: 500,
            })

            if (llmResponse?.content) {
              ;(section as { narrative?: string }).narrative = llmResponse.content
            }
          }
        } catch {
          // LLM narrative is non-blocking
        }
      }

      return c.json(report)
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Report generation failed' }, 500)
    }
  },
}
