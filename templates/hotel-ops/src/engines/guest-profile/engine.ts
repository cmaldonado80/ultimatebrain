/**
 * Guest Profile Engine
 *
 * Manages guest identity, preferences, stay history, VIP tiers, and
 * lifetime value calculations. Acts as the single source of truth for
 * the guest data domain within the Hospitality Mini Brain.
 */

import type { Guest, Reservation } from '../../db/schema';

// ─── Supporting Types ──────────────────────────────────────────────────────────

export type VipLevel = 'none' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface GuestPreferences {
  roomType?:             string;
  floorPreference?:      'low' | 'mid' | 'high';
  pillowType?:           'soft' | 'firm' | 'memory_foam';
  temperature?:          'cool' | 'standard' | 'warm';
  dietaryRestrictions?:  string[];
  amenityRequests?:      string[];
  communicationChannel?: 'email' | 'sms' | 'phone' | 'whatsapp';
  allergens?:            string[];
  bedConfiguration?:     'king' | 'twin' | 'double_double';
  [key: string]: unknown;
}

export interface GuestProfile extends Omit<Guest, 'preferences'> {
  preferences: GuestPreferences;
  vipLabel: string;
  fullName: string;
}

export interface StayRecord extends Reservation {
  roomNumber: string;
  roomType: string;
  propertyName: string;
  /** Calculated total cost at time of stay */
  billedTotal: string;
  reviewScore?: number;
}

export interface GuestSearchResult {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  vipLevel: VipLevel;
  totalStays: number;
  lifetimeSpend: string;
}

export interface LifetimeValueBreakdown {
  guestId: string;
  fullName: string;
  totalStays: number;
  lifetimeSpend: number;
  averageSpendPerStay: number;
  averageLengthOfStay: number;
  projectedAnnualValue: number;
  /** Churn risk: low | medium | high */
  churnRisk: 'low' | 'medium' | 'high';
  lastStayDate: string | null;
  daysSinceLastStay: number | null;
  recommendedAction: string;
}

export interface GuestProfileEngineConfig {
  db?: unknown;
  propertyName?: string;
}

// ─── GuestProfileEngine ────────────────────────────────────────────────────────

export class GuestProfileEngine {
  private readonly propertyName: string;

