import {
  pgTable,
  serial,
  text,
  varchar,
  numeric,
  boolean,
  integer,
  timestamp,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';

// Enums
export const tierEnum = pgEnum('tier', ['free', 'pro', 'premium']);
export const sportEnum = pgEnum('sport', ['nfl', 'nba', 'mlb', 'nhl', 'soccer', 'other']);

// accounts
export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: varchar('display_name', { length: 100 }),
  tier: tierEnum('tier').notNull().default('free'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// team_profiles
export const teamProfiles = pgTable('team_profiles', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  teamName: varchar('team_name', { length: 150 }).notNull(),
  sport: sportEnum('sport').notNull(),
  foundingDate: text('founding_date').notNull(), // ISO date string YYYY-MM-DD
  foundingTime: text('founding_time'), // nullable HH:MM local time
  foundingPlace: varchar('founding_place', { length: 255 }).notNull(),
  chartData: jsonb('chart_data'), // natal chart computed from Astrology Mini Brain
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// match_predictions
export const matchPredictions = pgTable('match_predictions', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  homeTeamId: integer('home_team_id')
    .notNull()
    .references(() => teamProfiles.id, { onDelete: 'cascade' }),
  awayTeamId: integer('away_team_id')
    .notNull()
    .references(() => teamProfiles.id, { onDelete: 'cascade' }),
  matchDate: text('match_date').notNull(), // ISO date string YYYY-MM-DD
  prediction: text('prediction').notNull(),
  confidence: numeric('confidence', { precision: 5, scale: 2 }).notNull(), // 0.00 - 100.00
  transitAnalysis: jsonb('transit_analysis'), // detailed transit data from Mini Brain
  outcome: text('outcome'), // nullable — filled after match
  correct: boolean('correct'), // nullable — filled after match
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// season_forecasts
export const seasonForecasts = pgTable('season_forecasts', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  teamId: integer('team_id')
    .notNull()
    .references(() => teamProfiles.id, { onDelete: 'cascade' }),
  season: varchar('season', { length: 20 }).notNull(), // e.g. "2024-25" or "2025"
  forecast: text('forecast').notNull(),
  keyDates: jsonb('key_dates'), // array of { date, type, description }
  transitHighlights: jsonb('transit_highlights'), // monthly transit summaries
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// prediction_history (aggregated stats per account)
export const predictionHistory = pgTable('prediction_history', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' })
    .unique(),
  totalPredictions: integer('total_predictions').notNull().default(0),
  correctPredictions: integer('correct_predictions').notNull().default(0),
  accuracy: numeric('accuracy', { precision: 5, scale: 2 }).notNull().default('0.00'),
  streak: integer('streak').notNull().default(0), // positive = win streak, negative = loss streak
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Type exports
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type TeamProfile = typeof teamProfiles.$inferSelect;
export type NewTeamProfile = typeof teamProfiles.$inferInsert;

export type MatchPrediction = typeof matchPredictions.$inferSelect;
export type NewMatchPrediction = typeof matchPredictions.$inferInsert;

export type SeasonForecast = typeof seasonForecasts.$inferSelect;
export type NewSeasonForecast = typeof seasonForecasts.$inferInsert;

export type PredictionHistory = typeof predictionHistory.$inferSelect;
export type NewPredictionHistory = typeof predictionHistory.$inferInsert;
