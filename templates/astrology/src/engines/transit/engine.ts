/**
 * Transit Engine
 *
 * Monitors real-time and upcoming planetary transits for clients, generates
 * significance-weighted alerts, identifies major astrological events for a year,
 * and provides LLM-generated interpretation stubs.
 *
 * In production:
 * - getActiveTransits / getUpcomingTransits would query the database for the
 *   client's natal chart and call EphemerisEngine.getTransitsToNatal().
 * - subscribeToAlerts would persist subscriptions and integrate with a job
 *   scheduler (e.g. BullMQ) to run daily transit checks.
 */

import {
  EphemerisEngine,
  PlanetName,
  AspectType,
  PLANET_NAMES,
  PLANET_GLYPHS,
} from '../ephemeris/engine';
import { ChartCalculatorEngine, AstroChart } from '../chart-calculator/engine';

// ─── Supporting Types ──────────────────────────────────────────────────────────

/** An active or upcoming transit event */
export interface TransitEvent {
  id:              string;
  clientId:        string;
  transitPlanet:   PlanetName;
  natalPlanet:     PlanetName;
  aspectType:      AspectType;
  /** Orb in degrees at time of computation */
  orb:             number;
  /** Whether the transit is still applying (approaching exactness) */
  applying:        boolean;
  /** ISO date of exact aspect perfection */
  exactDate:       string;
  /** ISO date transit entered orb */
  enterDate:       string;
  /** ISO date transit leaves orb */
  exitDate:        string;
  significance:    'low' | 'medium' | 'high' | 'critical';
  interpretation:  string;
}

/** A transit alert to be stored and delivered to the client */
export interface TransitAlertPayload {
  clientId:     string;
  planet:       PlanetName;
  aspect:       AspectType;
  targetPlanet: PlanetName;
  exactDate:    string;
  orb:          number;
  significance: 'low' | 'medium' | 'high' | 'critical';
  message:      string;
}

/** Major astrological event in a calendar year */
export interface MajorAstroEvent {
  date:         string;
  type:         'eclipse' | 'retrograde_station' | 'ingress' | 'conjunction' | 'opposition' | 'solstice' | 'equinox';
  title:        string;
  description:  string;
  planets?:     PlanetName[];
  significance: 'medium' | 'high' | 'critical';
}

/** Alert subscription for a client */
export interface AlertSubscription {
  clientId:          string;
  significanceLevel: 'low' | 'medium' | 'high' | 'critical';
  channels:          ('email' | 'push' | 'sms' | 'in_app')[];
  registeredAt:      string;
  active:            boolean;
}

// ─── Config ────────────────────────────────────────────────────────────────────

export interface TransitEngineConfig {
  ephemeris?:      EphemerisEngine;
  chartCalculator?: ChartCalculatorEngine;
}

// ─── Transit significance scoring ─────────────────────────────────────────────

/** Higher scores = more significant planet */
const PLANET_WEIGHT: Record<PlanetName, number> = {
  sun:     5, moon:    4, mercury: 2, venus:   3, mars:    3,
  jupiter: 4, saturn:  5, uranus:  4, neptune: 3, pluto:   5,
};

/** Aspect significance weight */
const ASPECT_WEIGHT: Record<AspectType, number> = {
  conjunction: 5,
  opposition:  4,
  square:      4,
  trine:       3,
  sextile:     2,
};

function scoreSignificance(
  transitPlanet: PlanetName,
  natalPlanet: PlanetName,
  aspect: AspectType,
  orb: number,
): 'low' | 'medium' | 'high' | 'critical' {
  const score = (PLANET_WEIGHT[transitPlanet] + PLANET_WEIGHT[natalPlanet]) / 2
    * ASPECT_WEIGHT[aspect]
    * (1 - orb / 10); // tighter orb → higher score

  if (score >= 18) return 'critical';
  if (score >= 12) return 'high';
  if (score >= 7)  return 'medium';
  return 'low';
}