  constructor(private readonly config: GuestProfileEngineConfig = {}) {
    this.propertyName = config.propertyName ?? 'Solarc Grand Hotel';
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private vipLabel(level: VipLevel): string {
    const labels: Record<VipLevel, string> = {
      none:     'Standard Guest',
      silver:   'Silver Member',
      gold:     'Gold Member',
      platinum: 'Platinum Member',
      diamond:  'Diamond Elite',
    };
    return labels[level] ?? 'Standard Guest';
  }

  /** Sanitize a guest row into a GuestProfile (adds derived fields). */
  private enrichGuest(raw: Guest): GuestProfile {
    return {
      ...raw,
      preferences: (raw.preferences as GuestPreferences) ?? {},
      fullName: `${raw.firstName} ${raw.lastName}`,
      vipLabel: this.vipLabel(raw.vipLevel as VipLevel),
    };
  }

  private stubGuests(): Guest[] {
    return [
      {
        id: 'guest-001',
        firstName: 'Alexandra',
        lastName: 'Hartmann',
        email: 'a.hartmann@example.com',
        phone: '+1-555-0142',
        vipLevel: 2, // gold
        preferences: {
          roomType: 'deluxe',
          floorPreference: 'high',
          pillowType: 'firm',
          dietaryRestrictions: ['gluten-free'],
          communicationChannel: 'email',
        } satisfies GuestPreferences,
        totalStays: 14,
        lifetimeSpend: '18450.00',
        createdAt: new Date('2021-06-15T10:00:00Z'),
      },
      {
        id: 'guest-002',
        firstName: 'Marcus',
        lastName: 'Chen',
        email: 'm.chen@vertexcorp.com',
        phone: '+1-555-0201',
        vipLevel: 3, // platinum
        preferences: {
          roomType: 'suite',
          floorPreference: 'high',
          pillowType: 'memory_foam',
          dietaryRestrictions: [],
          communicationChannel: 'phone',
          bedConfiguration: 'king',
        } satisfies GuestPreferences,
        totalStays: 31,
        lifetimeSpend: '67200.00',
        createdAt: new Date('2019-03-22T09:30:00Z'),
      },
      {
        id: 'guest-003',
        firstName: 'Priya',
        lastName: 'Nambiar',
        email: 'priya.nambiar@example.com',
        phone: '+44-7700-900088',
        vipLevel: 1, // silver
        preferences: {
          roomType: 'standard',
          floorPreference: 'low',
          dietaryRestrictions: ['vegetarian'],
          communicationChannel: 'sms',
        } satisfies GuestPreferences,
        totalStays: 5,
        lifetimeSpend: '3820.00',
        createdAt: new Date('2023-11-01T14:00:00Z'),
      },
      {
        id: 'guest-004',
        firstName: 'David',
        lastName: 'Okonkwo',
        email: 'david.okonkwo@bizmgt.co',
        phone: '+234-80-3456-7890',
        vipLevel: 0, // none
        preferences: {},
        totalStays: 1,
        lifetimeSpend: '867.00',
        createdAt: new Date('2026-03-20T11:00:00Z'),
      },
      {
        id: 'guest-005',
        firstName: 'Natalia',
        lastName: 'Voronova',
        email: 'n.voronova@kremlinvip.ru',
        phone: '+7-495-555-1234',
        vipLevel: 3, // diamond-adjacent — using 3 as highest in integer scale
        preferences: {
          roomType: 'penthouse',
          floorPreference: 'high',
          pillowType: 'soft',
          allergens: ['nuts', 'shellfish'],
          communicationChannel: 'whatsapp',
          temperature: 'warm',
        } satisfies GuestPreferences,
        totalStays: 48,
        lifetimeSpend: '142000.00',
        createdAt: new Date('2018-07-10T08:00:00Z'),
      },
    ];
  }

  private stubStays(guestId: string): StayRecord[] {
    const stays: Record<string, StayRecord[]> = {
      'guest-001': [
        {
          id: 'res-hist-001', guestId: 'guest-001', roomId: 'room-514',
          roomNumber: '514', roomType: 'deluxe',
          checkIn: '2026-03-25', checkOut: '2026-03-28',
          status: 'confirmed', ratePerNight: '289.00', totalCost: '979.29',
          source: 'direct', notes: 'Anniversary stay', createdAt: new Date('2026-03-10'),
          propertyName: this.propertyName, billedTotal: '979.29', reviewScore: 9,
        },
        {
          id: 'res-hist-002', guestId: 'guest-001', roomId: 'room-514',
          roomNumber: '514', roomType: 'deluxe',
          checkIn: '2025-11-10', checkOut: '2025-11-13',
          status: 'checked_out', ratePerNight: '269.00', totalCost: '912.09',
          source: 'direct', notes: null, createdAt: new Date('2025-10-25'),
          propertyName: this.propertyName, billedTotal: '912.09', reviewScore: 8,
        },
      ],
      'guest-002': [
        {
          id: 'res-hist-010', guestId: 'guest-002', roomId: 'room-812',
          roomNumber: '812', roomType: 'suite',
          checkIn: '2026-03-25', checkOut: '2026-03-27',
          status: 'confirmed', ratePerNight: '549.00', totalCost: '1240.74',
          source: 'corporate', notes: 'Q1 leadership offsite', createdAt: new Date('2026-02-15'),
          propertyName: this.propertyName, billedTotal: '1240.74', reviewScore: 10,
        },
      ],
    };
    return stays[guestId] ?? [];
  }

  // ─── Public methods ───────────────────────────────────────────────────────

  /**
   * Retrieve the complete guest profile including enriched preferences and VIP metadata.
   */
  async getProfile(guestId: string): Promise<GuestProfile> {
    // In production: SELECT * FROM guests WHERE id = guestId
    const guests = this.stubGuests();
    const raw = guests.find((g) => g.id === guestId);
    if (!raw) {
      throw new Error(`Guest not found: ${guestId}`);
    }
    return this.enrichGuest(raw);
  }

  /**
   * Full-text search across first name, last name, email, and phone.
   * Returns lightweight search result records (no PII-heavy fields).
   */
  async searchGuests(query: string): Promise<GuestSearchResult[]> {
    // In production: SELECT ... FROM guests WHERE to_tsvector(...) @@ plainto_tsquery(query)
    const q = query.toLowerCase().trim();
    const guests = this.stubGuests();

    return guests
      .filter(
        (g) =>
          g.firstName.toLowerCase().includes(q) ||
          g.lastName.toLowerCase().includes(q) ||
          (g.email ?? '').toLowerCase().includes(q) ||
          (g.phone ?? '').includes(q)
      )
      .map((g) => ({
        id: g.id,
        fullName: `${g.firstName} ${g.lastName}`,
        email: g.email ?? null,
        phone: g.phone ?? null,
        vipLevel: (g.vipLevel === 3 ? 'platinum' : g.vipLevel === 2 ? 'gold' : g.vipLevel === 1 ? 'silver' : 'none') as VipLevel,
        totalStays: g.totalStays,
        lifetimeSpend: g.lifetimeSpend as string,
      }));
  }

  /**
   * Upsert a single preference value for a guest by category key.
   * Example: recordPreference('guest-001', 'pillowType', 'memory_foam')
   */
  async recordPreference(
    guestId: string,
    category: string,
    value: unknown
  ): Promise<{ success: boolean; guestId: string; category: string; value: unknown }> {
    // In production:
    //   UPDATE guests
    //   SET preferences = jsonb_set(preferences, '{category}', to_jsonb(value))
    //   WHERE id = guestId
    const profile = await this.getProfile(guestId);
    if (!profile) throw new Error(`Guest not found: ${guestId}`);

    return { success: true, guestId, category, value };
  }

  /**
   * List all guests with VIP level silver or above, sorted by vipLevel descending
   * then lifetimeSpend descending.
   */
  async getVIPGuests(): Promise<GuestProfile[]> {
    // In production: SELECT * FROM guests WHERE vip_level > 0 ORDER BY vip_level DESC, lifetime_spend DESC
    const vipCutoff = 1;
    return this.stubGuests()
      .filter((g) => g.vipLevel >= vipCutoff)
      .sort((a, b) => {
        if (b.vipLevel !== a.vipLevel) return b.vipLevel - a.vipLevel;
        return parseFloat(b.lifetimeSpend as string) - parseFloat(a.lifetimeSpend as string);
      })
      .map((g) => this.enrichGuest(g));
  }

  /**
   * Calculate a guest's lifetime value with churn risk assessment and recommended action.
   */
  async calculateLifetimeValue(guestId: string): Promise<LifetimeValueBreakdown> {
    const profile = await this.getProfile(guestId);
    const stays = await this.getStayHistory(guestId);

    const lifetimeSpend = parseFloat(profile.lifetimeSpend as string);
    const totalStays = profile.totalStays;
    const averageSpendPerStay = totalStays > 0 ? parseFloat((lifetimeSpend / totalStays).toFixed(2)) : 0;

    const avgLengthOfStay =
      stays.length > 0
        ? parseFloat(
            (
              stays.reduce((sum, s) => {
                const nights =
                  (new Date(s.checkOut).getTime() - new Date(s.checkIn).getTime()) / 86400000;
                return sum + nights;
              }, 0) / stays.length
            ).toFixed(1)
          )
        : 2.4;

    // Projected annual value: based on average stays per year
    const accountAgeDays =
      (Date.now() - new Date(profile.createdAt).getTime()) / 86400000;
    const staysPerYear = accountAgeDays > 0 ? (totalStays / accountAgeDays) * 365 : 0;
    const projectedAnnualValue = parseFloat((staysPerYear * averageSpendPerStay).toFixed(2));

    // Churn risk based on recency
    const checkedOutStays = stays.filter((s) => s.status === 'checked_out');
    const lastStay = checkedOutStays.sort(
      (a, b) => new Date(b.checkOut).getTime() - new Date(a.checkOut).getTime()
    )[0];

    const lastStayDate = lastStay?.checkOut ?? null;
    const daysSinceLastStay = lastStayDate
      ? Math.floor((Date.now() - new Date(lastStayDate).getTime()) / 86400000)
      : null;

    let churnRisk: 'low' | 'medium' | 'high' = 'low';
    let recommendedAction = 'No action required — guest is actively engaged.';

    if (daysSinceLastStay === null || daysSinceLastStay > 365) {
      churnRisk = 'high';
      recommendedAction = 'Send win-back offer with personalized rate and complimentary upgrade.';
    } else if (daysSinceLastStay > 180) {
      churnRisk = 'medium';
      recommendedAction = 'Send personalized re-engagement email with loyalty benefits reminder.';
    } else if (profile.vipLevel >= 2) {
      recommendedAction = 'Ensure next stay has a pre-arrival VIP touchpoint from the GM.';
    }

    return {
      guestId,
      fullName: profile.fullName,
      totalStays,
      lifetimeSpend,
      averageSpendPerStay,
      averageLengthOfStay: avgLengthOfStay,
      projectedAnnualValue,
      churnRisk,
      lastStayDate,
      daysSinceLastStay,
      recommendedAction,
    };
  }

  /**
   * Retrieve the full stay history for a guest, ordered by check-in date descending.
   */
  async getStayHistory(guestId: string): Promise<StayRecord[]> {
    // In production:
    //   SELECT r.*, rm.number AS room_number, rm.type AS room_type
    //   FROM reservations r
    //   JOIN rooms rm ON rm.id = r.room_id
    //   WHERE r.guest_id = guestId
    //   ORDER BY r.check_in DESC
    return this.stubStays(guestId).sort(
      (a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime()
    );
  }
}
