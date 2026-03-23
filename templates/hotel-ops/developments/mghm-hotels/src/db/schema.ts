import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb, // available for future use on preference metadata
} from 'drizzle-orm/pg-core';

// ─── Accounts ────────────────────────────────────────────────────────────────
// User-facing accounts for hotel guests accessing the portal
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  guestId: uuid('guest_id').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('guest'), // guest | staff | manager | admin
  lastLogin: timestamp('last_login', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Preferences ─────────────────────────────────────────────────────────────
// Flexible key-value store for guest preferences, grouped by category
export const preferences = pgTable('preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  category: text('category').notNull(), // room | dining | amenities | communication
  key: text('key').notNull(),           // e.g. 'pillow_type', 'room_temperature', 'dietary'
  value: text('value').notNull(),        // e.g. 'firm', '22', 'vegan'
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Booking History ─────────────────────────────────────────────────────────
// Completed reservation records linked to a guest account
export const bookingHistory = pgTable('booking_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  reservationRef: text('reservation_ref').notNull().unique(), // e.g. 'MGH-2024-00312'
  roomType: text('room_type').notNull(),  // Standard | Deluxe | Suite | Penthouse
  checkIn: timestamp('check_in', { withTimezone: true }).notNull(),
  checkOut: timestamp('check_out', { withTimezone: true }).notNull(),
  totalCost: integer('total_cost').notNull(), // stored in cents / lowest currency unit
  rating: integer('rating'),                  // 1-10 NPS-style rating, nullable until submitted
  feedback: text('feedback'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Loyalty Points ───────────────────────────────────────────────────────────
// One record per account tracking loyalty programme status
export const loyaltyPoints = pgTable('loyalty_points', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .unique()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  points: integer('points').notNull().default(0),           // total current balance
  tier: text('tier').notNull().default('Silver'),            // Silver | Gold | Platinum | Diamond
  earnedThisYear: integer('earned_this_year').notNull().default(0),
  redeemedThisYear: integer('redeemed_this_year').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Type Exports ─────────────────────────────────────────────────────────────
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Preference = typeof preferences.$inferSelect;
export type NewPreference = typeof preferences.$inferInsert;

export type BookingHistory = typeof bookingHistory.$inferSelect;
export type NewBookingHistory = typeof bookingHistory.$inferInsert;

export type LoyaltyPoints = typeof loyaltyPoints.$inferSelect;
export type NewLoyaltyPoints = typeof loyaltyPoints.$inferInsert;
