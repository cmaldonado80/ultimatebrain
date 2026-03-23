/**
 * Swiss Ephemeris Engine
 *
 * Provides planetary positions, house cusps, aspect calculations, transit
 * tracking, and retrograde period detection. Uses the Swiss Ephemeris
 * computational model; returns mock/stub data with realistic astrological
 * values for development and testing.
 *
 * Production integration: replace the private computation stubs with calls
 * to the swisseph npm package or a REST wrapper around the C library.
 */

// ─── Constants ─────────────────────────────────────────────────────────────────

export const ZODIAC_SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;

export type ZodiacSign = typeof ZODIAC_SIGNS[number];

export const PLANET_GLYPHS: Record<PlanetName, string> = {
  sun:     '☉',
  moon:    '☽',
  mercury: '☿',
  venus:   '♀',
  mars:    '♂',
  jupiter: '♃',
  saturn:  '♄',
  uranus:  '♅',
  neptune: '♆',
  pluto:   '♇',
};

export const PLANET_NAMES = [
  'sun', 'moon', 'mercury', 'venus', 'mars',
  'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
] as const;

export type PlanetName = typeof PLANET_NAMES[number];

export const ASPECT_TYPES = [
  'conjunction', 'sextile', 'square', 'trine', 'opposition',
] as const;

export type AspectType = typeof ASPECT_TYPES[number];

/** Standard orb allowances in degrees */
export const ASPECT_ORBS: Record<AspectType, number> = {
  conjunction: 8,
  sextile:     6,
  square:      8,
  trine:       6,
  opposition:  8,
};

/** Exact angular separation for each aspect type */
const ASPECT_ANGLES: Record<AspectType, number> = {
  conjunction:  0,
  sextile:     60,
  square:      90,
  trine:      120,
  opposition: 180,
};

export const HOUSE_SYSTEMS = ['Placidus', 'Koch', 'Equal', 'WholeSign', 'Campanus', 'Regiomontanus'] as const;
export type HouseSystem = typeof HOUSE_SYSTEMS[number];

// ─── Supporting Types ──────────────────────────────────────────────────────────

/** Full planetary position in a chart */
export interface PlanetaryPosition {
  planet:     PlanetName;
  glyph:      string;
  /** Zodiac sign */
  sign:       ZodiacSign;
  /** Degree within the sign (0–29) */
  degree:     number;
  /** Minute within the degree (0–59) */
  minute:     number;
  /** Formatted notation, e.g. "15°42' Aries" */
  notation:   string;
  /** Absolute ecliptic longitude (0–360°) */
  longitude:  number;
  /** Whether planet is in apparent retrograde motion */
  retrograde: boolean;
  /** House number the planet occupies (1–12), populated after house calculation */
  house?:     number;
}

/** Map of planet name → position */
export type PlanetaryPositions = Record<PlanetName, PlanetaryPosition>;

/** A single house cusp */
export interface HouseCusp {
  /** House number 1–12 */
  house:     number;
  sign:      ZodiacSign;
  degree:    number;
  minute:    number;
  notation:  string;
  longitude: number;
}

/** An aspect between two planets */
export interface Aspect {
  planet1:   PlanetName;
  planet2:   PlanetName;
  type:      AspectType;
  /** Angle between planets (0–180) */
  angle:     number;
  /** Orb deviation from exact (degrees) */
  orb:       number;
  /** Maximum allowed orb for this aspect type */
  maxOrb:    number;
  /** true = closing toward exactness; false = separating */
  applying:  boolean;
  /** Formatted description, e.g. "Sun trine Moon (orb 2°18')" */
  label:     string;
}

/** A transit hitting a natal planet */
export interface TransitHit {
  transitPlanet: PlanetName;
  natalPlanet:   PlanetName;
  aspectType:    AspectType;
  orb:           number;
  applying:      boolean;
  exactDate:     string; // ISO date
  description:   string;
}

/** A retrograde period for a planet */
export interface RetrogradePeriod {
  planet:         PlanetName;
  /** Date planet stations retrograde */
  stationRx:      string; // ISO date
  /** Date planet stations direct */
  stationDirect:  string; // ISO date
  /** Sign at station retrograde */
  rxSign:         ZodiacSign;
  /** Sign at station direct */
  directSign:     ZodiacSign;
  /** Degree at station retrograde */
  rxDegree:       number;
}

