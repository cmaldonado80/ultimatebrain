import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  numeric,
  jsonb,
  date,
} from 'drizzle-orm/pg-core';

// ─── Clients ────────────────────────────────────────────────────────────────────

export const clients = pgTable('clients', {
  id:         uuid('id').primaryKey().defaultRandom(),
  name:       text('name').notNull(),
  /** ISO date string, e.g. "1990-03-15" */
  birthDate:  date('birth_date').notNull(),
  /** Local time string, e.g. "14:32" or "14:32:00" */
  birthTime:  text('birth_time'),
  /** City, region, country — used for geocoding */
  birthPlace: text('birth_place').notNull(),
  /** IANA timezone, e.g. "America/New_York" */
  timezone:   text('timezone').notNull(),
  email:      text('email').unique(),
  phone:      text('phone'),
  notes:      text('notes'),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Client    = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;

// ─── Natal Charts ───────────────────────────────────────────────────────────────

/**
 * planets JSONB shape:
 * {
 *   sun:     { sign: 'Aries', degree: 15, minute: 42, longitude: 15.7, retrograde: false, glyph: '☉' },
 *   moon:    { sign: 'Cancer', degree: 8, minute: 14, longitude: 98.23, retrograde: false, glyph: '☽' },
 *   ...
 * }
 *
 * houses JSONB shape:
 * [
 *   { house: 1, sign: 'Scorpio', degree: 22, minute: 5, longitude: 232.08 },
 *   ...
 * ]
 *
 * aspects JSONB shape:
 * [
 *   { planet1: 'sun', planet2: 'moon', type: 'trine', orb: 2.3, applying: true },
 *   ...
 * ]
 */
export const natalCharts = pgTable('natal_charts', {
  id:          uuid('id').primaryKey().defaultRandom(),
  clientId:    uuid('client_id')
    .notNull()
    .references(() => clients.id),
  /** Planetary positions keyed by planet name */
  planets:     jsonb('planets').$type<Record<string, unknown>>().notNull().default({}),
  /** Array of 12 house cusp objects */
  houses:      jsonb('houses').$type<unknown[]>().notNull().default([]),
  /** Array of aspect objects between natal planets */
  aspects:     jsonb('aspects').$type<unknown[]>().notNull().default([]),
  /** Ascendant sign and degree, e.g. "22°05' Scorpio" */
  ascendant:   text('ascendant').notNull(),
  /** Midheaven sign and degree, e.g. "14°33' Leo" */
  midheaven:   text('midheaven').notNull(),
  computedAt:  timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type NatalChart    = typeof natalCharts.$inferSelect;
export type NewNatalChart = typeof natalCharts.$inferInsert;

// ─── Readings ──────────────────────────────────────────────────────────────────

export const readings = pgTable('readings', {
  id:             uuid('id').primaryKey().defaultRandom(),
  clientId:       uuid('client_id')
    .notNull()
    .references(() => clients.id),
  chartId:        uuid('chart_id')
    .references(() => natalCharts.id),
  /** Type of astrological reading */
  type:           text('type', {
    enum: ['natal', 'transit', 'synastry', 'horary', 'electional'],
  }).notNull(),
  /** Full interpretation text produced by the agent */
  interpretation: text('interpretation').notNull(),
  /** ID of the agent that produced this reading */
  agentId:        text('agent_id').notNull(),
  /** LLM model used, e.g. "claude-sonnet-4-6" */
  model:          text('model').notNull(),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Reading    = typeof readings.$inferSelect;
export type NewReading = typeof readings.$inferInsert;

// ─── Transit Alerts ─────────────────────────────────────────────────────────────

export const transitAlerts = pgTable('transit_alerts', {
  id:            uuid('id').primaryKey().defaultRandom(),
  clientId:      uuid('client_id')
    .notNull()
    .references(() => clients.id),
  /** Transiting planet, e.g. "Saturn" */
  planet:        text('planet').notNull(),
  /** Aspect type, e.g. "conjunction", "square", "trine" */
  aspect:        text('aspect').notNull(),
  /** Natal planet being aspected, e.g. "Sun" */
  targetPlanet:  text('target_planet').notNull(),
  /** Date of exact aspect perfection */
  exactDate:     date('exact_date').notNull(),
  /** Orb in degrees at time of alert generation */
  orb:           numeric('orb', { precision: 5, scale: 2 }).notNull(),
  /** Weighted significance of this transit */
  significance:  text('significance', {
    enum: ['low', 'medium', 'high', 'critical'],
  }).notNull().default('medium'),
  /** Human-readable alert message */
  message:       text('message').notNull(),
  /** Whether the client has seen/dismissed this alert */
  acknowledged:  boolean('acknowledged').notNull().default(false),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TransitAlert    = typeof transitAlerts.$inferSelect;
export type NewTransitAlert = typeof transitAlerts.$inferInsert;

// ─── Sports Teams ──────────────────────────────────────────────────────────────

/**
 * players JSONB shape:
 * [
 *   { name: 'Jane Smith', birthDate: '1995-07-22', position: 'Forward', chartId: null },
 *   ...
 * ]
 */
export const sportsTeams = pgTable('sports_teams', {
  id:             uuid('id').primaryKey().defaultRandom(),
  name:           text('name').notNull(),
  sport:          text('sport').notNull(),
  /** ISO date of team founding / first official match */
  foundingDate:   date('founding_date'),
  /** Local time of founding event, used for electional chart */
  foundingTime:   text('founding_time'),
  /** City where team was founded */
  foundingPlace:  text('founding_place'),
  /** FK to natal_charts for the team entity chart (nullable) */
  chartId:        uuid('chart_id')
    .references(() => natalCharts.id),
  /** Array of player objects with optional birth data */
  players:        jsonb('players').$type<unknown[]>().notNull().default([]),
  notes:          text('notes'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SportsTeam    = typeof sportsTeams.$inferSelect;
export type NewSportsTeam = typeof sportsTeams.$inferInsert;
