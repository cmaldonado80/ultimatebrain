/**
 * Swiss Ephemeris Engine — barrel re-exports
 * 7 logical groups: Natal, Predictive, Synastry, Vedic, Rectification, Specialized, Report
 */

// ── 1. Natal Chart (core + patterns + dignities + lunar + classical + stars + analysis) ──
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
  calcPlanet,
  angleBetween,
  getHouseForLongitude,
  PLANET_LIST,
  SIGN_NAMES,
  SIGN_ABBREV,
  SIGN_ELEMENT,
  SIGN_MODE,
  FACE_RULERS,
  DOMICILE,
  EXALTATION,
  DETRIMENT,
  FALL,
  TRIPLICITY_RULERS,
  ASPECT_CONFIG,
  PLANET_IDS,
  SEFLG_SPEED,
  _swe,
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
export { findAspectPatterns } from './patterns'
export type { AspectPattern } from './patterns'
export { sectAnalysis, accidentalDignities, criticalDegrees, lillyDignityScore } from './accidental'
export type {
  SectAnalysis,
  AccidentalDignityResult,
  CriticalDegreeResult,
  LillyScoreResult,
} from './accidental'
export { solarCondition, calcArabicParts, planetaryHours } from './classical'
export type { SolarCondition, ArabicPart, PlanetaryHour } from './classical'
export { moonPhase, lunarMansion, prenatalLunations } from './lunar'
export type { MoonPhaseResult, LunarMansion, PrenatalLunation } from './lunar'
export { calcDeclinations, calcParallels } from './declinations'
export type { DeclinationResult, ParallelAspect } from './declinations'
export { dispositorChain } from './dispositors'
export type { DispositorChainResult } from './dispositors'
export { calcFixedStars, fixedStarConjunctions, sabianSymbol } from './fixed-stars'
export type { FixedStarPosition, StarConjunction, DegreeSymbol } from './fixed-stars'
export { calcAllMidpoints } from './midpoints'
export type { Midpoint } from './midpoints'
export { calcAntiscia } from './antiscia'
export type { AntisciaResult } from './antiscia'
export { calcDwads, calcNavamsa, calcDecanates } from './subdivisions'
export type { Subdivision } from './subdivisions'

// ── 2. Predictive & Timing ──────────────────────────────────────────────────
export { solarReturn, transitCalendar, annualProfections } from './predictive'
export type { TransitEvent, ProfectionResult } from './predictive'
export { lunarReturn, nodalReturn } from './returns'
export type { ReturnChart } from './returns'
export { secondaryProgressions, solarArcDirections, primaryDirections } from './progressions'
export type { ProgressedPosition, SolarArcPosition, PrimaryDirection } from './progressions'
export { firdaria, zodiacalReleasing, decennials } from './timelords'
export type { FirdariaPeriod, ZRPeriod, DecennialPeriod } from './timelords'
export { ageHarmonicChart, harmonicSpectrum } from './subdivisions'
export type { HarmonicPoint } from './subdivisions'

// ── 3. Synastry & Relationships ─────────────────────────────────────────────
export { synastryAspects, compositeChart } from './composite'
export { draconicChart } from './antiscia'
export type { DraconicResult } from './antiscia'

// ── 4. Vedic / Jyotish ─────────────────────────────────────────────────────
export { panchanga, vimshottariDasha } from './vedic'
export type { PanchangaResult, DashaPeriod } from './vedic'
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

// ── 5. Rectification ────────────────────────────────────────────────────────
export {
  trutineOfHermes,
  animodar,
  almutenFiguris,
  huberAgePoint,
  huberTimeline,
} from './rectification'
export type { TrutineResult, AnimodarResult, AlmutenResult, HuberAgePoint } from './rectification'

// ── 6. Specialized (Financial, Medical, Esoteric) ───────────────────────────
export { bradleySiderograph } from './financial'
export type { BradleyPoint } from './financial'
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
export { heliocentricPositions } from './antiscia'

// ── 7. Report Generation ────────────────────────────────────────────────────
export { generateNatalReport } from './report-generator'
export type { NatalReport, ReportSection } from './report-generator'