// ─── Config ────────────────────────────────────────────────────────────────────

export interface EphemerisEngineConfig {
  /** Default house system when none is specified */
  defaultHouseSystem?: HouseSystem;
}

// ─── EphemerisEngine ───────────────────────────────────────────────────────────

export class EphemerisEngine {
  private readonly defaultHouseSystem: HouseSystem;

  constructor(private readonly config: EphemerisEngineConfig = {}) {
    this.defaultHouseSystem = config.defaultHouseSystem ?? 'Placidus';
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /** Seeded deterministic pseudo-random, returns 0–1 */
  private rand(seed: number): number {
    const x = Math.sin(seed + 1) * 10_000;
    return x - Math.floor(x);
  }

  /** Convert date + optional time string to a numeric Julian Day Number seed */
  private dateSeed(date: string, time?: string): number {
    const d = new Date(`${date}T${time ?? '12:00:00'}Z`);
    return d.getTime() / 86_400_000; // days since epoch
  }

  /** Convert absolute longitude (0–360) to sign + degree + minute */
  private longitudeToPosition(lon: number): { sign: ZodiacSign; degree: number; minute: number; notation: string } {
    const normalised = ((lon % 360) + 360) % 360;
    const signIndex  = Math.floor(normalised / 30);
    const withinSign = normalised - signIndex * 30;
    const degree     = Math.floor(withinSign);
    const minute     = Math.round((withinSign - degree) * 60);
    const sign       = ZODIAC_SIGNS[signIndex];
    const notation   = `${degree}°${String(minute).padStart(2, '0')}' ${sign}`;
    return { sign, degree, minute, notation };
  }

  /**
   * Compute a seeded ecliptic longitude for a planet on a given JD.
   * In production this would call swisseph.calc_ut().
   */
  private computeLongitude(planet: PlanetName, jd: number): number {
    // Each planet has a unique mean angular velocity (deg/day) and epoch offset
    const meanMotion: Record<PlanetName, number> = {
      sun:      0.9856,
      moon:     13.1763,
      mercury:  4.0923,
      venus:    1.6021,
      mars:     0.5240,
      jupiter:  0.0831,
      saturn:   0.0335,
      uranus:   0.0117,
      neptune:  0.0060,
      pluto:    0.0040,
    };
    const epochOffset: Record<PlanetName, number> = {
      sun:     280.46,
      moon:     218.32,
      mercury: 252.25,
      venus:   181.98,
      mars:    355.45,
      jupiter:  34.40,
      saturn:   50.08,
      uranus:  314.05,
      neptune: 304.35,
      pluto:   238.93,
    };
    const raw = (epochOffset[planet] + meanMotion[planet] * jd) % 360;
    return ((raw % 360) + 360) % 360;
  }

  /** Determine whether a planet is retrograde on a given JD (stub). */
  private isRetrograde(planet: PlanetName, jd: number): boolean {
    // Fast outer planets are retrograde ~42 % of the year; inner planets ~19 %
    const rxFrequency: Partial<Record<PlanetName, number>> = {
      mercury: 0.19, venus: 0.07, mars: 0.09,
      jupiter: 0.30, saturn: 0.36, uranus: 0.40,
      neptune: 0.42, pluto: 0.43,
    };
    const freq = rxFrequency[planet];
    if (!freq) return false; // Sun and Moon never retrograde
    return this.rand(jd * PLANET_NAMES.indexOf(planet) + 17) < freq;
  }

  /** Compute angle between two ecliptic longitudes (0–180) */
  private angleBetween(lon1: number, lon2: number): number {
    const diff = Math.abs(lon1 - lon2) % 360;
    return diff > 180 ? 360 - diff : diff;
  }

  /** Determine aspect type from angular separation, or null if none within orb */
  private classifyAspect(angle: number): { type: AspectType; orb: number } | null {
    for (const [type, exact] of Object.entries(ASPECT_ANGLES) as Array<[AspectType, number]>) {
      const orb = Math.abs(angle - exact);
      if (orb <= ASPECT_ORBS[type]) {
        return { type, orb: parseFloat(orb.toFixed(2)) };
      }
    }
    return null;
  }

  // ─── Public Methods ──────────────────────────────────────────────────────────

  /**
   * Get planetary positions for a given date/time.
   * @param date     ISO date string (YYYY-MM-DD)
   * @param time     Local time string (HH:MM or HH:MM:SS)
   * @param timezone IANA timezone identifier (informational; UTC assumed for stub)
   */
  async getPlanetaryPositions(
    date: string,
    time?: string,
    timezone?: string,
  ): Promise<PlanetaryPositions> {
    const jd = this.dateSeed(date, time);
    const result = {} as PlanetaryPositions;

    for (const planet of PLANET_NAMES) {
      const longitude  = this.computeLongitude(planet, jd);
      const retrograde = this.isRetrograde(planet, jd);
      const pos        = this.longitudeToPosition(longitude);
      result[planet]   = {
        planet,
        glyph:    PLANET_GLYPHS[planet],
        ...pos,
        longitude: parseFloat(longitude.toFixed(4)),
        retrograde,
      };
    }

    return result;
  }

  /**
   * Calculate the 12 house cusps using the specified house system.
   * @param date      ISO date string
   * @param time      Local time (HH:MM or HH:MM:SS)
   * @param latitude  Geographic latitude in decimal degrees (N positive)
   * @param longitude Geographic longitude in decimal degrees (E positive)
   * @param system    House system (default: Placidus)
   */
  async getHouseCusps(
    date: string,
    time: string,
    latitude: number,
    longitude: number,
    system: HouseSystem = this.defaultHouseSystem,
  ): Promise<HouseCusp[]> {
    const jd   = this.dateSeed(date, time);
    // Ascendant longitude is derived from sidereal time + latitude (stub)
    const lst  = (jd * 360.985647) % 360;                // local sidereal angle
    const asc  = ((lst + longitude + latitude * 0.5) % 360 + 360) % 360;

    const cusps: HouseCusp[] = [];
    for (let h = 1; h <= 12; h++) {
      // Placidus-style spacing (equal 30° in stub)
      const offset = system === 'Equal' || system === 'WholeSign' ? 30 : 30;
      const lon    = (asc + (h - 1) * offset) % 360;
      const pos    = this.longitudeToPosition(lon);
      cusps.push({ house: h, ...pos, longitude: parseFloat(lon.toFixed(4)) });
    }

    return cusps;
  }

  /**
   * Derive all applying and separating aspects from a set of planetary positions.
   * Uses standard orbs: conjunction/square/opposition 8°, trine/sextile 6°.
   */
  async getAspects(positions: PlanetaryPositions): Promise<Aspect[]> {
    const aspects: Aspect[] = [];
    const planets = PLANET_NAMES;

    for (let i = 0; i < planets.length; i++) {
      for (let j = i + 1; j < planets.length; j++) {
        const p1  = planets[i];
        const p2  = planets[j];
        const lon1 = positions[p1].longitude;
        const lon2 = positions[p2].longitude;
        const angle = this.angleBetween(lon1, lon2);
        const match = this.classifyAspect(angle);
        if (!match) continue;

        const orbMin = Math.round((match.orb % 1) * 60);
        const orbDeg = Math.floor(match.orb);
        const label  = `${positions[p1].glyph} ${p1} ${match.type} ${positions[p2].glyph} ${p2} (orb ${orbDeg}°${String(orbMin).padStart(2, '0')}')`;

        // Applying = p1 moving toward exact aspect with p2 (stub: longitude difference closing)
        const applying = (lon2 - lon1 + 360) % 360 < 180;

        aspects.push({
          planet1:  p1,
          planet2:  p2,
          type:     match.type,
          angle:    parseFloat(angle.toFixed(4)),
          orb:      match.orb,
          maxOrb:   ASPECT_ORBS[match.type],
          applying,
          label,
        });
      }
    }

    // Sort by orb tightness (most exact first)
    return aspects.sort((a, b) => a.orb - b.orb);
  }

  /**
   * Return current (today's) planetary positions.
   */
  async getCurrentTransits(): Promise<PlanetaryPositions> {
    const today = new Date().toISOString().split('T')[0];
    const now   = `${new Date().getUTCHours().toString().padStart(2, '0')}:${new Date().getUTCMinutes().toString().padStart(2, '0')}`;
    return this.getPlanetaryPositions(today, now, 'UTC');
  }

  /**
   * Find transiting planets that form aspects to natal planet positions on `date`.
   * @param natalPositions Natal chart planetary positions
   * @param date           Date to compute transits for (ISO date)
   */
  async getTransitsToNatal(
    natalPositions: PlanetaryPositions,
    date: string,
  ): Promise<TransitHit[]> {
    const transitPositions = await this.getPlanetaryPositions(date, '12:00');
    const hits: TransitHit[] = [];

    for (const transitPlanet of PLANET_NAMES) {
      for (const natalPlanet of PLANET_NAMES) {
        const tLon = transitPositions[transitPlanet].longitude;
        const nLon = natalPositions[natalPlanet].longitude;
        const angle = this.angleBetween(tLon, nLon);
        const match = this.classifyAspect(angle);
        if (!match) continue;

        const applying   = (nLon - tLon + 360) % 360 < 180;
        // Rough estimate: exactness arrives in ~orb / daily motion days
        const dailyMotion: Record<PlanetName, number> = {
          sun: 0.99, moon: 13.18, mercury: 1.38, venus: 1.20, mars: 0.52,
          jupiter: 0.08, saturn: 0.03, uranus: 0.01, neptune: 0.006, pluto: 0.004,
        };
        const daysToExact = Math.round(match.orb / (dailyMotion[transitPlanet] || 0.01));
        const exactDateObj = new Date(date);
        exactDateObj.setUTCDate(exactDateObj.getUTCDate() + (applying ? daysToExact : -daysToExact));
        const exactDate = exactDateObj.toISOString().split('T')[0];

        hits.push({
          transitPlanet,
          natalPlanet,
          aspectType: match.type,
          orb:        match.orb,
          applying,
          exactDate,
          description: `Transiting ${transitPlanet} (${transitPositions[transitPlanet].notation}) ${match.type} natal ${natalPlanet} (${natalPositions[natalPlanet].notation}) — orb ${match.orb}°`,
        });
      }
    }

    return hits.sort((a, b) => a.orb - b.orb);
  }

  /**
   * Return all retrograde periods for major planets within a date range.
   * Outer planets (Jupiter–Pluto) retrograde annually; inner planets less frequently.
   */
  async getRetrogrades(startDate: string, endDate: string): Promise<RetrogradePeriod[]> {
    const start = new Date(startDate);
    const end   = new Date(endDate);

    // Known 2026 retrograde periods (stub data — replace with live ephemeris)
    const RETROGRADES_2026: RetrogradePeriod[] = [
      { planet: 'mercury', stationRx: '2026-01-25', stationDirect: '2026-02-16', rxSign: 'Aquarius',    directSign: 'Aquarius',    rxDegree: 21 },
      { planet: 'mercury', stationRx: '2026-05-20', stationDirect: '2026-06-13', rxSign: 'Gemini',      directSign: 'Gemini',      rxDegree: 15 },
      { planet: 'mercury', stationRx: '2026-09-17', stationDirect: '2026-10-09', rxSign: 'Libra',       directSign: 'Virgo',       rxDegree: 15 },
      { planet: 'venus',   stationRx: '2026-07-23', stationDirect: '2026-09-04', rxSign: 'Virgo',       directSign: 'Leo',         rxDegree: 3  },
      { planet: 'mars',    stationRx: '2026-11-10', stationDirect: '2027-01-21', rxSign: 'Gemini',      directSign: 'Taurus',      rxDegree:  7 },
      { planet: 'jupiter', stationRx: '2026-03-10', stationDirect: '2026-07-01', rxSign: 'Gemini',      directSign: 'Gemini',      rxDegree: 24 },
      { planet: 'saturn',  stationRx: '2026-06-26', stationDirect: '2026-11-14', rxSign: 'Aries',       directSign: 'Aries',       rxDegree: 21 },
      { planet: 'uranus',  stationRx: '2026-09-06', stationDirect: '2027-01-30', rxSign: 'Gemini',      directSign: 'Taurus',      rxDegree:  1 },
      { planet: 'neptune', stationRx: '2026-06-28', stationDirect: '2026-12-03', rxSign: 'Aries',       directSign: 'Pisces',      rxDegree:  2 },
      { planet: 'pluto',   stationRx: '2026-05-03', stationDirect: '2026-10-10', rxSign: 'Aquarius',    directSign: 'Aquarius',    rxDegree:  7 },
    ];

    return RETROGRADES_2026.filter((rx) => {
      const rxDate  = new Date(rx.stationRx);
      const dirDate = new Date(rx.stationDirect);
      // Include if any part of the retrograde period overlaps with requested range
      return rxDate <= end && dirDate >= start;
    });
  }
}
