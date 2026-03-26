/**
 * Swiss Ephemeris Engine — barrel re-exports
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
