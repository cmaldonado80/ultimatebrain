/**
 * Ephemeris Router — exposes the Swiss Ephemeris engine as tRPC endpoints.
 * Agents and mini-brains can call these to get planetary data.
 */
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import {
  run,
  isAvailable,
  calcAllPlanets,
  calcHouses,
  assignHouses,
  calcAspects,
  julianDay,
  type HouseSystem,
  type SwissEphemerisInput,
  type NatalChart,
} from '../services/engines/swiss-ephemeris/engine'
import { findAspectPatterns } from '../services/engines/swiss-ephemeris/patterns'
import {
  solarReturn,
  transitCalendar,
  annualProfections,
} from '../services/engines/swiss-ephemeris/predictive'
import { panchanga, vimshottariDasha } from '../services/engines/swiss-ephemeris/vedic'
import { synastryAspects, compositeChart } from '../services/engines/swiss-ephemeris/composite'
import {
  solarCondition,
  calcArabicParts,
  planetaryHours,
} from '../services/engines/swiss-ephemeris/classical'
import { calcAllMidpoints } from '../services/engines/swiss-ephemeris/midpoints'
import { bradleySiderograph } from '../services/engines/swiss-ephemeris/financial'

const HOUSE_SYSTEMS = ['P', 'K', 'O', 'R', 'E', 'W'] as const
const SIGN_LIST = [
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
] as const

// Helper: build a full NatalChart from date/location inputs
async function buildChart(input: {
  birthYear: number
  birthMonth: number
  birthDay: number
  birthHour: number
  latitude: number
  longitude: number
  houseSystem?: string
  sidereal?: boolean
}): Promise<NatalChart> {
  const result = await run({
    ...input,
    houseSystem: (input.houseSystem ?? 'P') as HouseSystem,
  } as SwissEphemerisInput)
  return result.data
}

