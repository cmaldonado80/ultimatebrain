/**
 * Swiss Ephemeris Engine — barrel re-exports
 * 7 logical groups: Natal, Predictive, Synastry, Vedic, Rectification, Specialized, Report
 */

// ── 1. Natal Chart (core + patterns + dignities + lunar + classical + stars + analysis) ──
export type {
  AccidentalDignityResult,
  CriticalDegreeResult,
  LillyScoreResult,
  SectAnalysis,
} from './accidental'
export { accidentalDignities, criticalDegrees, lillyDignityScore, sectAnalysis } from './accidental'
export type { AntisciaResult } from './antiscia'
export { calcAntiscia } from './antiscia'
export type { ArabicPart, PlanetaryHour, SolarCondition } from './classical'
export { calcArabicParts, planetaryHours, solarCondition } from './classical'
export type { DeclinationResult, ParallelAspect } from './declinations'
export { calcDeclinations, calcParallels } from './declinations'
export type { DispositorChainResult } from './dispositors'
export { dispositorChain } from './dispositors'
export type {
  Aspect,
  AspectType,
  Dignity,
  EngineResult,
  HouseCusps,
  HouseSystem,
  NatalChart,
  Planet,
  Position,
  SwissEphemerisInput,
  ZodiacSign,
} from './engine'
export {
  _swe,
  angleBetween,
  ASPECT_CONFIG,
  assessAllDignities,
  assignHouses,
  calcAllPlanets,
  calcAspects,
  calcHouses,
  calcPlanet,
  DETRIMENT,
  DOMICILE,
  EXALTATION,
  FACE_RULERS,
  FALL,
  getHouseForLongitude,
  isAvailable,
  julianDay,
  longitudeToSign,
  PLANET_IDS,
  PLANET_LIST,
  run,
  SEFLG_SPEED,
  SIGN_ABBREV,
  SIGN_ELEMENT,
  SIGN_MODE,
  SIGN_NAMES,
  TRIPLICITY_RULERS,
} from './engine'
export type { DegreeSymbol, FixedStarPosition, StarConjunction } from './fixed-stars'
export { calcFixedStars, fixedStarConjunctions, sabianSymbol } from './fixed-stars'
export type { LunarMansion, MoonPhaseResult, PrenatalLunation } from './lunar'
export { lunarMansion, moonPhase, prenatalLunations } from './lunar'
export type { Midpoint } from './midpoints'
export { calcAllMidpoints } from './midpoints'
export type { AspectPattern } from './patterns'
export { findAspectPatterns } from './patterns'
export type { Subdivision } from './subdivisions'
export { calcDecanates, calcDwads, calcNavamsa } from './subdivisions'

// ── 2. Predictive & Timing ──────────────────────────────────────────────────
export type { ProfectionResult, TransitEvent } from './predictive'
export { annualProfections, solarReturn, transitCalendar } from './predictive'
export type { PrimaryDirection, ProgressedPosition, SolarArcPosition } from './progressions'
export { primaryDirections, secondaryProgressions, solarArcDirections } from './progressions'
export type { ReturnChart } from './returns'
export { lunarReturn, nodalReturn } from './returns'
export type { HarmonicPoint } from './subdivisions'
export { ageHarmonicChart, harmonicSpectrum } from './subdivisions'
export type { DecennialPeriod, FirdariaPeriod, ZRPeriod } from './timelords'
export { decennials, firdaria, zodiacalReleasing } from './timelords'

// ── 3. Synastry & Relationships ─────────────────────────────────────────────
export type { DraconicResult } from './antiscia'
export { draconicChart } from './antiscia'
export { compositeChart, synastryAspects } from './composite'

// ── 4. Vedic / Jyotish ─────────────────────────────────────────────────────
export type { DashaPeriod, PanchangaResult } from './vedic'
export { panchanga, vimshottariDasha } from './vedic'
export type {
  AshtakavargaResult,
  CharaKaraka,
  MuhurtaResult,
  ShadbalaResult,
  VargaPosition,
} from './vedic-advanced'
export {
  allVargaCharts,
  ashtakavarga,
  charaKarakas,
  divisionalChart,
  muhurtaScore,
  shadbala,
} from './vedic-advanced'

// ── 5. Rectification ────────────────────────────────────────────────────────
export type { AlmutenResult, AnimodarResult, HuberAgePoint, TrutineResult } from './rectification'
export {
  almutenFiguris,
  animodar,
  huberAgePoint,
  huberTimeline,
  trutineOfHermes,
} from './rectification'

// ── 6. Specialized (Financial, Medical, Esoteric) ───────────────────────────
export { heliocentricPositions } from './antiscia'
export type {
  BodyPartMapping,
  FinancialCycle,
  GardenDay,
  HumoralBalance,
  MedicalVulnerability,
  MundaneContext,
  RayAnalysis,
} from './esoteric'
export {
  agriculturalCalendar,
  financialCycles,
  medicalAstrology,
  mundaneContext,
  RAY_NAMES,
  sevenRays,
} from './esoteric'
export type { BradleyPoint } from './financial'
export { bradleySiderograph } from './financial'

// ── 7. Report Generation ────────────────────────────────────────────────────
export type { NatalReport, ReportSection } from './report-generator'
export { generateNatalReport } from './report-generator'
