/**
 * Tool Executor — defines agent tool schemas and dispatches tool calls
 * to the appropriate engine/service functions.
 */

import { run as ephemerisRun } from '../engines/swiss-ephemeris/engine'
import {
  julianDay,
  calcAllPlanets,
  calcHouses,
  assignHouses,
} from '../engines/swiss-ephemeris/engine'
import { moonPhase } from '../engines/swiss-ephemeris/lunar'
import { panchanga, vimshottariDasha } from '../engines/swiss-ephemeris/vedic'
import { synastryAspects } from '../engines/swiss-ephemeris/composite'
import {
  solarReturn,
  transitCalendar,
  annualProfections,
} from '../engines/swiss-ephemeris/predictive'
import { MemoryService } from '../memory/memory-service'
import type { Database } from '@solarc/db'
import type { ZodiacSign } from '../engines/swiss-ephemeris/engine'

// ─── Tool Definitions (Anthropic format) ─────────────────────────────────────

export const AGENT_TOOLS = [
  {
    name: 'ephemeris_natal_chart',
    description:
      'Compute a full natal chart with planets, houses, aspects, dignities, chart shape, Arabic lots. Returns the complete chart data and a summary string.',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number', description: 'Birth year (e.g., 1990)' },
        birthMonth: { type: 'number', description: 'Birth month (1-12)' },
        birthDay: { type: 'number', description: 'Birth day (1-31)' },
        birthHour: {
          type: 'number',
          description: 'Birth hour in decimal UTC (e.g., 14.5 = 2:30 PM)',
        },
        latitude: { type: 'number', description: 'Birth latitude in decimal degrees (N positive)' },
        longitude: {
          type: 'number',
          description: 'Birth longitude in decimal degrees (E positive)',
        },
      },
      required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'latitude', 'longitude'],
    },
  },
  {
    name: 'ephemeris_current_transits',
    description: 'Get current planetary positions (real-time transits for right now).',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'ephemeris_moon_phase',
    description: 'Get the current moon phase, illumination percentage, and waxing/waning status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: { type: 'number' },
        month: { type: 'number' },
        day: { type: 'number' },
        hour: { type: 'number' },
      },
      required: ['year', 'month', 'day'],
    },
  },
  {
    name: 'ephemeris_transit_calendar',
    description:
      'Generate a transit calendar showing planetary aspects to a natal chart over a date range.',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        startDate: { type: 'string', description: 'YYYY-MM-DD' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: [
        'birthYear',
        'birthMonth',
        'birthDay',
        'birthHour',
        'latitude',
        'longitude',
        'startDate',
        'endDate',
      ],
    },
  },
  {
    name: 'ephemeris_panchanga',
    description: 'Calculate Vedic Panchanga (tithi, vara, nakshatra, yoga, karana) for a date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: { type: 'number' },
        month: { type: 'number' },
        day: { type: 'number' },
        hour: { type: 'number' },
      },
      required: ['year', 'month', 'day'],
    },
  },
  {
    name: 'ephemeris_dasha',
    description: 'Calculate Vimshottari Dasha (120-year planetary period cycle) from birth data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
      },
      required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour'],
    },
  },
  {
    name: 'ephemeris_synastry',
    description: 'Calculate synastry aspects between two natal charts for relationship analysis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person1: {
          type: 'object',
          properties: {
            birthYear: { type: 'number' },
            birthMonth: { type: 'number' },
            birthDay: { type: 'number' },
            birthHour: { type: 'number' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
          },
          required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'latitude', 'longitude'],
        },
        person2: {
          type: 'object',
          properties: {
            birthYear: { type: 'number' },
            birthMonth: { type: 'number' },
            birthDay: { type: 'number' },
            birthHour: { type: 'number' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
          },
          required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'latitude', 'longitude'],
        },
      },
      required: ['person1', 'person2'],
    },
  },
  {
    name: 'ephemeris_solar_return',
    description: 'Compute a Solar Return chart for a specific year.',
    input_schema: {
      type: 'object' as const,
      properties: {
        natalSunLongitude: { type: 'number', description: 'Natal Sun longitude (0-360)' },
        year: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
      },
      required: ['natalSunLongitude', 'year', 'latitude', 'longitude'],
    },
  },
  {
    name: 'ephemeris_profections',
    description:
      'Calculate annual profections (profected house, activated sign, lord of the year).',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        currentYear: { type: 'number' },
        ascendantSign: { type: 'string', description: 'Ascendant zodiac sign name' },
      },
      required: ['birthYear', 'currentYear', 'ascendantSign'],
    },
  },
  {
    name: 'memory_search',
    description:
      'Search stored memories for relevant context. Returns matching memories ranked by relevance.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_store',
    description: 'Store a new memory for future recall.',
    input_schema: {
      type: 'object' as const,
      properties: {
        key: { type: 'string', description: 'Memory key/title' },
        content: { type: 'string', description: 'Memory content to store' },
      },
      required: ['key', 'content'],
    },
  },
]

// ─── Tool Executor ───────────────────────────────────────────────────────────

