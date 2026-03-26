/**
 * Swiss Ephemeris Engine — barrel re-exports
 * 22 module files, 53 report sections, ~7,000 lines
 */

// Core engine
export {
  run,
  isAvailable,
  julianDay,
  calcAllPlanets,
  calcHouses,
  assignHouses,
  calcAspects,
  assessAllDignities,
  longitudeToSign,
  PLANET_LIST,
  SIGN_NAMES,
  SIGN_ABBREV,
} from './engine'
export type {
  Planet,
  HouseSystem,
  ZodiacSign,
  AspectType,
  Position,
  HouseCusps,
  Aspect,
  Dignity,
  NatalChart,
  SwissEphemerisInput,
  EngineResult,
} from './engine'

// Patterns
export { findAspectPatterns } from './patterns'
export type { AspectPattern } from './patterns'

// Predictive
export { solarReturn, transitCalendar, annualProfections } from './predictive'
export type { TransitEvent, ProfectionResult } from './predictive'

// Vedic
export { panchanga, vimshottariDasha } from './vedic'
export type { PanchangaResult, DashaPeriod } from './vedic'

// Composite
export { synastryAspects, compositeChart } from './composite'

// Classical
export { solarCondition, calcArabicParts, planetaryHours } from './classical'
export type { SolarCondition, ArabicPart, PlanetaryHour } from './classical'

// Midpoints
export { calcAllMidpoints } from './midpoints'
export type { Midpoint } from './midpoints'

// Financial
export { bradleySiderograph } from './financial'
export type { BradleyPoint } from './financial'

// ── New modules ──────────────────────────────────────────────────────────

// Lunar
export { moonPhase, lunarMansion, prenatalLunations } from './lunar'
export type { MoonPhaseResult, LunarMansion, PrenatalLunation } from './lunar'

// Declinations
export { calcDeclinations, calcParallels } from './declinations'
export type { DeclinationResult, ParallelAspect } from './declinations'

// Dispositors
export { dispositorChain } from './dispositors'
export type { DispositorChainResult } from './dispositors'

// Accidental Dignities & Sect
export { sectAnalysis, accidentalDignities, criticalDegrees, lillyDignityScore } from './accidental'
export type {
  SectAnalysis,
  AccidentalDignityResult,
  CriticalDegreeResult,
  LillyScoreResult,
} from './accidental'

// Subdivisions & Harmonics
export {
  calcDwads,
  calcNavamsa,
  calcDecanates,
  ageHarmonicChart,
  harmonicSpectrum,
} from './subdivisions'
export type { Subdivision, HarmonicPoint } from './subdivisions'

// Antiscia & Draconic
export { calcAntiscia, draconicChart, heliocentricPositions } from './antiscia'
export type { AntisciaResult, DraconicResult } from './antiscia'

// Fixed Stars & Degree Symbols
export { calcFixedStars, fixedStarConjunctions, sabianSymbol } from './fixed-stars'
export type { FixedStarPosition, StarConjunction, DegreeSymbol } from './fixed-stars'

// Progressions & Directions
export { secondaryProgressions, solarArcDirections, primaryDirections } from './progressions'
export type { ProgressedPosition, SolarArcPosition, PrimaryDirection } from './progressions'

// Time Lords
export { firdaria, zodiacalReleasing, decennials } from './timelords'
export type { FirdariaPeriod, ZRPeriod, DecennialPeriod } from './timelords'

// Returns
export { lunarReturn, nodalReturn } from './returns'
export type { ReturnChart } from './returns'

// Vedic Advanced
export {
  divisionalChart,
  allVargaCharts,
  shadbala,
  ashtakavarga,
  charaKarakas,
  muhurtaScore,
} from './vedic-advanced'
export type {
  VargaPosition,
  ShadbalaResult,
  AshtakavargaResult,
  CharaKaraka,
  MuhurtaResult,
} from './vedic-advanced'

// Rectification
export {
  trutineOfHermes,
  animodar,
  almutenFiguris,
  huberAgePoint,
  huberTimeline,
} from './rectification'
export type { TrutineResult, AnimodarResult, AlmutenResult, HuberAgePoint } from './rectification'

// Esoteric & Specialized
export {
  sevenRays,
  medicalAstrology,
  financialCycles,
  agriculturalCalendar,
  mundaneContext,
  RAY_NAMES,
} from './esoteric'
export type {
  RayAnalysis,
  BodyPartMapping,
  HumoralBalance,
  MedicalVulnerability,
  FinancialCycle,
  GardenDay,
  MundaneContext,
} from './esoteric'
