/**
 * Ephemeris Router — exposes the Swiss Ephemeris engine as tRPC endpoints.
 * Agents and mini-brains can call these to get planetary data.
 *
 * Uses the production swisseph native binding for < 1 arcminute accuracy.
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
} from '../services/engines/swiss-ephemeris/engine'

const HOUSE_SYSTEMS = ['P', 'K', 'O', 'R', 'E', 'W'] as const

export const ephemerisRouter = router({
  /**
   * Check if the Swiss Ephemeris engine is available.
   */
  status: protectedProcedure.query(() => {
    return { available: isAvailable() }
  }),

  /**
   * Full natal chart — the primary endpoint.
   * Accepts SwissEphemerisInput, returns EngineResult with full chart + summary.
   */
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

  /**
   * Get planetary positions for any date/time (decimal hour UTC).
   */
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

  /**
   * Get current (now) planetary positions.
   */
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

  /**
   * Calculate house cusps for a date/time/location.
   */
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

  /**
   * Get aspects between planets for a given date.
   */
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
})