/**
 * Execute a tool call by name, dispatching to the appropriate engine function.
 * Returns the result as a JSON string (or error message).
 */
export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  db?: Database,
): Promise<string> {
  try {
    switch (toolName) {
      case 'ephemeris_natal_chart': {
        const result = await ephemerisRun({
          birthYear: toolInput.birthYear as number,
          birthMonth: toolInput.birthMonth as number,
          birthDay: toolInput.birthDay as number,
          birthHour: toolInput.birthHour as number,
          latitude: toolInput.latitude as number,
          longitude: toolInput.longitude as number,
        })
        return JSON.stringify(result)
      }

      case 'ephemeris_current_transits': {
        const now = new Date()
        const jd = julianDay(
          now.getUTCFullYear(),
          now.getUTCMonth() + 1,
          now.getUTCDate(),
          now.getUTCHours() + now.getUTCMinutes() / 60,
        )
        const planets = calcAllPlanets(jd)
        return JSON.stringify({ jd, date: now.toISOString(), planets })
      }

      case 'ephemeris_moon_phase': {
        const year = toolInput.year as number
        const month = toolInput.month as number
        const day = toolInput.day as number
        const hour = (toolInput.hour as number) ?? 12
        const jd = julianDay(year, month, day, hour)
        const planets = calcAllPlanets(jd)
        const sunLon = planets.Sun.longitude
        const moonLon = planets.Moon.longitude
        const phase = moonPhase(sunLon, moonLon)
        return JSON.stringify(phase)
      }

      case 'ephemeris_transit_calendar': {
        const input = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
          startDate: string
          endDate: string
        }
        const jd = julianDay(input.birthYear, input.birthMonth, input.birthDay, input.birthHour)
        const rawPlanets = calcAllPlanets(jd)
        const houses = calcHouses(jd, input.latitude, input.longitude)
        const natalPlanets = assignHouses(rawPlanets, houses)
        const events = await transitCalendar(natalPlanets, input.startDate, input.endDate)
        return JSON.stringify(events)
      }

      case 'ephemeris_panchanga': {
        const year = toolInput.year as number
        const month = toolInput.month as number
        const day = toolInput.day as number
        const hour = (toolInput.hour as number) ?? 12
        const jd = julianDay(year, month, day, hour)
        const result = panchanga(jd)
        return JSON.stringify(result)
      }

      case 'ephemeris_dasha': {
        const birthYear = toolInput.birthYear as number
        const birthMonth = toolInput.birthMonth as number
        const birthDay = toolInput.birthDay as number
        const birthHour = toolInput.birthHour as number
        const jd = julianDay(birthYear, birthMonth, birthDay, birthHour)
        const planets = calcAllPlanets(jd)
        const moonLon = planets.Moon.longitude
        const dashas = vimshottariDasha(moonLon, jd)
        return JSON.stringify(dashas)
      }

      case 'ephemeris_synastry': {
        const p1 = toolInput.person1 as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const p2 = toolInput.person2 as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart1 = (
          await ephemerisRun({
            birthYear: p1.birthYear,
            birthMonth: p1.birthMonth,
            birthDay: p1.birthDay,
            birthHour: p1.birthHour,
            latitude: p1.latitude,
            longitude: p1.longitude,
          })
        ).data
        const chart2 = (
          await ephemerisRun({
            birthYear: p2.birthYear,
            birthMonth: p2.birthMonth,
            birthDay: p2.birthDay,
            birthHour: p2.birthHour,
            latitude: p2.latitude,
            longitude: p2.longitude,
          })
        ).data
        const aspects = synastryAspects(chart1, chart2)
        return JSON.stringify(aspects)
      }

      case 'ephemeris_solar_return': {
        const natalSunLon = toolInput.natalSunLongitude as number
        const year = toolInput.year as number
        const lat = toolInput.latitude as number
        const lon = toolInput.longitude as number
        const result = await solarReturn(natalSunLon, year, lat, lon)
        return JSON.stringify(result)
      }

      case 'ephemeris_profections': {
        const birthYear = toolInput.birthYear as number
        const currentYear = toolInput.currentYear as number
        const ascendantSign = toolInput.ascendantSign as ZodiacSign
        const result = annualProfections(birthYear, currentYear, ascendantSign)
        return JSON.stringify(result)
      }

      case 'memory_search': {
        if (!db) return JSON.stringify({ error: 'Database not available for memory operations' })
        const memoryService = new MemoryService(db)
        const query = toolInput.query as string
        const limit = (toolInput.limit as number) ?? 5
        const results = await memoryService.search(query, { limit })
        return JSON.stringify(results)
      }

      case 'memory_store': {
        if (!db) return JSON.stringify({ error: 'Database not available for memory operations' })
        const memoryService = new MemoryService(db)
        const key = toolInput.key as string
        const content = toolInput.content as string
        const stored = await memoryService.store({ key, content })
        return JSON.stringify({ id: stored.id, key: stored.key })
      }

      default:
        return `Unknown tool: ${toolName}`
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: `Tool execution failed: ${message}` })
  }
}
