/**
 * Property Management System (PMS) Engine
 *
 * Handles all reservation lifecycle operations: availability search, check-in/out,
 * occupancy reporting, and arrival/departure manifests.
 */

import type { Reservation, Room } from '../../db/schema';

// ─── Supporting Types ──────────────────────────────────────────────────────────

export type RoomType = 'standard' | 'deluxe' | 'suite' | 'penthouse' | 'accessible';
export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'no_show';

export interface ReservationDetails extends Reservation {
  guestName: string;
  guestEmail: string;
  guestVipLevel: string;
  roomNumber: string;
  roomType: RoomType;
  nightsCount: number;
  balanceDue: string;
}

export interface AvailableRoom {
  roomId: string;
  number: string;
  type: RoomType;
  floor: number;
  ratePerNight: string;
  totalEstimate: string;
  amenities: Record<string, boolean>;
  maxOccupancy: number;
}

export interface OccupancyReport {
  date: string;
  totalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  cleaningRooms: number;
  maintenanceRooms: number;
  outOfOrderRooms: number;
  occupancyRate: number;
  /** Revenue on the books for the date */
  revenueOnBooks: string;
}

export interface ArrivalRecord {
  reservationId: string;
  guestName: string;
  vipLevel: string;
  roomNumber: string;
  roomType: RoomType;
  checkIn: string;
  checkOut: string;
  nights: number;
  ratePerNight: string;
  source: string;
  specialRequests: string | null;
  isVip: boolean;
}

export interface DepartureRecord {
  reservationId: string;
  guestName: string;
  roomNumber: string;
  checkIn: string;
  checkOut: string;
  totalCost: string;
  balanceDue: string;
  checkOutStatus: 'pending' | 'express' | 'completed';
}

export interface CheckInResult {
  success: boolean;
  reservationId: string;
  roomNumber: string;
  guestName: string;
  keyCardCodes: string[];
  welcomeMessage: string;
  estimatedCheckOutDate: string;
}

export interface CheckOutResult {
  success: boolean;
  reservationId: string;
  guestName: string;
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
  nightsStayed: number;
  roomCharges: string;
  incidentals: string;
  taxes: string;
  totalBilled: string;
  paymentMethod: string;
  receiptUrl: string;
}

export interface PMSEngineConfig {
  /** Database connection or query function (injected) */
  db?: unknown;
  /** Default tax rate (e.g. 0.13 = 13%) */
  taxRate?: number;
  /** Property's total room count */
  totalRooms?: number;
  /** Property name for reports */
  propertyName?: string;
}

// ─── PMSEngine ─────────────────────────────────────────────────────────────────

export class PMSEngine {
  private readonly taxRate: number;
  private readonly totalRooms: number;
  private readonly propertyName: string;

  constructor(private readonly config: PMSEngineConfig = {}) {
    this.taxRate = config.taxRate ?? 0.13;
    this.totalRooms = config.totalRooms ?? 120;
    this.propertyName = config.propertyName ?? 'Solarc Grand Hotel';
  }

  /**
   * Retrieve full reservation details including joined guest and room information.
   */
  async getReservation(id: string): Promise<ReservationDetails> {
    // Stub: in production, query DB using config.db
    const nightsCount = 3;
    const ratePerNight = 289.0;
    const totalCost = ratePerNight * nightsCount * (1 + this.taxRate);

    return {
      id,
      guestId: 'guest-001',
      roomId: 'room-042',
      guestName: 'Alexandra Hartmann',
      guestEmail: 'a.hartmann@example.com',
      guestVipLevel: 'gold',
      roomNumber: '514',
      roomType: 'deluxe',
      checkIn: '2026-03-25',
      checkOut: '2026-03-28',
      status: 'confirmed',
      ratePerNight: ratePerNight.toFixed(2),
      totalCost: totalCost.toFixed(2),
      source: 'direct',
      notes: 'Celebrating anniversary — arrange welcome amenity',
      nightsCount,
      balanceDue: totalCost.toFixed(2),
      createdAt: new Date('2026-03-10T14:22:00Z'),
    };
  }

