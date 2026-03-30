/**
 * Tool Executor — defines agent tool schemas and dispatches tool calls
 * to the appropriate engine/service functions.
 */

import type { Database } from '@solarc/db'
import type { ZodiacSign } from '@solarc/ephemeris'
import { synastryAspects } from '@solarc/ephemeris'
import { run as ephemerisRun } from '@solarc/ephemeris'
import { assignHouses, calcAllPlanets, calcHouses, julianDay } from '@solarc/ephemeris'
import { moonPhase } from '@solarc/ephemeris'
import { annualProfections, solarReturn, transitCalendar } from '@solarc/ephemeris'
import { panchanga, vimshottariDasha } from '@solarc/ephemeris'
import { secondaryProgressions } from '@solarc/ephemeris'
import { calcArabicParts } from '@solarc/ephemeris'
import { findAspectPatterns } from '@solarc/ephemeris'
import { firdaria } from '@solarc/ephemeris'
import { calcFixedStars, fixedStarConjunctions } from '@solarc/ephemeris'
import { dispositorChain } from '@solarc/ephemeris'
import { calcAllMidpoints } from '@solarc/ephemeris'
import { lunarReturn } from '@solarc/ephemeris'
import { medicalAstrology } from '@solarc/ephemeris'
import { generateNatalReport } from '@solarc/ephemeris'

