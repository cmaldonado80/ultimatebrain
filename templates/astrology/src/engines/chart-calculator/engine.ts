/**
 * Chart Calculator Engine
 *
 * Builds complete astrological charts (natal, synastry, transit, solar return,
 * secondary progressions) and generates textual summaries of chart highlights.
 *
 * Delegates raw ephemeris computation to EphemerisEngine. In production,
 * geocoding (place → lat/lon) would call a geocoding service.
 */

import {
  EphemerisEngine,
  PlanetaryPositions,
  PlanetName,
  HouseCusp,
  Aspect,
  ZodiacSign,
  PLANET_NAMES,
  ZODIAC_SIGNS,
  HouseSystem,
} from '../ephemeris/engine';

// ─── Supporting Types ──────────────────────────────────────────────────────────

/** A fully computed astrological chart */
export interface AstroChart {
  id:          string;
  label:       string;
  /** ISO date of birth / event */
  date:        string;
  /** Local time of birth / event */
  time:        string;
  /** Place name */
  place:       string;
  latitude:    number;
  longitude:   number;
  timezone:    string;
  /** Planetary positions keyed by planet name */
  planets:     PlanetaryPositions;
  /** 12 house cusps */
  houses:      HouseCusp[];
  /** All aspects between natal planets */
  aspects:     Aspect[];
  /** Ascendant notation, e.g. "22°05' Scorpio" */
  ascendant:   string;
  /** Midheaven (MC) notation, e.g. "14°33' Leo" */
  midheaven:   string;
  houseSystem: HouseSystem;
}

/** An inter-chart aspect in synastry */
export interface SynastryAspect {
  person1Planet: PlanetName;
  person2Planet: PlanetName;
  aspectType:    string;
  orb:           number;
  applying:      boolean;
  label:         string;
  /** Interpretive weight: 'major' for personal planets + outer planet aspects */
  weight:        'major' | 'minor';
}

/** Composite midpoint for synastry */
export interface CompositeMidpoint {
  planet:    PlanetName;
  longitude: number;
  notation:  string;
}

/** Full synastry analysis between two charts */
export interface SynastryAnalysis {
  chart1Label:    string;
  chart2Label:    string;
  interAspects:   SynastryAspect[];
  composites:     CompositeMidpoint[];
  /** Overall compatibility score 0–100 (weighted by aspect harmony) */
  harmonyScore:   number;
  summary:        string;
}

/** A transit chart overlay */
export interface TransitChart {
  baseChartLabel:    string;
  transitDate:       string;
  transitPositions:  PlanetaryPositions;
  transitToNatal:    Aspect[];
  /** Most significant active transit descriptions */
  highlights:        string[];
}

/** Secondary progression chart */
export interface ProgressionChart {
  baseChartLabel:    string;
  progressionDate:   string;
  /** Progressed planet positions */
  progressedPlanets: PlanetaryPositions;
  /** Progressed aspects to natal */
  aspects:           Aspect[];
  /** Progressed Ascendant notation */
  progressedAsc:     string;
  highlights:        string[];
}

/** Solar return chart */
export interface SolarReturnChart {
  baseChartLabel:      string;
  returnYear:          number;
  /** Approximate date of exact solar return */
  returnDate:          string;
  planets:             PlanetaryPositions;
  houses:              HouseCusp[];
  aspects:             Aspect[];
  ascendant:           string;
  midheaven:           string;
  themeHighlights:     string[];
}

/** High-level textual summary of chart features */
export interface ChartSummary {
  chartLabel:        string;
  dominantElement:   string;
  dominantModality:  string;
  dominantSign:      ZodiacSign;
  stelliums:         string[];   // signs/houses with 3+ planets
  strongestAspects:  string[];   // tightest orb aspects
  ascendantNote:     string;
  midheavenNote:     string;
  chartShapePattern: string;     // e.g. Splay, Bowl, Bundle, Locomotive
  highlights:        string[];
}

// ─── Config ────────────────────────────────────────────────────────────────────