  /**
   * Execute check-in: validates reservation status, assigns room, issues key cards,
   * and updates room status to 'occupied'.
   */
  async checkIn(reservationId: string): Promise<CheckInResult> {
    const reservation = await this.getReservation(reservationId);

    if (reservation.status === 'checked_in') {
      throw new Error(`Reservation ${reservationId} is already checked in.`);
    }
    if (reservation.status !== 'confirmed') {
      throw new Error(
        `Cannot check in reservation with status "${reservation.status}". Must be "confirmed".`
      );
    }

    // In production: update reservations.status = 'checked_in', rooms.status = 'occupied'
    const keyCardCodes = [
      `KC-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      `KC-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    ];

    const vipGreeting =
      reservation.guestVipLevel !== 'none'
        ? ` As a ${reservation.guestVipLevel.toUpperCase()} member, please enjoy complimentary access to the Executive Lounge on Level 8.`
        : '';

    return {
      success: true,
      reservationId,
      roomNumber: reservation.roomNumber,
      guestName: reservation.guestName,
      keyCardCodes,
      welcomeMessage: `Welcome to ${this.propertyName}, ${reservation.guestName}!${vipGreeting} Your room ${reservation.roomNumber} is ready. Enjoy your stay.`,
      estimatedCheckOutDate: reservation.checkOut,
    };
  }

  /**
   * Execute check-out: finalizes the folio, calculates any additional charges,
   * posts the bill, and marks the room for housekeeping.
   */
  async checkOut(reservationId: string): Promise<CheckOutResult> {
    const reservation = await this.getReservation(reservationId);

    if (reservation.status !== 'checked_in') {
      throw new Error(
        `Cannot check out reservation with status "${reservation.status}". Must be "checked_in".`
      );
    }

    // In production: calculate incidentals from POS system, finalize folio
    const nights = reservation.nightsCount;
    const roomCharges = nights * parseFloat(reservation.ratePerNight);
    const incidentals = 47.5; // minibar, room service stub
    const subtotal = roomCharges + incidentals;
    const taxes = subtotal * this.taxRate;
    const totalBilled = subtotal + taxes;

    // In production: update reservation status, room status to 'cleaning', increment guest.totalStays
    return {
      success: true,
      reservationId,
      guestName: reservation.guestName,
      roomNumber: reservation.roomNumber,
      checkInDate: reservation.checkIn,
      checkOutDate: new Date().toISOString().split('T')[0],
      nightsStayed: nights,
      roomCharges: roomCharges.toFixed(2),
      incidentals: incidentals.toFixed(2),
      taxes: taxes.toFixed(2),
      totalBilled: totalBilled.toFixed(2),
      paymentMethod: 'Visa •••• 4821',
      receiptUrl: `https://receipts.${this.propertyName.toLowerCase().replace(/\s+/g, '')}.com/${reservationId}`,
    };
  }

  /**
   * Search for available rooms within a date range, optionally filtered by room type.
   */
  async searchAvailability(
    checkIn: string,
    checkOut: string,
    roomType?: RoomType
  ): Promise<AvailableRoom[]> {
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (nights <= 0) {
      throw new Error('Check-out date must be after check-in date.');
    }

    // Stub rooms — in production, query rooms not blocked by reservations in the date range
    const allRooms: AvailableRoom[] = [
      {
        roomId: 'room-101',
        number: '101',
        type: 'standard',
        floor: 1,
        ratePerNight: '189.00',
        totalEstimate: (189 * nights * (1 + this.taxRate)).toFixed(2),
        amenities: { wifi: true, minibar: false, balcony: false, oceanView: false, jacuzzi: false },
        maxOccupancy: 2,
      },
      {
        roomId: 'room-514',
        number: '514',
        type: 'deluxe',
        floor: 5,
        ratePerNight: '289.00',
        totalEstimate: (289 * nights * (1 + this.taxRate)).toFixed(2),
        amenities: { wifi: true, minibar: true, balcony: true, oceanView: false, jacuzzi: false },
        maxOccupancy: 2,
      },
      {
        roomId: 'room-812',
        number: '812',
        type: 'suite',
        floor: 8,
        ratePerNight: '549.00',
        totalEstimate: (549 * nights * (1 + this.taxRate)).toFixed(2),
        amenities: { wifi: true, minibar: true, balcony: true, oceanView: true, jacuzzi: true },
        maxOccupancy: 4,
      },
      {
        roomId: 'room-1201',
        number: '1201',
        type: 'penthouse',
        floor: 12,
        ratePerNight: '1299.00',
        totalEstimate: (1299 * nights * (1 + this.taxRate)).toFixed(2),
        amenities: { wifi: true, minibar: true, balcony: true, oceanView: true, jacuzzi: true },
        maxOccupancy: 6,
      },
      {
        roomId: 'room-103',
        number: '103',
        type: 'accessible',
        floor: 1,
        ratePerNight: '189.00',
        totalEstimate: (189 * nights * (1 + this.taxRate)).toFixed(2),
        amenities: { wifi: true, minibar: false, balcony: false, oceanView: false, jacuzzi: false },
        maxOccupancy: 2,
      },
    ];

    return roomType ? allRooms.filter((r) => r.type === roomType) : allRooms;
  }

