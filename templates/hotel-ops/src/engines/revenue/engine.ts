/**
 * Revenue Management Engine
 *
 * Provides KPI analysis, demand forecasting, dynamic rate suggestions,
 * channel performance tracking, competitive set positioning, and P&L reporting.
 */

// ─── Supporting Types ──────────────────────────────────────────────────────────

export interface DailyMetrics {
  date: string;
  /** 0–1 decimal, e.g. 0.82 = 82 % */
  occupancyRate: number;
  /** Average Daily Rate in USD */
  adr: number;
  /** Revenue Per Available Room = occupancyRate × ADR */
  revpar: number;
  totalRevenue: number;
  totalRooms: number;
  occupiedRooms: number;
  channelBreakdown: ChannelBreakdown;
}

export interface ChannelBreakdown {
  direct: number;
  ota_booking: number;
  ota_expedia: number;
  corporate: number;
  gds: number;
  other: number;
}

export interface DemandForecast {
  date: string;
  predictedOccupancy: number;
  predictedAdr: number;
  predictedRevpar: number;
  confidenceScore: number; // 0–1
  /** Demand drivers identified by the model */
  demandDrivers: string[];
}

export interface RateAdjustmentSuggestion {
  roomType: string;
  date: string;
  currentBaseRate: number;
  suggestedRate: number;
  adjustmentPercent: number;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface ChannelPerformance {
  channel: string;
  totalRevenue: number;
  reservationsCount: number;
  adr: number;
  netRevenue: number;  // after commission
  commissionRate: number;
  shareOfTotal: number; // percentage
}

export interface CompSetPositioning {
  date: string;
  propertyAdr: number;
  propertyOccupancy: number;
  propertyRevpar: number;
  compSetAverageAdr: number;
  compSetAverageOccupancy: number;
  compSetAverageRevpar: number;
  /** Positive = above comp set, negative = below */
  adrIndex: number;
  mpiIndex: number;  // Market Penetration Index
  rgiIndex: number;  // Revenue Generation Index
  competitors: CompetitorSnapshot[];
}

export interface CompetitorSnapshot {
  name: string;
  estimatedAdr: number;
  estimatedOccupancy: number;
  starRating: number;
}

export interface RevenueReport {
  period: { startDate: string; endDate: string };
  summary: {
    totalRevenue: number;
    totalRoomRevenue: number;
    totalFbRevenue: number;
    totalAncillaryRevenue: number;
    totalCosts: number;
    grossProfit: number;
    grossMargin: number;
  };
  kpis: {
    avgOccupancy: number;
    avgAdr: number;
    avgRevpar: number;
    totalGuestNights: number;
    avgLengthOfStay: number;
  };
  channelMix: ChannelPerformance[];
  dailyBreakdown: DailyMetrics[];
}

export type ReportPeriod = 'last_7_days' | 'last_30_days' | 'last_90_days' | 'mtd' | 'ytd' | 'custom';

export interface RevenueEngineConfig {
  db?: unknown;
  totalRooms?: number;
  propertyName?: string;
  /** Max allowed rate deviation from base (0.30 = 30 %) */
  maxRateVariance?: number;
}

// ─── RevenueEngine ─────────────────────────────────────────────────────────────

export class RevenueEngine {
  private readonly totalRooms: number;
  private readonly propertyName: string;
  private readonly maxRateVariance: number;

