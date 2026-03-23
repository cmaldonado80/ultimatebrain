import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  jsonb,
  date,
} from 'drizzle-orm/pg-core';

// ─── Guests ────────────────────────────────────────────────────────────────────

export const guests = pgTable('guests', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  vipLevel: text('vip_level', {
    enum: ['none', 'silver', 'gold', 'platinum', 'diamond'],
  })
    .notNull()
    .default('none'),
  /** Structured preferences: { pillow: 'firm', floor: 'high', dietary: ['vegan'], amenities: ['extra_towels'] } */
  preferences: jsonb('preferences').$type<Record<string, unknown>>().default({}),
  totalStays: integer('total_stays').notNull().default(0),
  /** Lifetime spend in USD cents */
  lifetimeSpend: numeric('lifetime_spend', { precision: 12, scale: 2 }).notNull().default('0.00'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Guest = typeof guests.$inferSelect;
export type NewGuest = typeof guests.$inferInsert;

// ─── Rooms ─────────────────────────────────────────────────────────────────────

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: text('number').notNull().unique(),
  type: text('type', {
    enum: ['standard', 'deluxe', 'suite', 'penthouse', 'accessible'],
  }).notNull(),
  floor: integer('floor').notNull(),
  status: text('status', {
    enum: ['available', 'occupied', 'cleaning', 'maintenance', 'out_of_order'],
  })
    .notNull()
    .default('available'),
  /** Nightly base rate in USD */
  rateBase: numeric('rate_base', { precision: 10, scale: 2 }).notNull(),
  /** e.g. { wifi: true, minibar: true, balcony: false, oceanView: true, jacuzzi: false } */
  amenities: jsonb('amenities').$type<Record<string, boolean>>().default({}),
  maxOccupancy: integer('max_occupancy').notNull().default(2),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;

// ─── Reservations ──────────────────────────────────────────────────────────────

export const reservations = pgTable('reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  guestId: uuid('guest_id')
    .notNull()
    .references(() => guests.id),
  roomId: uuid('room_id').references(() => rooms.id),
  checkIn: date('check_in').notNull(),
  checkOut: date('check_out').notNull(),
  status: text('status', {
    enum: [
      'pending',
      'confirmed',
      'checked_in',
      'checked_out',
      'cancelled',
      'no_show',
    ],
  })
    .notNull()
    .default('pending'),
  /** Actual rate charged per night (may differ from base due to promos/dynamic pricing) */
  ratePerNight: numeric('rate_per_night', { precision: 10, scale: 2 }).notNull(),
  /** Sum of all nights + taxes/fees */
  totalCost: numeric('total_cost', { precision: 12, scale: 2 }).notNull(),
  source: text('source', {
    enum: ['direct', 'ota_booking', 'ota_expedia', 'ota_airbnb', 'corporate', 'gds', 'phone'],
  })
    .notNull()
    .default('direct'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;

// ─── Revenue Data ──────────────────────────────────────────────────────────────

export const revenueData = pgTable('revenue_data', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: date('date').notNull().unique(),
  /** 0–1 decimal, e.g. 0.82 = 82% occupied */
  occupancyRate: numeric('occupancy_rate', { precision: 5, scale: 4 }).notNull(),
  /** Average Daily Rate in USD */
  adr: numeric('adr', { precision: 10, scale: 2 }).notNull(),
  /** Revenue Per Available Room = occupancyRate × ADR */
  revpar: numeric('revpar', { precision: 10, scale: 2 }).notNull(),
  totalRevenue: numeric('total_revenue', { precision: 14, scale: 2 }).notNull(),
  /**
   * Revenue split by booking channel:
   * { direct: 12500.00, ota_booking: 8400.00, ota_expedia: 4200.00, corporate: 6100.00, gds: 900.00 }
   */
  channelBreakdown: jsonb('channel_breakdown').$type<Record<string, number>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type RevenueData = typeof revenueData.$inferSelect;
export type NewRevenueData = typeof revenueData.$inferInsert;

// ─── Staff ─────────────────────────────────────────────────────────────────────

export const staff = pgTable('staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  department: text('department', {
    enum: [
      'front_desk',
      'housekeeping',
      'food_beverage',
      'maintenance',
      'security',
      'concierge',
      'management',
      'sales',
      'spa',
    ],
  }).notNull(),
  shift: text('shift', { enum: ['morning', 'afternoon', 'night', 'split'] }).notNull(),
  status: text('status', { enum: ['active', 'on_leave', 'terminated'] })
    .notNull()
    .default('active'),
  hiredAt: date('hired_at').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;

// ─── F&B Inventory ─────────────────────────────────────────────────────────────

export const fbInventory = pgTable('fb_inventory', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemName: text('item_name').notNull(),
  category: text('category', {
    enum: [
      'produce',
      'protein',
      'dairy',
      'dry_goods',
      'beverages',
      'spirits',
      'wine',
      'cleaning',
      'smallwares',
    ],
  }).notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 3 }).notNull(),
  unit: text('unit').notNull(),
  /** Cost per unit in USD */
  costPerUnit: numeric('cost_per_unit', { precision: 10, scale: 4 }).notNull(),
  /** Minimum stock level before reorder is triggered */
  parLevel: numeric('par_level', { precision: 10, scale: 3 }).notNull(),
  supplierId: text('supplier_id'),
  lastRestocked: timestamp('last_restocked', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type FbInventory = typeof fbInventory.$inferSelect;
export type NewFbInventory = typeof fbInventory.$inferInsert;