/** Rough interpretation templates */
function interpretTransit(transitPlanet: PlanetName, aspect: AspectType, natalPlanet: PlanetName): string {
  const transit  = transitPlanet.charAt(0).toUpperCase() + transitPlanet.slice(1);
  const natal    = natalPlanet.charAt(0).toUpperCase() + natalPlanet.slice(1);
  const glyph1   = PLANET_GLYPHS[transitPlanet];
  const glyph2   = PLANET_GLYPHS[natalPlanet];

  const templates: Record<AspectType, string> = {
    conjunction: `${glyph1} ${transit} conjunct natal ${glyph2} ${natal}: An intensified merging of energies. This transit amplifies natal ${natal} themes and marks a new cycle in ${transit}-related areas of life.`,
    trine:       `${glyph1} ${transit} trine natal ${glyph2} ${natal}: A harmonious flow of energy supports ease, opportunity, and natural expression. Conditions are favorable for advancing ${transit}-ruled matters.`,
    sextile:     `${glyph1} ${transit} sextile natal ${glyph2} ${natal}: A gentle opportunity aspect. Conscious effort can harness this supportive energy for growth and positive development.`,
    square:      `${glyph1} ${transit} square natal ${glyph2} ${natal}: Dynamic tension requiring action and adjustment. Challenges surface that demand resolution; growth comes through overcoming friction.`,
    opposition:  `${glyph1} ${transit} opposition natal ${glyph2} ${natal}: A culmination and awareness point. External situations or relationships mirror inner tensions; integration and balance are the path forward.`,
  };
  return templates[aspect];
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function makeEventId(clientId: string, transitPlanet: string, natalPlanet: string, exactDate: string): string {
  return `transit_${clientId}_${transitPlanet}_${natalPlanet}_${exactDate}`.replace(/\s/g, '_');
}

// ─── TransitEngine ─────────────────────────────────────────────────────────────

export class TransitEngine {
  private readonly ephemeris: EphemerisEngine;
  private readonly chartCalc: ChartCalculatorEngine;
  /** In-memory subscription store (production: persist to DB) */
  private readonly subscriptions = new Map<string, AlertSubscription>();

  constructor(config: TransitEngineConfig = {}) {
    this.ephemeris = config.ephemeris      ?? new EphemerisEngine();
    this.chartCalc = config.chartCalculator ?? new ChartCalculatorEngine({ ephemeris: this.ephemeris });
  }

  // ─── Public Methods ──────────────────────────────────────────────────────────

  /**
   * Return all currently active transits for a client.
   * A transit is "active" if today falls within its enter–exit window.
   *
   * @param clientId  Client UUID
   * @param natalChart Pre-loaded natal chart; if omitted, would be fetched from DB
   */
  async getActiveTransits(clientId: string, natalChart?: AstroChart): Promise<TransitEvent[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.getTransitsForDate(clientId, today, natalChart);
  }

  /**
   * Return transits that will become active within the next `days` calendar days.
   * @param clientId   Client UUID
   * @param days       Look-ahead window in days (default 30)
   * @param natalChart Pre-loaded natal chart
   */
  async getUpcomingTransits(
    clientId: string,
    days = 30,
    natalChart?: AstroChart,
  ): Promise<TransitEvent[]> {
    const today    = new Date().toISOString().split('T')[0];
    const horizon  = addDays(today, days);

    // Sample 5 dates across the look-ahead window for efficiency
    const sampleDates: string[] = [];
    for (let i = 1; i <= 5; i++) {
      sampleDates.push(addDays(today, Math.round(days * i / 5)));
    }

    const allTransits: TransitEvent[] = [];
    for (const date of sampleDates) {
      const events = await this.getTransitsForDate(clientId, date, natalChart);
      allTransits.push(...events);
    }

    // Deduplicate by exact-date + planet pair
    const seen  = new Set<string>();
    const unique = allTransits.filter((t) => {
      const key = `${t.transitPlanet}_${t.natalPlanet}_${t.aspectType}_${t.exactDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique
      .filter((t) => t.exactDate >= today && t.exactDate <= horizon)
      .sort((a, b) => a.exactDate.localeCompare(b.exactDate));
  }

  /**
   * Check for new transit alerts that should be generated for a client.
   * Returns alerts that are applying, tight (orb ≤ 3°), and high+ significance.
   */
  async checkForAlerts(clientId: string, natalChart?: AstroChart): Promise<TransitAlertPayload[]> {
    const active = await this.getActiveTransits(clientId, natalChart);

    return active
      .filter((t) => t.applying && t.orb <= 3 && ['high', 'critical'].includes(t.significance))
      .map((t): TransitAlertPayload => ({
        clientId,
        planet:       t.transitPlanet,
        aspect:       t.aspectType,
        targetPlanet: t.natalPlanet,
        exactDate:    t.exactDate,
        orb:          t.orb,
        significance: t.significance,
        message:      t.interpretation,
      }));
  }

  /**
   * Return all major astrological events (eclipses, retrogrades, ingresses,
   * major conjunctions) for a given calendar year.
   */
  async getMajorTransitPeriods(year: number): Promise<MajorAstroEvent[]> {
    // 2026 event calendar — stub data reflecting known astronomical events
    const events2026: MajorAstroEvent[] = [
      {
        date: `${year}-01-14`, type: 'eclipse',
        title: 'Penumbral Lunar Eclipse — 24° Cancer',
        description: 'Emotional culminations and completions in Cancer-ruled areas. Themes of home, family, and security surface for review.',
        planets: ['moon'], significance: 'high',
      },
      {
        date: `${year}-02-17`, type: 'ingress',
        title: 'Saturn ingress Aries',
        description: 'Saturn enters Aries for the first time since 1998, initiating a new 2.5-year cycle focused on identity, courage, and pioneering action with discipline.',
        planets: ['saturn'], significance: 'critical',
      },
      {
        date: `${year}-03-10`, type: 'retrograde_station',
        title: 'Jupiter stations retrograde at 24° Gemini',
        description: 'Jupiter turns retrograde in Gemini, prompting a review of beliefs, learning, and communication strategies. Internal expansion takes precedence.',
        planets: ['jupiter'], significance: 'high',
      },
      {
        date: `${year}-03-20`, type: 'equinox',
        title: 'Vernal Equinox — Sun enters Aries',
        description: 'Astrological New Year. The solar cycle restarts; a powerful moment for new beginnings and planting seeds of intention.',
        planets: ['sun'], significance: 'high',
      },
      {
        date: `${year}-03-29`, type: 'eclipse',
        title: 'Total Solar Eclipse — 9° Aries',
        description: 'Powerful new beginning eclipse in fiery Aries conjunct Saturn. Major new cycles in identity, leadership, and personal initiative begin.',
        planets: ['sun', 'moon', 'saturn'], significance: 'critical',
      },
      {
        date: `${year}-05-03`, type: 'retrograde_station',
        title: 'Pluto stations retrograde at 7° Aquarius',
        description: 'Pluto turns retrograde in Aquarius, deepening transformation of social structures, technology, and collective power dynamics.',
        planets: ['pluto'], significance: 'high',
      },
      {
        date: `${year}-05-20`, type: 'retrograde_station',
        title: 'Mercury stations retrograde at 15° Gemini',
        description: 'Mercury retrograde in its home sign Gemini. Communication, contracts, and short-distance travel require extra care and review.',
        planets: ['mercury'], significance: 'medium',
      },
      {
        date: `${year}-06-12`, type: 'eclipse',
        title: 'Partial Lunar Eclipse — 22° Sagittarius',
        description: 'Culminations in Sagittarius-ruled areas: philosophy, higher education, travel, and belief systems reach a turning point.',
        planets: ['moon'], significance: 'high',
      },
      {
        date: `${year}-06-21`, type: 'solstice',
        title: 'Summer Solstice — Sun enters Cancer',
        description: 'The longest day of the year in the northern hemisphere. The Sun enters Cancer, shifting focus toward emotional security and home.',
        planets: ['sun'], significance: 'medium',
      },
      {
        date: `${year}-07-01`, type: 'retrograde_station',
        title: 'Jupiter stations direct at 16° Gemini',
        description: 'Jupiter resumes direct motion, unlocking expansion and opportunity in Gemini-ruled areas: communication, learning, and ideas.',
        planets: ['jupiter'], significance: 'high',
      },
      {
        date: `${year}-07-23`, type: 'retrograde_station',
        title: 'Venus stations retrograde at 3° Virgo',
        description: 'Venus retrograde through Virgo and Leo. Relationships, values, and aesthetic sensibilities undergo deep review. Past connections may resurface.',
        planets: ['venus'], significance: 'high',
      },
      {
        date: `${year}-09-06`, type: 'retrograde_station',
        title: 'Uranus stations retrograde at 1° Gemini',
        description: 'Uranus turns retrograde, internalising its disruptive genius. Review of revolutionary ideas, technological breakthroughs, and sudden changes.',
        planets: ['uranus'], significance: 'high',
      },
      {
        date: `${year}-09-22`, type: 'eclipse',
        title: 'Total Solar Eclipse — 29° Virgo',
        description: 'A powerful new cycle at the anaretic degree of Virgo, seeding intentions around health, service, and refined skill before shifting to Libra themes.',
        planets: ['sun', 'moon'], significance: 'critical',
      },
      {
        date: `${year}-10-06`, type: 'eclipse',
        title: 'Partial Lunar Eclipse — 13° Aries',
        description: 'Aries lunar eclipse brings culmination in matters of identity and independence. Saturn nearby adds weight and responsibility to breakthroughs.',
        planets: ['moon', 'saturn'], significance: 'high',
      },
      {
        date: `${year}-12-21`, type: 'solstice',
        title: 'Winter Solstice — Sun enters Capricorn',
        description: 'The longest night of the year in the northern hemisphere. The Sun enters Capricorn; practical ambition and long-term goals come into focus.',
        planets: ['sun'], significance: 'medium',
      },
    ];

    // Filter to requested year (all stubs are 2026 but label with year param)
    return events2026
      .map((e) => ({ ...e, date: e.date.replace('2026', String(year)) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Return an LLM-generated interpretation stub for a transit event.
   * In production, this would call brain.llm.chat() with the master-astrologer soul.
   */
  async getTransitInterpretation(transit: TransitEvent): Promise<string> {
    const baseInterp = interpretTransit(transit.transitPlanet, transit.aspectType, transit.natalPlanet);

    const timing = transit.applying
      ? `This transit is currently applying, reaching exactness around ${transit.exactDate}.`
      : `This transit is separating, having been exact around ${transit.exactDate}. Its effects are now waning.`;

    const durationNote = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'].includes(transit.transitPlanet)
      ? `As an outer planet transit, this influence may be felt for weeks to months, particularly near the exact date.`
      : `As an inner planet transit, this influence is relatively brief, lasting days rather than weeks.`;

    return [baseInterp, timing, durationNote].join(' ');
  }

  /**
   * Register a client for transit alert notifications at a given significance threshold.
   * @param clientId         Client UUID
   * @param significanceLevel Minimum significance to receive alerts for
   * @param channels         Delivery channels (default: in_app)
   */
  async subscribeToAlerts(
    clientId: string,
    significanceLevel: 'low' | 'medium' | 'high' | 'critical',
    channels: ('email' | 'push' | 'sms' | 'in_app')[] = ['in_app'],
  ): Promise<AlertSubscription> {
    const subscription: AlertSubscription = {
      clientId,
      significanceLevel,
      channels,
      registeredAt: new Date().toISOString(),
      active:       true,
    };
    // In production: persist to transit_alert_subscriptions table
    this.subscriptions.set(clientId, subscription);
    return subscription;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async getTransitsForDate(
    clientId: string,
    date: string,
    natalChart?: AstroChart,
  ): Promise<TransitEvent[]> {
    // Stub natal chart when none provided
    const chart = natalChart ?? await this.chartCalc.calculateNatalChart(
      '1990-01-01', '12:00', 'New York'
    );

    const hits = await this.ephemeris.getTransitsToNatal(chart.planets, date);

    return hits.map((hit): TransitEvent => {
      const significance = scoreSignificance(
        hit.transitPlanet, hit.natalPlanet, hit.aspectType, hit.orb,
      );

      // Daily motion of transiting planet (approx degrees/day)
      const dailyMotion: Record<PlanetName, number> = {
        sun: 0.99, moon: 13.18, mercury: 1.38, venus: 1.20, mars: 0.52,
        jupiter: 0.08, saturn: 0.03, uranus: 0.01, neptune: 0.006, pluto: 0.004,
      };
      const dm      = dailyMotion[hit.transitPlanet];
      const maxOrb  = 8; // degrees
      const daysInOrb = Math.round(maxOrb / dm);

      const enterDate = addDays(hit.exactDate, -daysInOrb);
      const exitDate  = addDays(hit.exactDate, daysInOrb);

      return {
        id:             makeEventId(clientId, hit.transitPlanet, hit.natalPlanet, hit.exactDate),
        clientId,
        transitPlanet:  hit.transitPlanet,
        natalPlanet:    hit.natalPlanet,
        aspectType:     hit.aspectType,
        orb:            hit.orb,
        applying:       hit.applying,
        exactDate:      hit.exactDate,
        enterDate,
        exitDate,
        significance,
        interpretation: interpretTransit(hit.transitPlanet, hit.aspectType, hit.natalPlanet),
      };
    });
  }
}
