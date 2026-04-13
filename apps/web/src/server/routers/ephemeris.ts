/**
 * Ephemeris Router — 53-section Swiss Ephemeris engine as tRPC endpoints.
 */
import { z } from 'zod'

import {
  accidentalDignities,
  criticalDegrees,
  lillyDignityScore,
  sectAnalysis,
} from '../services/engines/swiss-ephemeris/accidental'
import {
  calcAntiscia,
  draconicChart,
  heliocentricPositions,
} from '../services/engines/swiss-ephemeris/antiscia'
import {
  calcArabicParts,
  planetaryHours,
  solarCondition,
} from '../services/engines/swiss-ephemeris/classical'
import { compositeChart, synastryAspects } from '../services/engines/swiss-ephemeris/composite'
import { calcDeclinations, calcParallels } from '../services/engines/swiss-ephemeris/declinations'
import { dispositorChain } from '../services/engines/swiss-ephemeris/dispositors'
import {
  assignHouses,
  calcAllPlanets,
  calcAspects,
  calcHouses,
  type HouseSystem,
  isAvailable,
  julianDay,
  type NatalChart,
  run,
  type SwissEphemerisInput,
} from '../services/engines/swiss-ephemeris/engine'
import {
  agriculturalCalendar,
  financialCycles,
  medicalAstrology,
  mundaneContext,
  sevenRays,
} from '../services/engines/swiss-ephemeris/esoteric'
import { bradleySiderograph } from '../services/engines/swiss-ephemeris/financial'
import {
  calcFixedStars,
  fixedStarConjunctions,
  sabianSymbol,
} from '../services/engines/swiss-ephemeris/fixed-stars'
import {
  lunarMansion,
  moonPhase,
  prenatalLunations,
} from '../services/engines/swiss-ephemeris/lunar'
import { calcAllMidpoints } from '../services/engines/swiss-ephemeris/midpoints'
import { findAspectPatterns } from '../services/engines/swiss-ephemeris/patterns'
import {
  annualProfections,
  solarReturn,
  transitCalendar,
} from '../services/engines/swiss-ephemeris/predictive'
import {
  primaryDirections,
  secondaryProgressions,
  solarArcDirections,
} from '../services/engines/swiss-ephemeris/progressions'
import {
  almutenFiguris,
  animodar,
  huberAgePoint,
  huberTimeline,
  trutineOfHermes,
} from '../services/engines/swiss-ephemeris/rectification'
import { lunarReturn, nodalReturn } from '../services/engines/swiss-ephemeris/returns'
import {
  ageHarmonicChart,
  calcDecanates,
  calcDwads,
  calcNavamsa,
  harmonicSpectrum,
} from '../services/engines/swiss-ephemeris/subdivisions'
import {
  decennials,
  firdaria,
  zodiacalReleasing,
} from '../services/engines/swiss-ephemeris/timelords'
import { panchanga, vimshottariDasha } from '../services/engines/swiss-ephemeris/vedic'
import {
  allVargaCharts,
  ashtakavarga,
  charaKarakas,
  muhurtaScore,
  shadbala,
} from '../services/engines/swiss-ephemeris/vedic-advanced'
import { protectedProcedure, router } from '../trpc'

const HS = ['P', 'K', 'O', 'R', 'E', 'W'] as const
const SIGNS = [
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

// Shared input schemas
const birthInput = z.object({
  birthYear: z.number().int(),
  birthMonth: z.number().int().min(1).max(12),
  birthDay: z.number().int().min(1).max(31),
  birthHour: z.number().min(0).max(24),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})
const dateInput = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  hour: z.number().min(0).max(24).default(12),
})
const twoCharts = z.object({ chart1: birthInput, chart2: birthInput })

async function buildChart(
  input: z.infer<typeof birthInput> & { houseSystem?: string; sidereal?: boolean },
): Promise<NatalChart> {
  const result = await run({
    ...input,
    houseSystem: (input.houseSystem ?? 'P') as HouseSystem,
  } as SwissEphemerisInput)
  return result.data
}