  constructor(private readonly config: RevenueEngineConfig = {}) {
    this.totalRooms = config.totalRooms ?? 120;
    this.propertyName = config.propertyName ?? 'Solarc Grand Hotel';
    this.maxRateVariance = config.maxRateVariance ?? 0.3;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private isoToDate(iso: string): Date {
    return new Date(`${iso}T00:00:00Z`);
  }

  private dateRange(start: string, end: string): string[] {
    const dates: string[] = [];
    const cursor = this.isoToDate(start);
    const endDate = this.isoToDate(end);
    while (cursor <= endDate) {
      dates.push(cursor.toISOString().split('T')[0]);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  /** Seeded pseudo-random for reproducible stubs */
  private seededRand(seed: number, min: number, max: number): number {
    const x = Math.sin(seed) * 10000;
    const r = x - Math.floor(x);
    return parseFloat((min + r * (max - min)).toFixed(2));
  }

  private buildDailyMetrics(date: string): DailyMetrics {
    const seed = new Date(date).getTime() / 1e9;
    const occupancyRate = parseFloat(this.seededRand(seed, 0.55, 0.95).toFixed(4));
    const adr = this.seededRand(seed + 1, 220, 420);
    const revpar = parseFloat((occupancyRate * adr).toFixed(2));
    const occupiedRooms = Math.round(occupancyRate * this.totalRooms);
    const totalRevenue = parseFloat((occupiedRooms * adr * 1.13).toFixed(2)); // incl. 13 % tax

    return {
      date,
      occupancyRate,
      adr,
      revpar,
      totalRevenue,
      totalRooms: this.totalRooms,
      occupiedRooms,
      channelBreakdown: {
        direct:      parseFloat((totalRevenue * 0.32).toFixed(2)),
        ota_booking:  parseFloat((totalRevenue * 0.22).toFixed(2)),
        ota_expedia:  parseFloat((totalRevenue * 0.14).toFixed(2)),
        corporate:   parseFloat((totalRevenue * 0.20).toFixed(2)),
        gds:         parseFloat((totalRevenue * 0.07).toFixed(2)),
        other:       parseFloat((totalRevenue * 0.05).toFixed(2)),
      },
    };
  }

  // ─── Public methods ───────────────────────────────────────────────────────

  /**
   * Return key revenue KPIs for a single date (defaults to today).
   */
  async getDailyMetrics(date?: string): Promise<DailyMetrics> {
    const targetDate = date ?? new Date().toISOString().split('T')[0];
    // In production: query revenue_data WHERE date = targetDate, join reservations
    return this.buildDailyMetrics(targetDate);
  }

  /**
   * Generate day-by-day demand predictions for a date range.
   * Uses historical patterns, seasonality, and event calendars.
   */
  async forecastDemand(startDate: string, endDate: string): Promise<DemandForecast[]> {
    const dates = this.dateRange(startDate, endDate);
    const eventCalendar: Record<string, string[]> = {
      '2026-03-28': ['Spring Trade Expo — Convention Centre'],
      '2026-04-01': ['School Easter break begins'],
      '2026-04-18': ['Easter long weekend'],
    };

    return dates.map((date) => {
      const seed = new Date(date).getTime() / 1e9;
      const predictedOccupancy = parseFloat(this.seededRand(seed + 2, 0.60, 0.98).toFixed(4));
      const predictedAdr = this.seededRand(seed + 3, 230, 440);

      const drivers: string[] = ['Historical same-period demand'];
      if (predictedOccupancy > 0.88) drivers.push('High-demand weekend');
      if (eventCalendar[date]) drivers.push(...eventCalendar[date]);

      return {
        date,
        predictedOccupancy,
        predictedAdr,
        predictedRevpar: parseFloat((predictedOccupancy * predictedAdr).toFixed(2)),
        confidenceScore: parseFloat(this.seededRand(seed + 4, 0.72, 0.95).toFixed(2)),
        demandDrivers: drivers,
      };
    });
  }

  /**
   * Suggest a pricing adjustment for a given room type and date.
   * Respects the ±maxRateVariance guardrail.
   */
  async suggestRateAdjustment(
    roomType: string,
    date: string
  ): Promise<RateAdjustmentSuggestion> {
    const baseRates: Record<string, number> = {
      standard:   189,
      deluxe:     289,
      suite:      549,
      penthouse: 1299,
      accessible: 189,
    };

    const baseRate = baseRates[roomType] ?? 249;
    const [forecast] = await this.forecastDemand(date, date);
    const demand = forecast?.predictedOccupancy ?? 0.75;

    // Simple demand-curve adjustment
    let adjustmentFactor = 1.0;
    let reason = 'Demand is in line with forecast — maintain current rate.';
    let urgency: RateAdjustmentSuggestion['urgency'] = 'low';

    if (demand > 0.90) {
      adjustmentFactor = 1.25;
      reason = `High demand forecast (${(demand * 100).toFixed(0)}% occupancy). Increase rate to capture yield.`;
      urgency = 'high';
    } else if (demand > 0.80) {
      adjustmentFactor = 1.12;
      reason = `Above-average demand (${(demand * 100).toFixed(0)}% occupancy). Moderate rate increase recommended.`;
      urgency = 'medium';
    } else if (demand < 0.60) {
      adjustmentFactor = 0.88;
      reason = `Below-average demand (${(demand * 100).toFixed(0)}% occupancy). Reduce rate to stimulate bookings.`;
      urgency = 'medium';
    } else if (demand < 0.50) {
      adjustmentFactor = 0.75;
      reason = `Low demand (${(demand * 100).toFixed(0)}% occupancy). Significant rate reduction to drive occupancy.`;
      urgency = 'high';
    }

    // Enforce guardrail bounds
    const maxFactor = 1 + this.maxRateVariance;
    const minFactor = 1 - this.maxRateVariance;
    const clampedFactor = Math.min(maxFactor, Math.max(minFactor, adjustmentFactor));

    const suggestedRate = parseFloat((baseRate * clampedFactor).toFixed(2));
    const adjustmentPercent = parseFloat(((clampedFactor - 1) * 100).toFixed(1));

    return {
      roomType,
      date,
      currentBaseRate: baseRate,
      suggestedRate,
      adjustmentPercent,
      reason,
      urgency,
    };
  }

  /**
   * Aggregate revenue by booking channel for a given period.
   */
  async getChannelPerformance(period: ReportPeriod | { startDate: string; endDate: string }): Promise<ChannelPerformance[]> {
    const today = new Date().toISOString().split('T')[0];
    let startDate: string;
    let endDate: string = today;

    if (typeof period === 'object') {
      startDate = period.startDate;
      endDate = period.endDate;
    } else {
      const d = new Date();
      const dayOffsets: Record<ReportPeriod, number> = {
        last_7_days:  7,
        last_30_days: 30,
        last_90_days: 90,
        mtd:          d.getUTCDate() - 1,
        ytd:          Math.floor((d.getTime() - new Date(`${d.getUTCFullYear()}-01-01`).getTime()) / 86400000),
        custom:       30,
      };
      d.setUTCDate(d.getUTCDate() - (dayOffsets[period] ?? 30));
      startDate = d.toISOString().split('T')[0];
    }

    const dates = this.dateRange(startDate, endDate);
    const totals: Record<keyof ChannelBreakdown, number> = {
      direct: 0, ota_booking: 0, ota_expedia: 0, corporate: 0, gds: 0, other: 0,
    };

    for (const date of dates) {
      const m = this.buildDailyMetrics(date);
      for (const key of Object.keys(totals) as Array<keyof ChannelBreakdown>) {
        totals[key] += m.channelBreakdown[key];
      }
    }

    const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
    const commissionRates: Record<string, number> = {
      direct: 0.0, ota_booking: 0.18, ota_expedia: 0.20, corporate: 0.05, gds: 0.10, other: 0.12,
    };

    const reservationShares = { direct: 0.32, ota_booking: 0.22, ota_expedia: 0.14, corporate: 0.20, gds: 0.07, other: 0.05 };
    const totalReservations = dates.length * Math.round(this.totalRooms * 0.75);

    return (Object.entries(totals) as Array<[keyof ChannelBreakdown, number]>).map(([channel, rev]) => {
      const commission = commissionRates[channel] ?? 0;
      const netRevenue = parseFloat((rev * (1 - commission)).toFixed(2));
      const rCount = Math.round(totalReservations * (reservationShares[channel as keyof typeof reservationShares] ?? 0.05));
      return {
        channel,
        totalRevenue: parseFloat(rev.toFixed(2)),
        reservationsCount: rCount,
        adr: rCount > 0 ? parseFloat((rev / rCount).toFixed(2)) : 0,
        netRevenue,
        commissionRate: commission,
        shareOfTotal: parseFloat(((rev / grandTotal) * 100).toFixed(1)),
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  /**
   * Return competitive set positioning metrics relative to comp set for a date.
   */
  async getCompetitiveSet(date: string): Promise<CompSetPositioning> {
    const property = this.buildDailyMetrics(date);

    const competitors: CompetitorSnapshot[] = [
      { name: 'The Metropolitan',   estimatedAdr: 295, estimatedOccupancy: 0.81, starRating: 5 },
      { name: 'Harbour View Hotel', estimatedAdr: 260, estimatedOccupancy: 0.76, starRating: 4 },
      { name: 'City Suites by Wyndham', estimatedAdr: 210, estimatedOccupancy: 0.88, starRating: 4 },
      { name: 'The Grandeur Collection', estimatedAdr: 380, estimatedOccupancy: 0.72, starRating: 5 },
    ];

    const compSetAverageAdr = parseFloat(
      (competitors.reduce((s, c) => s + c.estimatedAdr, 0) / competitors.length).toFixed(2)
    );
    const compSetAverageOccupancy = parseFloat(
      (competitors.reduce((s, c) => s + c.estimatedOccupancy, 0) / competitors.length).toFixed(4)
    );
    const compSetAverageRevpar = parseFloat((compSetAverageAdr * compSetAverageOccupancy).toFixed(2));

    return {
      date,
      propertyAdr:             property.adr,
      propertyOccupancy:       property.occupancyRate,
      propertyRevpar:          property.revpar,
      compSetAverageAdr,
      compSetAverageOccupancy,
      compSetAverageRevpar,
      adrIndex:  parseFloat(((property.adr / compSetAverageAdr - 1) * 100).toFixed(1)),
      mpiIndex:  parseFloat(((property.occupancyRate / compSetAverageOccupancy) * 100).toFixed(1)),
      rgiIndex:  parseFloat(((property.revpar / compSetAverageRevpar) * 100).toFixed(1)),
      competitors,
    };
  }

  /**
   * Generate a full revenue P&L report for a date range.
   */
  async generateRevenueReport(startDate: string, endDate: string): Promise<RevenueReport> {
    const dates = this.dateRange(startDate, endDate);
    const dailyBreakdown = dates.map((d) => this.buildDailyMetrics(d));

    const totalRoomRevenue  = dailyBreakdown.reduce((s, d) => s + d.totalRevenue, 0);
    const totalFbRevenue    = parseFloat((totalRoomRevenue * 0.22).toFixed(2));  // F&B ~22% of room rev
    const totalAncillary    = parseFloat((totalRoomRevenue * 0.08).toFixed(2));  // spa, parking, etc.
    const totalRevenue      = parseFloat((totalRoomRevenue + totalFbRevenue + totalAncillary).toFixed(2));
    const totalCosts        = parseFloat((totalRevenue * 0.58).toFixed(2));       // ~58% cost ratio
    const grossProfit       = parseFloat((totalRevenue - totalCosts).toFixed(2));
    const grossMargin       = parseFloat(((grossProfit / totalRevenue) * 100).toFixed(1));

    const avgOccupancy = parseFloat(
      (dailyBreakdown.reduce((s, d) => s + d.occupancyRate, 0) / dailyBreakdown.length).toFixed(4)
    );
    const avgAdr = parseFloat(
      (dailyBreakdown.reduce((s, d) => s + d.adr, 0) / dailyBreakdown.length).toFixed(2)
    );
    const avgRevpar = parseFloat((avgOccupancy * avgAdr).toFixed(2));
    const totalGuestNights  = dailyBreakdown.reduce((s, d) => s + d.occupiedRooms, 0);
    const avgLengthOfStay   = 2.4; // stub — would derive from reservations

    const channelMix = await this.getChannelPerformance({ startDate, endDate });

    return {
      period: { startDate, endDate },
      summary: {
        totalRevenue,
        totalRoomRevenue: parseFloat(totalRoomRevenue.toFixed(2)),
        totalFbRevenue,
        totalAncillaryRevenue: totalAncillary,
        totalCosts,
        grossProfit,
        grossMargin,
      },
      kpis: {
        avgOccupancy,
        avgAdr,
        avgRevpar,
        totalGuestNights,
        avgLengthOfStay,
      },
      channelMix,
      dailyBreakdown,
    };
  }
}