  /**
   * Calculate occupancy metrics for a given date (defaults to today).
   */
  async getOccupancy(date?: string): Promise<OccupancyReport> {
    const reportDate = date ?? new Date().toISOString().split('T')[0];

    // Stub occupancy data — in production, count room statuses for the given date
    const occupiedRooms = 87;
    const cleaningRooms = 8;
    const maintenanceRooms = 3;
    const outOfOrderRooms = 1;
    const availableRooms = this.totalRooms - occupiedRooms - cleaningRooms - maintenanceRooms - outOfOrderRooms;
    const occupancyRate = occupiedRooms / this.totalRooms;

    return {
      date: reportDate,
      totalRooms: this.totalRooms,
      occupiedRooms,
      availableRooms,
      cleaningRooms,
      maintenanceRooms,
      outOfOrderRooms,
      occupancyRate: parseFloat(occupancyRate.toFixed(4)),
      revenueOnBooks: (occupiedRooms * 289.5).toFixed(2), // weighted avg rate stub
    };
  }

  /**
   * List all expected arrivals for a given date, sorted by VIP level then name.
   */
  async listArrivals(date: string): Promise<ArrivalRecord[]> {
    // Stub — in production, query reservations WHERE check_in = date AND status IN ('confirmed', 'pending')
    return [
      {
        reservationId: 'res-001',
        guestName: 'Alexandra Hartmann',
        vipLevel: 'gold',
        roomNumber: '514',
        roomType: 'deluxe',
        checkIn: date,
        checkOut: '2026-03-28',
        nights: 3,
        ratePerNight: '289.00',
        source: 'direct',
        specialRequests: 'Anniversary amenity, high floor',
        isVip: true,
      },
      {
        reservationId: 'res-002',
        guestName: 'Marcus Chen',
        vipLevel: 'platinum',
        roomNumber: '812',
        roomType: 'suite',
        checkIn: date,
        checkOut: '2026-03-27',
        nights: 2,
        ratePerNight: '549.00',
        source: 'corporate',
        specialRequests: 'Early check-in requested, hypoallergenic bedding',
        isVip: true,
      },
      {
        reservationId: 'res-003',
        guestName: 'Jordan Williams',
        vipLevel: 'none',
        roomNumber: '101',
        roomType: 'standard',
        checkIn: date,
        checkOut: '2026-03-26',
        nights: 1,
        ratePerNight: '189.00',
        source: 'ota_booking',
        specialRequests: null,
        isVip: false,
      },
    ].sort((a, b) => {
      const vipOrder = { diamond: 0, platinum: 1, gold: 2, silver: 3, none: 4 } as Record<string, number>;
      return (vipOrder[a.vipLevel] ?? 4) - (vipOrder[b.vipLevel] ?? 4);
    });
  }

  /**
   * List all expected departures for a given date.
   */
  async listDepartures(date: string): Promise<DepartureRecord[]> {
    // Stub — in production, query reservations WHERE check_out = date AND status = 'checked_in'
    return [
      {
        reservationId: 'res-090',
        guestName: 'Priya Nambiar',
        roomNumber: '307',
        checkIn: '2026-03-20',
        checkOut: date,
        totalCost: '1234.56',
        balanceDue: '0.00',
        checkOutStatus: 'express',
      },
      {
        reservationId: 'res-091',
        guestName: 'David Okonkwo',
        roomNumber: '622',
        checkIn: '2026-03-21',
        checkOut: date,
        totalCost: '867.00',
        balanceDue: '867.00',
        checkOutStatus: 'pending',
      },
    ];
  }
}