import { MemoryService } from '../memory/memory-service'

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
    name: 'ephemeris_lunar_return',
    description: 'Compute a Lunar Return chart (Moon returns to natal position).',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        targetYear: { type: 'number' },
        targetMonth: { type: 'number' },
      },
      required: [
        'birthYear',
        'birthMonth',
        'birthDay',
        'birthHour',
        'latitude',
        'longitude',
        'targetYear',
        'targetMonth',
      ],
    },
  },
  {
    name: 'ephemeris_progressions',
    description: 'Calculate secondary progressions to a target date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        targetYear: { type: 'number' },
        targetMonth: { type: 'number' },
        targetDay: { type: 'number' },
      },
      required: [
        'birthYear',
        'birthMonth',
        'birthDay',
        'birthHour',
        'latitude',
        'longitude',
        'targetYear',
        'targetMonth',
        'targetDay',
      ],
    },
  },
  {
    name: 'ephemeris_arabic_parts',
    description: 'Calculate 50+ Arabic Parts (Fortune, Spirit, Eros, etc.) from birth data.',
    input_schema: {
      type: 'object' as const,
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
  {
    name: 'ephemeris_patterns',
    description:
      'Find aspect patterns in a natal chart (Grand Trine, T-Square, Yod, Grand Cross, Kite, etc.).',
    input_schema: {
      type: 'object' as const,
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
  {
    name: 'ephemeris_firdaria',
    description: 'Calculate Firdaria time lord periods (planetary years) for birth data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        maxAge: { type: 'number', description: 'Maximum age to calculate (default 75)' },
      },
      required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour'],
    },
  },
  {
    name: 'ephemeris_fixed_stars',
    description: 'Find fixed star conjunctions to natal planets.',
    input_schema: {
      type: 'object' as const,
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
  {
    name: 'ephemeris_dispositors',
    description: 'Calculate dispositor chains and mutual receptions in a natal chart.',
    input_schema: {
      type: 'object' as const,
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
  {
    name: 'ephemeris_midpoints',
    description: 'Calculate all planetary midpoints in a natal chart.',
    input_schema: {
      type: 'object' as const,
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
  {
    name: 'ephemeris_medical',
    description:
      'Medical astrology analysis — body part vulnerabilities by sign and planet placement.',
    input_schema: {
      type: 'object' as const,
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
  {
    name: 'ephemeris_report',
    description:
      'Generate a comprehensive natal report with 15 sections (overview, planets, houses, aspects, patterns, dignities, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        birthYear: { type: 'number' },
        birthMonth: { type: 'number' },
        birthDay: { type: 'number' },
        birthHour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        name: { type: 'string', description: 'Name for the report (optional)' },
      },
      required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'latitude', 'longitude'],
    },
  },
  {
    name: 'ephemeris_horary',
    description:
      'Assess a horary chart for a question asked at a specific time. Returns strictures, significators, and judgment.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: { type: 'number' },
        month: { type: 'number' },
        day: { type: 'number' },
        hour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        questionHouse: {
          type: 'number',
          description: 'House ruling the matter (1-12). E.g., 7 for relationships, 10 for career.',
        },
      },
      required: ['year', 'month', 'day', 'hour', 'latitude', 'longitude', 'questionHouse'],
    },
  },
  {
    name: 'ephemeris_electional',
    description:
      'Score a candidate date/time for starting an activity (0-100). Checks Moon condition, planetary hours, aspects, dignities.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: { type: 'number' },
        month: { type: 'number' },
        day: { type: 'number' },
        hour: { type: 'number' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        activityType: {
          type: 'string',
          description: 'Type: business, relationship, travel, medical, legal, creative, general',
        },
      },
      required: ['year', 'month', 'day', 'hour', 'latitude', 'longitude'],
    },
  },
  {
    name: 'sessions_send',
    description:
      'Send a message to another agent and get their response. Enables agent-to-agent collaboration.',
    input_schema: {
      type: 'object' as const,
      properties: {
        targetAgentId: { type: 'string', description: 'UUID of the agent to message' },
        message: { type: 'string', description: 'Message to send to the target agent' },
      },
      required: ['targetAgentId', 'message'],
    },
  },
  {
    name: 'sessions_spawn',
    description:
      'Spawn a child agent to handle a sub-task independently. Returns the child agent response when complete.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'UUID of the agent to spawn' },
        task: { type: 'string', description: 'Task description for the child agent' },
      },
      required: ['agentId', 'task'],
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
  workspaceId?: string,
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
        const results = await memoryService.search(query, {
          limit,
          ...(workspaceId ? { workspaceId } : {}),
        })
        return JSON.stringify(results)
      }

      case 'memory_store': {
        if (!db) return JSON.stringify({ error: 'Database not available for memory operations' })
        const memoryService = new MemoryService(db)
        const key = toolInput.key as string
        const content = toolInput.content as string
        const stored = await memoryService.store({
          key,
          content,
          ...(workspaceId ? { workspaceId } : {}),
        })
        return JSON.stringify({ id: stored.id, key: stored.key })
      }

      case 'ephemeris_lunar_return': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
          targetYear: number
          targetMonth: number
        }
        const birthJd = julianDay(i.birthYear, i.birthMonth, i.birthDay, i.birthHour)
        const birthPlanets = calcAllPlanets(birthJd)
        const targetJd = julianDay(i.targetYear, i.targetMonth, 1, 12)
        const result = await lunarReturn(
          birthPlanets.Moon.longitude,
          targetJd,
          i.latitude,
          i.longitude,
        )
        return JSON.stringify(result)
      }

      case 'ephemeris_progressions': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
          targetYear: number
          targetMonth: number
          targetDay: number
        }
        const bJd = julianDay(i.birthYear, i.birthMonth, i.birthDay, i.birthHour)
        const tJd = julianDay(i.targetYear, i.targetMonth, i.targetDay, 12)
        const result = await secondaryProgressions(bJd, tJd, i.latitude, i.longitude)
        return JSON.stringify(result)
      }

      case 'ephemeris_arabic_parts': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const parts = calcArabicParts(chart.planets, chart.houses)
        return JSON.stringify(parts)
      }

      case 'ephemeris_patterns': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const patterns = findAspectPatterns(chart.aspects, chart.planets)
        return JSON.stringify(patterns)
      }

      case 'ephemeris_firdaria': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          maxAge?: number
        }
        // Determine day/night chart: hour < 6 or > 18 = night
        const isDiurnal = i.birthHour >= 6 && i.birthHour < 18
        const result = firdaria(isDiurnal, i.maxAge ?? 75)
        return JSON.stringify(result)
      }

      case 'ephemeris_fixed_stars': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const jdStar = julianDay(i.birthYear, i.birthMonth, i.birthDay, i.birthHour)
        const stars = calcFixedStars(jdStar)
        const conj = fixedStarConjunctions(stars, chart.planets)
        return JSON.stringify(conj)
      }

      case 'ephemeris_dispositors': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const result = dispositorChain(chart.planets)
        return JSON.stringify(result)
      }

      case 'ephemeris_midpoints': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const result = calcAllMidpoints(chart.planets)
        return JSON.stringify(result)
      }

      case 'ephemeris_medical': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const result = medicalAstrology(chart.planets)
        return JSON.stringify(result)
      }

      case 'ephemeris_report': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
          name?: string
        }
        const result = await generateNatalReport(i as Parameters<typeof generateNatalReport>[0])
        return JSON.stringify(result)
      }

      case 'ephemeris_horary': {
        const i = toolInput as {
          year: number
          month: number
          day: number
          hour: number
          latitude: number
          longitude: number
          questionHouse: number
        }
        const { assessHoraryChart } = await import('../engines/swiss-ephemeris/horary')
        const result = await assessHoraryChart(i)
        return JSON.stringify(result)
      }

      case 'ephemeris_electional': {
        const i = toolInput as {
          year: number
          month: number
          day: number
          hour: number
          latitude: number
          longitude: number
          activityType?: string
        }
        const { scoreElection } = await import('../engines/swiss-ephemeris/electional')
        const result = await scoreElection({
          ...i,
          activityType: (i.activityType ?? 'general') as
            | 'business'
            | 'relationship'
            | 'travel'
            | 'medical'
            | 'legal'
            | 'creative'
            | 'general',
        })
        return JSON.stringify(result)
      }

      case 'sessions_send': {
        if (!db) return JSON.stringify({ error: 'Database required for agent messaging' })
        const targetId = toolInput.targetAgentId as string
        const msg = toolInput.message as string
        const { agents: agentsTable } = await import('@solarc/db')
        const { eq: eqOp } = await import('drizzle-orm')
        const target = await db.query.agents.findFirst({ where: eqOp(agentsTable.id, targetId) })
        if (!target) return JSON.stringify({ error: `Agent ${targetId} not found` })
        const { GatewayRouter: GW } = await import('../gateway')
        const gw = new GW(db)
        const resp = await gw.chat({
          model: target.model ?? undefined,
          messages: [
            ...(target.soul ? [{ role: 'system' as const, content: target.soul }] : []),
            { role: 'user', content: msg },
          ],
          agentId: target.id,
        })
        return JSON.stringify({
          agentId: target.id,
          agentName: target.name,
          response: resp.content,
        })
      }

      case 'sessions_spawn': {
        if (!db) return JSON.stringify({ error: 'Database required for agent spawning' })
        const spawnAgentId = toolInput.agentId as string
        const spawnTask = toolInput.task as string
        const { agents: agentsT } = await import('@solarc/db')
        const { eq: eqFn } = await import('drizzle-orm')
        const spawnAgent = await db.query.agents.findFirst({
          where: eqFn(agentsT.id, spawnAgentId),
        })
        if (!spawnAgent) return JSON.stringify({ error: `Agent ${spawnAgentId} not found` })
        const { GatewayRouter: Gateway } = await import('../gateway')
        const spawnGw = new Gateway(db)
        const spawnResult = await spawnGw.chat({
          model: spawnAgent.model ?? undefined,
          messages: [
            ...(spawnAgent.soul ? [{ role: 'system' as const, content: spawnAgent.soul }] : []),
            { role: 'user', content: spawnTask },
          ],
          agentId: spawnAgent.id,
        })
        return JSON.stringify({
          agentId: spawnAgent.id,
          agentName: spawnAgent.name,
          response: spawnResult.content,
          status: 'completed',
        })
      }

      default:
        return `Unknown tool: ${toolName}`
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: `Tool execution failed: ${message}` })
  }
}