export const ephemerisRouter = router({
  // ── Core (Sections 1-4) ───────────────────────────────────────────────
  status: protectedProcedure.query(() => ({ available: isAvailable() })),

  natalChart: protectedProcedure
    .input(
      birthInput.extend({
        timezone: z.number().optional(),
        birthTimeConfirmed: z.boolean().optional(),
        houseSystem: z.enum(HS).optional(),
        sidereal: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => await run(input as SwissEphemerisInput)),

  planetaryPositions: protectedProcedure
    .input(dateInput.extend({ sidereal: z.boolean().optional() }))
    .query(({ input }) => {
      const jd = julianDay(input.year, input.month, input.day, input.hour)
      return calcAllPlanets(jd, input.sidereal)
    }),

  currentTransits: protectedProcedure.query(() => {
    const n = new Date()
    return calcAllPlanets(
      julianDay(
        n.getUTCFullYear(),
        n.getUTCMonth() + 1,
        n.getUTCDate(),
        n.getUTCHours() + n.getUTCMinutes() / 60,
      ),
      false,
    )
  }),

  houseCusps: protectedProcedure
    .input(
      dateInput.extend({
        latitude: z.number(),
        longitude: z.number(),
        system: z.enum(HS).optional(),
      }),
    )
    .query(({ input }) =>
      calcHouses(
        julianDay(input.year, input.month, input.day, input.hour),
        input.latitude,
        input.longitude,
        (input.system ?? 'P') as HouseSystem,
      ),
    ),

  aspects: protectedProcedure
    .input(
      dateInput.extend({
        latitude: z.number(),
        longitude: z.number(),
        system: z.enum(HS).optional(),
      }),
    )
    .query(({ input }) => {
      const jd = julianDay(input.year, input.month, input.day, input.hour)
      const h = calcHouses(
        jd,
        input.latitude,
        input.longitude,
        (input.system ?? 'P') as HouseSystem,
      )
      return calcAspects(assignHouses(calcAllPlanets(jd, false), h))
    }),

  // ── Lunar (Section 7, 24) ────────────────────────────────────────────
  moonPhase: protectedProcedure.input(dateInput).query(({ input }) => {
    const jd = julianDay(input.year, input.month, input.day, input.hour)
    const p = calcAllPlanets(jd, false)
    return moonPhase(p.Sun.longitude, p.Moon.longitude)
  }),
  lunarMansion: protectedProcedure.input(dateInput).query(({ input }) => {
    const p = calcAllPlanets(julianDay(input.year, input.month, input.day, input.hour), false)
    return lunarMansion(p.Moon.longitude)
  }),
  prenatalLunations: protectedProcedure
    .input(birthInput)
    .query(({ input }) =>
      prenatalLunations(
        julianDay(input.birthYear, input.birthMonth, input.birthDay, input.birthHour),
      ),
    ),

  // ── Accidental & Sect (Sections 5-6, 20, 25) ────────────────────────
  sectAnalysis: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return sectAnalysis(c.planets, c.houses)
  }),
  accidentalDignities: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return accidentalDignities(c.planets, c.houses, c.aspects)
  }),
  criticalDegrees: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return criticalDegrees(c.planets)
  }),
  lillyScore: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return lillyDignityScore(c.planets, c.dignities, c.houses, c.aspects)
  }),

  // ── Subdivisions & Harmonics (Sections 8, 38, 39) ───────────────────
  dwads: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return calcDwads(c.planets)
  }),
  navamsa: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return calcNavamsa(c.planets)
  }),
  decanates: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return calcDecanates(c.planets)
  }),
  ageHarmonic: protectedProcedure
    .input(birthInput.extend({ age: z.number() }))
    .query(async ({ input }) => {
      const c = await buildChart(input)
      return ageHarmonicChart(c.planets, input.age)
    }),
  harmonicSpectrum: protectedProcedure
    .input(birthInput.extend({ maxHarmonic: z.number().optional() }))
    .query(async ({ input }) => {
      const c = await buildChart(input)
      return harmonicSpectrum(c.planets, input.maxHarmonic)
    }),

  // ── Antiscia & Draconic (Sections 10, 22, 23) ───────────────────────
  antiscia: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return calcAntiscia(c.planets)
  }),
  draconic: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return draconicChart(c.planets)
  }),
  heliocentric: protectedProcedure
    .input(dateInput)
    .query(({ input }) =>
      heliocentricPositions(julianDay(input.year, input.month, input.day, input.hour)),
    ),

  // ── Arabic Parts & Classical (Sections 11, 14, 6) ───────────────────
  arabicParts: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return calcArabicParts(c.planets, c.houses)
  }),
  planetaryHours: protectedProcedure
    .input(dateInput.extend({ latitude: z.number(), longitude: z.number() }))
    .query(({ input }) =>
      planetaryHours(
        julianDay(input.year, input.month, input.day, input.hour),
        input.latitude,
        input.longitude,
      ),
    ),
  solarCondition: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return solarCondition(c.planets.Sun, c.planets)
  }),

  // ── Fixed Stars & Symbols (Sections 12, 13) ─────────────────────────
  fixedStars: protectedProcedure
    .input(dateInput)
    .query(({ input }) =>
      calcFixedStars(julianDay(input.year, input.month, input.day, input.hour)),
    ),
  fixedStarAspects: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const jd = julianDay(input.birthYear, input.birthMonth, input.birthDay, input.birthHour)
    const c = await buildChart(input)
    return fixedStarConjunctions(calcFixedStars(jd), c.planets)
  }),
  sabianSymbol: protectedProcedure
    .input(z.object({ longitude: z.number() }))
    .query(({ input }) => sabianSymbol(input.longitude)),

  // ── Patterns (Section 15) ───────────────────────────────────────────
  patterns: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return findAspectPatterns(c.aspects, c.planets)
  }),

  // ── Midpoints (Section 16) ──────────────────────────────────────────
  midpoints: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return calcAllMidpoints(c.planets)
  }),

  // ── Dispositors (Section 17) ────────────────────────────────────────
  dispositors: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return dispositorChain(c.planets)
  }),

  // ── Declinations (Sections 18, 19) ──────────────────────────────────
  declinations: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    const d = calcDeclinations(c.planets)
    return { declinations: d, parallels: calcParallels(d) }
  }),

  // ── Progressions & Directions (Sections 26, 27, 33) ─────────────────
  secondaryProgressions: protectedProcedure
    .input(
      birthInput.extend({ targetYear: z.number(), targetMonth: z.number(), targetDay: z.number() }),
    )
    .query(async ({ input }) => {
      const birthJd = julianDay(input.birthYear, input.birthMonth, input.birthDay, input.birthHour)
      const targetJd = julianDay(input.targetYear, input.targetMonth, input.targetDay, 12)
      return secondaryProgressions(birthJd, targetJd, input.latitude, input.longitude)
    }),
  solarArcDirections: protectedProcedure
    .input(
      birthInput.extend({ targetYear: z.number(), targetMonth: z.number(), targetDay: z.number() }),
    )
    .query(async ({ input }) => {
      const c = await buildChart(input)
      const birthJd = julianDay(input.birthYear, input.birthMonth, input.birthDay, input.birthHour)
      const targetJd = julianDay(input.targetYear, input.targetMonth, input.targetDay, 12)
      return solarArcDirections(c.planets, birthJd, targetJd)
    }),
  primaryDirections: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return primaryDirections(c.planets, c.houses, input.latitude)
  }),

  // ── Returns (Section 28) ────────────────────────────────────────────
  solarReturn: protectedProcedure
    .input(
      z.object({
        natalSunLongitude: z.number(),
        year: z.number(),
        latitude: z.number(),
        longitude: z.number(),
      }),
    )
    .query(
      async ({ input }) =>
        await solarReturn(input.natalSunLongitude, input.year, input.latitude, input.longitude),
    ),
  lunarReturn: protectedProcedure
    .input(
      birthInput.extend({ targetYear: z.number(), targetMonth: z.number(), targetDay: z.number() }),
    )
    .query(async ({ input }) => {
      const c = await buildChart(input)
      const targetJd = julianDay(input.targetYear, input.targetMonth, input.targetDay, 12)
      return await lunarReturn(c.planets.Moon.longitude, targetJd, input.latitude, input.longitude)
    }),
  nodalReturn: protectedProcedure
    .input(
      birthInput.extend({ targetYear: z.number(), targetMonth: z.number(), targetDay: z.number() }),
    )
    .query(async ({ input }) => {
      const c = await buildChart(input)
      const targetJd = julianDay(input.targetYear, input.targetMonth, input.targetDay, 12)
      return await nodalReturn(c.planets.NorthNode.longitude, targetJd)
    }),

  // ── Profections (Section 29) ────────────────────────────────────────
  profections: protectedProcedure
    .input(
      z.object({ birthYear: z.number(), currentYear: z.number(), ascendantSign: z.enum(SIGNS) }),
    )
    .query(({ input }) =>
      annualProfections(input.birthYear, input.currentYear, input.ascendantSign),
    ),

  // ── Time Lords (Sections 30-32, 34) ─────────────────────────────────
  firdaria: protectedProcedure
    .input(z.object({ isDayChart: z.boolean(), maxAge: z.number().optional() }))
    .query(({ input }) => firdaria(input.isDayChart, input.maxAge)),
  zodiacalReleasing: protectedProcedure
    .input(
      z.object({
        lotSign: z.number().int().min(0).max(11),
        maxAge: z.number().optional(),
        maxLevel: z.number().optional(),
      }),
    )
    .query(({ input }) => zodiacalReleasing(input.lotSign, input.maxAge, input.maxLevel)),
  decennials: protectedProcedure
    .input(z.object({ isDayChart: z.boolean(), maxAge: z.number().optional() }))
    .query(({ input }) => decennials(input.isDayChart, input.maxAge)),

  // ── Rectification (Sections 35-37) ──────────────────────────────────
  trutineOfHermes: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const jd = julianDay(input.birthYear, input.birthMonth, input.birthDay, input.birthHour)
    const c = await buildChart(input)
    return trutineOfHermes(jd, c.planets.Moon.longitude, c.houses.ascendant)
  }),
  animodar: protectedProcedure
    .input(birthInput.extend({ prenatalSyzygyLon: z.number(), isDayChart: z.boolean() }))
    .query(async ({ input }) => {
      const c = await buildChart(input)
      return animodar(
        c.houses.ascendant,
        c.houses.mc,
        c.planets.Moon.longitude,
        c.planets.Sun.longitude,
        input.prenatalSyzygyLon,
        input.isDayChart,
      )
    }),
  almutenFiguris: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    const sun = c.planets.Sun
    const isDayChart = sun.house >= 7 && sun.house <= 12
    return almutenFiguris(c.planets, c.houses, isDayChart)
  }),
  huberAgePoint: protectedProcedure
    .input(birthInput.extend({ age: z.number() }))
    .query(async ({ input }) => {
      const c = await buildChart(input)
      return huberAgePoint(input.age, c.houses.cusps)
    }),
  huberTimeline: protectedProcedure
    .input(
      birthInput.extend({ startAge: z.number(), endAge: z.number(), step: z.number().optional() }),
    )
    .query(async ({ input }) => {
      const c = await buildChart(input)
      return huberTimeline(c.houses.cusps, input.startAge, input.endAge, input.step)
    }),

  // ── Transit Calendar (Section 40) ───────────────────────────────────
  transitCalendar: protectedProcedure
    .input(birthInput.extend({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ input }) => {
      const c = await buildChart(input)
      return await transitCalendar(c.planets, input.startDate, input.endDate)
    }),

  // ── Vedic (Sections 41-47) ──────────────────────────────────────────
  panchanga: protectedProcedure
    .input(dateInput)
    .query(({ input }) => panchanga(julianDay(input.year, input.month, input.day, input.hour))),
  dasha: protectedProcedure.input(birthInput).query(({ input }) => {
    const jd = julianDay(input.birthYear, input.birthMonth, input.birthDay, input.birthHour)
    return vimshottariDasha(calcAllPlanets(jd, false).Moon.longitude, jd)
  }),
  vargaCharts: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return allVargaCharts(c.planets)
  }),
  shadbala: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    const jd = julianDay(input.birthYear, input.birthMonth, input.birthDay, input.birthHour)
    return shadbala(c.planets, c.houses, jd)
  }),
  ashtakavarga: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return ashtakavarga(c.planets)
  }),
  charaKarakas: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return charaKarakas(c.planets)
  }),
  muhurta: protectedProcedure
    .input(dateInput)
    .query(({ input }) => muhurtaScore(julianDay(input.year, input.month, input.day, input.hour))),

  // ── Esoteric & Specialized (Sections 48-53) ─────────────────────────
  sevenRays: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return sevenRays(c.planets)
  }),
  medical: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return medicalAstrology(c.planets)
  }),
  financialCycles: protectedProcedure.input(birthInput).query(async ({ input }) => {
    const c = await buildChart(input)
    return financialCycles(c.planets)
  }),
  agricultural: protectedProcedure.input(dateInput).query(({ input }) => {
    const p = calcAllPlanets(julianDay(input.year, input.month, input.day, input.hour), false)
    return agriculturalCalendar(p.Moon.sign)
  }),
  mundane: protectedProcedure
    .input(dateInput.extend({ latitude: z.number().default(0), longitude: z.number().default(0) }))
    .query(({ input }) => {
      const jd = julianDay(input.year, input.month, input.day, input.hour)
      const h = calcHouses(jd, input.latitude, input.longitude, 'P' as HouseSystem)
      const p = assignHouses(calcAllPlanets(jd, false), h)
      return mundaneContext(p)
    }),

  // ── Financial (Bradley) ─────────────────────────────────────────────
  bradley: protectedProcedure
    .input(z.object({ year: z.number().int() }))
    .query(({ input }) => bradleySiderograph(input.year)),

  // ── Composite (Synastry) ────────────────────────────────────────────
  synastry: protectedProcedure.input(twoCharts).query(async ({ input }) => {
    const [c1, c2] = await Promise.all([buildChart(input.chart1), buildChart(input.chart2)])
    return synastryAspects(c1, c2)
  }),
  composite: protectedProcedure.input(twoCharts).query(async ({ input }) => {
    const [c1, c2] = await Promise.all([buildChart(input.chart1), buildChart(input.chart2)])
    return compositeChart(c1, c2)
  }),

  // ── Report Generation ──────────────────────────────────────────────
  generateReport: protectedProcedure
    .input(birthInput.extend({ name: z.string().optional() }))
    .query(async ({ input }) => {
      const { generateNatalReport } =
        await import('../services/engines/swiss-ephemeris/report-generator')
      return generateNatalReport({ ...input, birthHour: input.birthHour } as Record<
        string,
        unknown
      >)
    }),

  // ── Horary & Electional ────────────────────────────────────────────
  horary: protectedProcedure
    .input(
      z.object({
        year: z.number(),
        month: z.number(),
        day: z.number(),
        hour: z.number(),
        latitude: z.number(),
        longitude: z.number(),
        questionHouse: z.number().min(1).max(12),
      }),
    )
    .query(async ({ input }) => {
      const { assessHoraryChart } = await import('../services/engines/swiss-ephemeris/horary')
      return assessHoraryChart(input as Record<string, unknown>)
    }),

  electional: protectedProcedure
    .input(
      z.object({
        year: z.number(),
        month: z.number(),
        day: z.number(),
        hour: z.number(),
        latitude: z.number(),
        longitude: z.number(),
        activityType: z
          .enum(['business', 'relationship', 'travel', 'medical', 'legal', 'creative', 'general'])
          .default('general'),
      }),
    )
    .query(async ({ input }) => {
      const { scoreElection } = await import('../services/engines/swiss-ephemeris/electional')
      return scoreElection(input as Record<string, unknown>)
    }),
})