export interface ChartCalculatorConfig {
  ephemeris?: EphemerisEngine;
  defaultHouseSystem?: HouseSystem;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const ELEMENT_MAP: Record<ZodiacSign, string> = {
  Aries:       'Fire',   Leo:         'Fire',   Sagittarius: 'Fire',
  Taurus:      'Earth',  Virgo:       'Earth',  Capricorn:   'Earth',
  Gemini:      'Air',    Libra:       'Air',    Aquarius:    'Air',
  Cancer:      'Water',  Scorpio:     'Water',  Pisces:      'Water',
};

const MODALITY_MAP: Record<ZodiacSign, string> = {
  Aries:       'Cardinal', Cancer:      'Cardinal', Libra:       'Cardinal', Capricorn:   'Cardinal',
  Taurus:      'Fixed',    Leo:         'Fixed',    Scorpio:     'Fixed',    Aquarius:    'Fixed',
  Gemini:      'Mutable',  Virgo:       'Mutable',  Sagittarius: 'Mutable',  Pisces:      'Mutable',
};

// Known city coordinates (stub geocoding table)
const CITY_COORDS: Record<string, { lat: number; lon: number; timezone: string }> = {
  'new york':      { lat: 40.7128,  lon: -74.0060,  timezone: 'America/New_York'     },
  'london':        { lat: 51.5074,  lon:  -0.1278,  timezone: 'Europe/London'         },
  'paris':         { lat: 48.8566,  lon:   2.3522,  timezone: 'Europe/Paris'          },
  'los angeles':   { lat: 34.0522,  lon: -118.2437, timezone: 'America/Los_Angeles'   },
  'tokyo':         { lat: 35.6762,  lon: 139.6503,  timezone: 'Asia/Tokyo'            },
  'sydney':        { lat: -33.8688, lon: 151.2093,  timezone: 'Australia/Sydney'      },
  'berlin':        { lat: 52.5200,  lon:  13.4050,  timezone: 'Europe/Berlin'         },
  'chicago':       { lat: 41.8781,  lon: -87.6298,  timezone: 'America/Chicago'       },
  'dubai':         { lat: 25.2048,  lon:  55.2708,  timezone: 'Asia/Dubai'            },
  'mumbai':        { lat: 19.0760,  lon:  72.8777,  timezone: 'Asia/Kolkata'          },
  'default':       { lat: 40.7128,  lon: -74.0060,  timezone: 'America/New_York'      },
};

function geocode(place: string): { lat: number; lon: number; timezone: string } {
  const key = place.toLowerCase().trim();
  for (const [city, coords] of Object.entries(CITY_COORDS)) {
    if (key.includes(city)) return coords;
  }
  return CITY_COORDS['default'];
}

function makeId(): string {
  return `chart_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── ChartCalculatorEngine ─────────────────────────────────────────────────────

export class ChartCalculatorEngine {
  private readonly ephemeris: EphemerisEngine;
  private readonly defaultHouseSystem: HouseSystem;

  constructor(config: ChartCalculatorConfig = {}) {
    this.ephemeris         = config.ephemeris ?? new EphemerisEngine();
    this.defaultHouseSystem = config.defaultHouseSystem ?? 'Placidus';
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /** Assign house numbers to planets given computed cusps */
  private assignHouses(planets: PlanetaryPositions, cusps: HouseCusp[]): PlanetaryPositions {
    const result = { ...planets } as PlanetaryPositions;
    for (const planet of PLANET_NAMES) {
      const lon = planets[planet].longitude;
      for (let i = 0; i < 12; i++) {
        const cuspLon     = cusps[i].longitude;
        const nextCuspLon = cusps[(i + 1) % 12].longitude;
        const inHouse     = nextCuspLon > cuspLon
          ? lon >= cuspLon && lon < nextCuspLon
          : lon >= cuspLon || lon < nextCuspLon;
        if (inHouse) {
          result[planet] = { ...result[planet], house: i + 1 };
          break;
        }
      }
    }
    return result;
  }

  /** Seeded rand helper */
  private rand(seed: number): number {
    const x = Math.sin(seed + 7) * 10_000;
    return x - Math.floor(x);
  }

  // ─── Public Methods ──────────────────────────────────────────────────────────

  /**
   * Compute a full natal chart.
   * @param birthDate  ISO date (YYYY-MM-DD)
   * @param birthTime  Local time (HH:MM or HH:MM:SS)
   * @param birthPlace City/country string (geocoded internally)
   */
  async calculateNatalChart(
    birthDate: string,
    birthTime: string,
    birthPlace: string,
  ): Promise<AstroChart> {
    const geo     = geocode(birthPlace);
    const planets = await this.ephemeris.getPlanetaryPositions(birthDate, birthTime, geo.timezone);
    const houses  = await this.ephemeris.getHouseCusps(birthDate, birthTime, geo.lat, geo.lon, this.defaultHouseSystem);
    const withHouses = this.assignHouses(planets, houses);
    const aspects = await this.ephemeris.getAspects(withHouses);

    const asc = houses[0];
    const mc  = houses[9]; // 10th house cusp = Midheaven

    return {
      id:          makeId(),
      label:       `Natal Chart — ${birthPlace} ${birthDate} ${birthTime}`,
      date:        birthDate,
      time:        birthTime,
      place:       birthPlace,
      latitude:    geo.lat,
      longitude:   geo.lon,
      timezone:    geo.timezone,
      planets:     withHouses,
      houses,
      aspects,
      ascendant:   asc.notation,
      midheaven:   mc.notation,
      houseSystem: this.defaultHouseSystem,
    };
  }

  /**
   * Compute synastry (inter-chart aspects + composite midpoints) between two charts.
   */
  async calculateSynastry(chart1: AstroChart, chart2: AstroChart): Promise<SynastryAnalysis> {
    const interAspects: SynastryAspect[] = [];
    const personalPlanets: PlanetName[] = ['sun', 'moon', 'mercury', 'venus', 'mars'];

    for (const p1 of PLANET_NAMES) {
      for (const p2 of PLANET_NAMES) {
        const lon1  = chart1.planets[p1].longitude;
        const lon2  = chart2.planets[p2].longitude;
        const diff  = Math.abs(lon1 - lon2) % 360;
        const angle = diff > 180 ? 360 - diff : diff;

        // Check each aspect type
        const orbs: Record<string, number> = {
          conjunction: 8, sextile: 6, square: 8, trine: 6, opposition: 8,
        };
        const exactAngles: Record<string, number> = {
          conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180,
        };

        for (const [type, exact] of Object.entries(exactAngles)) {
          const orb = Math.abs(angle - exact);
          if (orb <= orbs[type]) {
            const applying = (lon2 - lon1 + 360) % 360 < 180;
            const isPersonal1 = personalPlanets.includes(p1);
            const isPersonal2 = personalPlanets.includes(p2);

            interAspects.push({
              person1Planet: p1,
              person2Planet: p2,
              aspectType:    type,
              orb:           parseFloat(orb.toFixed(2)),
              applying,
              label:         `${chart1.label.split('—')[0].trim()} ${p1} ${type} ${chart2.label.split('—')[0].trim()} ${p2} (orb ${orb.toFixed(1)}°)`,
              weight:        isPersonal1 && isPersonal2 ? 'major' : 'minor',
            });
          }
        }
      }
    }

    // Composite midpoints: average of the two longitudes
    const composites: CompositeMidpoint[] = PLANET_NAMES.map((planet) => {
      const lon1    = chart1.planets[planet].longitude;
      const lon2    = chart2.planets[planet].longitude;
      let midLon    = (lon1 + lon2) / 2;
      // Handle wrap-around
      if (Math.abs(lon1 - lon2) > 180) midLon = (midLon + 180) % 360;
      const signIdx = Math.floor(midLon / 30);
      const deg     = Math.floor(midLon % 30);
      const min     = Math.round(((midLon % 30) - deg) * 60);
      const sign    = ZODIAC_SIGNS[signIdx];
      return {
        planet,
        longitude: parseFloat(midLon.toFixed(4)),
        notation:  `${deg}°${String(min).padStart(2, '0')}' ${sign}`,
      };
    });

    // Harmony score: harmonious aspects (trine/sextile/conjunction) vs tense (square/opposition)
    let score = 50;
    for (const a of interAspects) {
      const weight = a.weight === 'major' ? 3 : 1;
      if (['trine', 'sextile'].includes(a.aspectType)) score += weight * 2;
      else if (a.aspectType === 'conjunction')          score += weight;
      else if (['square', 'opposition'].includes(a.aspectType)) score -= weight;
    }
    const harmonyScore = Math.min(100, Math.max(0, score));

    const summary = harmonyScore >= 70
      ? `Strong compatibility. Multiple harmonious aspects between personal planets indicate natural rapport and shared values.`
      : harmonyScore >= 50
      ? `Moderate compatibility. A mix of harmonious and challenging aspects suggests a dynamic relationship with growth potential.`
      : `Challenging synastry. Significant tension aspects dominate. Growth is possible but requires conscious effort.`;

    return {
      chart1Label:  chart1.label,
      chart2Label:  chart2.label,
      interAspects: interAspects.sort((a, b) => a.orb - b.orb),
      composites,
      harmonyScore,
      summary,
    };
  }

  /**
   * Overlay current or future transit positions on a natal chart.
   */
  async calculateTransitChart(natalChart: AstroChart, date: string): Promise<TransitChart> {
    const transitPositions = await this.ephemeris.getPlanetaryPositions(date, '12:00', natalChart.timezone);
    const rawHits          = await this.ephemeris.getTransitsToNatal(natalChart.planets, date);

    // Convert TransitHit[] to Aspect[] shape for consistency
    const transitToNatal: Aspect[] = rawHits.map((hit) => ({
      planet1:   hit.transitPlanet,
      planet2:   hit.natalPlanet,
      type:      hit.aspectType,
      angle:     0, // not re-computed here
      orb:       hit.orb,
      maxOrb:    8,
      applying:  hit.applying,
      label:     hit.description,
    }));

    const highlights = rawHits
      .filter((h) => h.orb <= 2 || ['saturn', 'jupiter', 'pluto', 'neptune', 'uranus'].includes(h.transitPlanet))
      .slice(0, 6)
      .map((h) => h.description);

    return {
      baseChartLabel:   natalChart.label,
      transitDate:      date,
      transitPositions,
      transitToNatal,
      highlights,
    };
  }

  /**
   * Calculate the solar return chart for a given year.
   * The Sun returns to its exact natal longitude once per year.
   */
  async calculateSolarReturn(natalChart: AstroChart, year: number): Promise<SolarReturnChart> {
    // Approximate solar return date: natal birthday in the given year
    const [, month, day] = natalChart.date.split('-');
    const returnDate = `${year}-${month}-${day}`;
    const geo = geocode(natalChart.place);

    const planets = await this.ephemeris.getPlanetaryPositions(returnDate, natalChart.time, geo.timezone);
    const houses  = await this.ephemeris.getHouseCusps(returnDate, natalChart.time, geo.lat, geo.lon, this.defaultHouseSystem);
    const aspects = await this.ephemeris.getAspects(planets);

    const asc = houses[0];
    const mc  = houses[9];

    // Highlight themes: planets in angular houses (1, 4, 7, 10)
    const themeHighlights: string[] = [];
    for (const planet of PLANET_NAMES) {
      const pos = planets[planet];
      if (pos.house && [1, 4, 7, 10].includes(pos.house)) {
        themeHighlights.push(`${planet.charAt(0).toUpperCase() + planet.slice(1)} in the ${pos.house}th house emphasises ${planet === 'sun' ? 'identity and vitality' : planet === 'moon' ? 'emotional themes' : planet === 'saturn' ? 'responsibility and structure' : 'planetary themes'} this year.`);
      }
    }

    return {
      baseChartLabel:  natalChart.label,
      returnYear:      year,
      returnDate,
      planets,
      houses,
      aspects,
      ascendant:       asc.notation,
      midheaven:       mc.notation,
      themeHighlights: themeHighlights.slice(0, 4),
    };
  }

  /**
   * Calculate secondary progressions (1 day = 1 year).
   * @param natalChart Base natal chart
   * @param date       Target date to progress to (ISO)
   */
  async calculateProgressions(natalChart: AstroChart, date: string): Promise<ProgressionChart> {
    const birthJD    = new Date(natalChart.date).getTime() / 86_400_000;
    const targetJD   = new Date(date).getTime() / 86_400_000;
    // Each year of life = 1 day of ephemeris time
    const yearsElapsed = (targetJD - birthJD) / 365.25;
    const progDateObj  = new Date(natalChart.date);
    progDateObj.setUTCDate(progDateObj.getUTCDate() + Math.floor(yearsElapsed));
    const progressedDate = progDateObj.toISOString().split('T')[0];

    const progressedPlanets = await this.ephemeris.getPlanetaryPositions(progressedDate, natalChart.time, natalChart.timezone);
    const rawHits           = await this.ephemeris.getTransitsToNatal(natalChart.planets, progressedDate);

    const aspects: Aspect[] = rawHits.map((hit) => ({
      planet1:   hit.transitPlanet,
      planet2:   hit.natalPlanet,
      type:      hit.aspectType,
      angle:     0,
      orb:       hit.orb,
      maxOrb:    2, // progressions use tighter orbs (1–2°)
      applying:  hit.applying,
      label:     `Progressed ${hit.description}`,
    }));

    // Progressed Ascendant: advances ~1° per year
    const geo         = geocode(natalChart.place);
    const progHouses  = await this.ephemeris.getHouseCusps(progressedDate, natalChart.time, geo.lat, geo.lon);
    const progressedAsc = progHouses[0].notation;

    const highlights = aspects
      .filter((a) => a.orb <= 1)
      .slice(0, 5)
      .map((a) => a.label);

    return {
      baseChartLabel:    natalChart.label,
      progressionDate:   date,
      progressedPlanets,
      aspects,
      progressedAsc,
      highlights,
    };
  }

  /**
   * Generate a plain-text summary of chart highlights:
   * dominant element/modality, stelliums, strongest aspects, chart pattern.
   */
  async getChartSummary(chart: AstroChart): Promise<ChartSummary> {
    // Count element and modality distribution
    const elementCounts: Record<string, number>  = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
    const modalityCounts: Record<string, number> = { Cardinal: 0, Fixed: 0, Mutable: 0 };
    const signCounts: Partial<Record<ZodiacSign, number>> = {};

    for (const planet of PLANET_NAMES) {
      const sign = chart.planets[planet].sign;
      elementCounts[ELEMENT_MAP[sign]]++;
      modalityCounts[MODALITY_MAP[sign]]++;
      signCounts[sign] = (signCounts[sign] ?? 0) + 1;
    }

    const dominantElement  = Object.entries(elementCounts).sort((a, b) => b[1] - a[1])[0][0];
    const dominantModality = Object.entries(modalityCounts).sort((a, b) => b[1] - a[1])[0][0];
    const dominantSign     = (Object.entries(signCounts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0][0]) as ZodiacSign;

    // Stelliums: 3+ planets in same sign or house
    const stelliums: string[] = [];
    for (const [sign, count] of Object.entries(signCounts)) {
      if ((count ?? 0) >= 3) stelliums.push(`${sign} stellium (${count} planets)`);
    }
    const houseCounts: Record<number, number> = {};
    for (const planet of PLANET_NAMES) {
      const h = chart.planets[planet].house ?? 0;
      houseCounts[h] = (houseCounts[h] ?? 0) + 1;
    }
    for (const [house, count] of Object.entries(houseCounts)) {
      if (count >= 3) stelliums.push(`${house}th house stellium (${count} planets)`);
    }

    // Strongest (tightest orb) aspects
    const strongestAspects = chart.aspects
      .slice(0, 5)
      .map((a) => a.label);

    // Chart shape pattern (stub — based on spread of longitudes)
    const lons    = PLANET_NAMES.map((p) => chart.planets[p].longitude).sort((a, b) => a - b);
    const spread  = lons[lons.length - 1] - lons[0];
    let chartShapePattern: string;
    if      (spread < 120) chartShapePattern = 'Bundle — all planets within 120°, focused energy';
    else if (spread < 180) chartShapePattern = 'Bowl — planets in one hemisphere, driven toward a purpose';
    else if (spread < 240) chartShapePattern = 'Locomotive — strong leading planet, self-driving energy';
    else                   chartShapePattern = 'Splay — planets spread across the chart, versatile and independent';

    const ascSign = chart.houses[0].sign;
    const mcSign  = chart.houses[9].sign;

    return {
      chartLabel:        chart.label,
      dominantElement,
      dominantModality,
      dominantSign,
      stelliums,
      strongestAspects,
      ascendantNote:     `${ascSign} rising — ${ascSign === 'Aries' ? 'bold, direct first impression' : ascSign === 'Scorpio' ? 'magnetic, penetrating presence' : ascSign === 'Sagittarius' ? 'enthusiastic, philosophical outlook' : 'distinctive outward expression'}`,
      midheavenNote:     `Midheaven in ${mcSign} — career path coloured by ${mcSign === 'Capricorn' ? 'ambition, structure, and mastery' : mcSign === 'Leo' ? 'creativity, leadership, and visibility' : mcSign === 'Aquarius' ? 'innovation, humanitarian ideals' : 'the qualities of ' + mcSign}`,
      chartShapePattern,
      highlights: [
        `Dominant element: ${dominantElement} — ${dominantElement === 'Fire' ? 'enthusiasm and inspiration drive this chart' : dominantElement === 'Earth' ? 'practicality and material focus are paramount' : dominantElement === 'Air' ? 'intellect and social connection are key themes' : 'emotional depth and intuition permeate the chart'}`,
        `Dominant modality: ${dominantModality} — ${dominantModality === 'Cardinal' ? 'initiating and action-oriented' : dominantModality === 'Fixed' ? 'persevering and determined' : 'adaptable and versatile'}`,
        ...strongestAspects.slice(0, 3),
      ],
    };
  }
}
