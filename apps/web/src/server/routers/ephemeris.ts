/**
 * Ephemeris Router — exposes the Swiss Ephemeris engine as tRPC endpoints.
 * Agents and mini-brains can call these to get planetary data.
 */
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import {
  EphemerisEngine,
  HOUSE_SYSTEMS,
  PLANET_NAMES,
} from '../../../../../templates/astrology/src/engines/ephemeris/engine'

const engine = new EphemerisEngine()

const planetaryPositionsSchema = z.record(
  z.enum(PLANET_NAMES),
  z.object({
    planet: z.enum(PLANET_NAMES),
    glyph: z.string(),
    sign: z.string(),
    degree: z.number(),
    minute: z.number(),
    notation: z.string(),
    longitude: z.number(),
    retrograde: z.boolean(),
    house: z.number().optional(),
  }),
)

export const ephemerisRouter = router({
  /**
   * Get planetary positions for any date/time.
   */
  planetaryPositions: protectedProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
        time: z.string().optional(),
        timezone: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      return engine.getPlanetaryPositions(input.date, input.time, input.timezone)
    }),

  /**
   * Get current (today's) planetary positions.
   */
  currentTransits: protectedProcedure.query(async () => {
    return engine.getCurrentTransits()
  }),

  /**
   * Calculate 12 house cusps for a birth time + location.
   */
  houseCusps: protectedProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        system: z.enum(HOUSE_SYSTEMS).optional(),
      }),
    )
    .query(async ({ input }) => {
      return engine.getHouseCusps(
        input.date,
        input.time,
        input.latitude,
        input.longitude,
        input.system,
      )
    }),

  /**
   * Get all aspects from a set of planetary positions.
   */
  aspects: protectedProcedure
    .input(z.object({ positions: planetaryPositionsSchema }))
    .query(async ({ input }) => {
      return engine.getAspects(input.positions as Parameters<typeof engine.getAspects>[0])
    }),

  /**
   * Find transits to a natal chart for a given date.
   */
  transitsToNatal: protectedProcedure
    .input(
      z.object({
        natalPositions: planetaryPositionsSchema,
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .query(async ({ input }) => {
      return engine.getTransitsToNatal(
        input.natalPositions as Parameters<typeof engine.getTransitsToNatal>[0],
        input.date,
      )
    }),

  /**
   * Get retrograde periods within a date range.
   */
  retrogrades: protectedProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .query(async ({ input }) => {
      return engine.getRetrogrades(input.startDate, input.endDate)
    }),

  /**
   * Full natal chart: positions + house cusps + aspects in one call.
   */
  natalChart: protectedProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        timezone: z.string().optional(),
        houseSystem: z.enum(HOUSE_SYSTEMS).optional(),
      }),
    )
    .query(async ({ input }) => {
      const [positions, cusps] = await Promise.all([
        engine.getPlanetaryPositions(input.date, input.time, input.timezone),
        engine.getHouseCusps(
          input.date,
          input.time,
          input.latitude,
          input.longitude,
          input.houseSystem,
        ),
      ])
      const aspects = await engine.getAspects(positions)
      return { positions, cusps, aspects }
    }),
})