export const ephemerisRouter = router({
  // ── Core ──────────────────────────────────────────────────────────────

  status: protectedProcedure.query(() => {
    return { available: isAvailable() }
  }),

  natalChart: protectedProcedure
    .input(
      z.object({
        birthYear: z.number().int(),
        birthMonth: z.number().int().min(1).max(12),
        birthDay: z.number().int().min(1).max(31),
        birthHour: z.number().min(0).max(24),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        timezone: z.number().optional(),
        birthTimeConfirmed: z.boolean().optional(),
        houseSystem: z.enum(HOUSE_SYSTEMS).optional(),
        sidereal: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      return run(input as SwissEphemerisInput)
    }),

  planetaryPositions: protectedProcedure
    .input(
      z.object({
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        day: z.number().int().min(1).max(31),
        hour: z.number().min(0).max(24).default(12),
        sidereal: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      const jd = julianDay(input.year, input.month, input.day, input.hour)
      return calcAllPlanets(jd, input.sidereal)
    }),

  currentTransits: protectedProcedure.query(async () => {
    const now = new Date()
    const jd = julianDay(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
      now.getUTCDate(),
      now.getUTCHours() + now.getUTCMinutes() / 60,
    )
    return calcAllPlanets(jd, false)
  }),

  houseCusps: protectedProcedure
    .input(
      z.object({
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        day: z.number().int().min(1).max(31),
        hour: z.number().min(0).max(24),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        system: z.enum(HOUSE_SYSTEMS).optional(),
      }),
    )
    .query(async ({ input }) => {
      const jd = julianDay(input.year, input.month, input.day, input.hour)
      return calcHouses(jd, input.latitude, input.longitude, (input.system ?? 'P') as HouseSystem)
    }),

  aspects: protectedProcedure
    .input(
      z.object({
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        day: z.number().int().min(1).max(31),
        hour: z.number().min(0).max(24).default(12),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        system: z.enum(HOUSE_SYSTEMS).optional(),
      }),
    )
    .query(async ({ input }) => {
      const jd = julianDay(input.year, input.month, input.day, input.hour)
      const rawPlanets = calcAllPlanets(jd, false)
      const houses = calcHouses(
        jd,
        input.latitude,
        input.longitude,
        (input.system ?? 'P') as HouseSystem,
      )
      const planets = assignHouses(rawPlanets, houses)
      return calcAspects(planets)
    }),

  // ── Patterns ──────────────────────────────────────────────────────────

  patterns: protectedProcedure
    .input(
      z.object({
        birthYear: z.number().int(),
        birthMonth: z.number().int().min(1).max(12),
        birthDay: z.number().int().min(1).max(31),
        birthHour: z.number().min(0).max(24),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      }),
    )
    .query(async ({ input }) => {
      const chart = await buildChart(input)
      return findAspectPatterns(chart.aspects, chart.planets)
    }),

  // ── Predictive ────────────────────────────────────────────────────────

  solarReturn: protectedProcedure
    .input(
      z.object({
        natalSunLongitude: z.number().min(0).max(360),
        year: z.number().int(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      }),
    )
    .query(async ({ input }) => {
      return solarReturn(input.natalSunLongitude, input.year, input.latitude, input.longitude)
    }),

  transitCalendar: protectedProcedure
    .input(
      z.object({
        birthYear: z.number().int(),
        birthMonth: z.number().int().min(1).max(12),
        birthDay: z.number().int().min(1).max(31),
        birthHour: z.number().min(0).max(24),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .query(async ({ input }) => {
      const chart = await buildChart(input)
      return transitCalendar(chart.planets, input.startDate, input.endDate)
    }),

  profections: protectedProcedure
    .input(
      z.object({
        birthYear: z.number().int(),
        currentYear: z.number().int(),
        ascendantSign: z.enum(SIGN_LIST),
      }),
    )
    .query(({ input }) => {
      return annualProfections(input.birthYear, input.currentYear, input.ascendantSign)
    }),

  // ── Vedic ─────────────────────────────────────────────────────────────

  panchanga: protectedProcedure
    .input(
      z.object({
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        day: z.number().int().min(1).max(31),
        hour: z.number().min(0).max(24).default(12),
      }),
    )
    .query(({ input }) => {
      const jd = julianDay(input.year, input.month, input.day, input.hour)
      return panchanga(jd)
    }),

  dasha: protectedProcedure
    .input(
      z.object({
        birthYear: z.number().int(),
        birthMonth: z.number().int().min(1).max(12),
        birthDay: z.number().int().min(1).max(31),
        birthHour: z.number().min(0).max(24),
      }),
    )
    .query(({ input }) => {
      const jd = julianDay(input.birthYear, input.birthMonth, input.birthDay, input.birthHour)
      const planets = calcAllPlanets(jd, false)
      return vimshottariDasha(planets.Moon.longitude, jd)
    }),

  // ── Composite ─────────────────────────────────────────────────────────

  synastry: protectedProcedure
    .input(
      z.object({
        chart1: z.object({
          birthYear: z.number().int(),
          birthMonth: z.number().int(),
          birthDay: z.number().int(),
          birthHour: z.number(),
          latitude: z.number(),
          longitude: z.number(),
        }),
        chart2: z.object({
          birthYear: z.number().int(),
          birthMonth: z.number().int(),
          birthDay: z.number().int(),
          birthHour: z.number(),
          latitude: z.number(),
          longitude: z.number(),
        }),
      }),
    )
    .query(async ({ input }) => {
      const [c1, c2] = await Promise.all([buildChart(input.chart1), buildChart(input.chart2)])
      return synastryAspects(c1, c2)
    }),

  composite: protectedProcedure
    .input(
      z.object({
        chart1: z.object({
          birthYear: z.number().int(),
          birthMonth: z.number().int(),
          birthDay: z.number().int(),
          birthHour: z.number(),
          latitude: z.number(),
          longitude: z.number(),
        }),
        chart2: z.object({
          birthYear: z.number().int(),
          birthMonth: z.number().int(),
          birthDay: z.number().int(),
          birthHour: z.number(),
          latitude: z.number(),
          longitude: z.number(),
        }),
      }),
    )
    .query(async ({ input }) => {
      const [c1, c2] = await Promise.all([buildChart(input.chart1), buildChart(input.chart2)])
      return compositeChart(c1, c2)
    }),

  // ── Classical ─────────────────────────────────────────────────────────

  arabicParts: protectedProcedure
    .input(
      z.object({
        birthYear: z.number().int(),
        birthMonth: z.number().int(),
        birthDay: z.number().int(),
        birthHour: z.number(),
        latitude: z.number(),
        longitude: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const chart = await buildChart(input)
      return calcArabicParts(chart.planets, chart.houses)
    }),

  planetaryHours: protectedProcedure
    .input(
      z.object({
        year: z.number().int(),
        month: z.number().int(),
        day: z.number().int(),
        hour: z.number().default(12),
        latitude: z.number(),
        longitude: z.number(),
      }),
    )
    .query(({ input }) => {
      const jd = julianDay(input.year, input.month, input.day, input.hour)
      return planetaryHours(jd, input.latitude, input.longitude)
    }),

  solarCondition: protectedProcedure
    .input(
      z.object({
        birthYear: z.number().int(),
        birthMonth: z.number().int(),
        birthDay: z.number().int(),
        birthHour: z.number(),
        latitude: z.number(),
        longitude: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const chart = await buildChart(input)
      return solarCondition(chart.planets.Sun, chart.planets)
    }),

  // ── Midpoints ─────────────────────────────────────────────────────────

  midpoints: protectedProcedure
    .input(
      z.object({
        birthYear: z.number().int(),
        birthMonth: z.number().int(),
        birthDay: z.number().int(),
        birthHour: z.number(),
        latitude: z.number(),
        longitude: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const chart = await buildChart(input)
      return calcAllMidpoints(chart.planets)
    }),

  // ── Financial ─────────────────────────────────────────────────────────

  bradley: protectedProcedure.input(z.object({ year: z.number().int() })).query(({ input }) => {
    return bradleySiderograph(input.year)
  }),
})
