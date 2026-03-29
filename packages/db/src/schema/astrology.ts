/**
 * Astrology Domain Schema — persisted charts, reports, and relationships.
 *
 * All records are org-scoped via organizationId and creator-tracked via createdByUserId.
 */

import { index, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// ── Charts ───────────────────────────────────────────────────────────

export const astrologyCharts = pgTable(
  'astrology_charts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id'),
    createdByUserId: uuid('created_by_user_id'),
    name: text('name').notNull(),
    birthDate: text('birth_date').notNull(),
    birthTime: text('birth_time').notNull(),
    latitude: real('latitude').notNull(),
    longitude: real('longitude').notNull(),
    timezone: real('timezone'),
    chartData: jsonb('chart_data').notNull(),
    highlights: jsonb('highlights'),
    summary: text('summary'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('astrology_charts_org_idx').on(t.organizationId),
    index('astrology_charts_user_idx').on(t.createdByUserId),
  ],
)

// ── Reports ──────────────────────────────────────────────────────────

export const astrologyReports = pgTable(
  'astrology_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id'),
    chartId: uuid('chart_id')
      .references(() => astrologyCharts.id, { onDelete: 'cascade' })
      .notNull(),
    reportType: text('report_type').default('natal').notNull(),
    sections: jsonb('sections').notNull(),
    summary: text('summary'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('astrology_reports_org_idx').on(t.organizationId),
    index('astrology_reports_chart_idx').on(t.chartId),
  ],
)

// ── Relationships / Synastry ─────────────────────────────────────────

export const astrologyRelationships = pgTable(
  'astrology_relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id'),
    createdByUserId: uuid('created_by_user_id'),
    personAName: text('person_a_name').notNull(),
    personAData: jsonb('person_a_data').notNull(),
    personBName: text('person_b_name').notNull(),
    personBData: jsonb('person_b_data').notNull(),
    compatibilityScore: real('compatibility_score'),
    synastryData: jsonb('synastry_data'),
    narrative: text('narrative'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('astrology_relationships_org_idx').on(t.organizationId),
    index('astrology_relationships_user_idx').on(t.createdByUserId),
  ],
)

// ── Share Tokens ─────────────────────────────────────────────────────

export const astrologyShareTokens = pgTable(
  'astrology_share_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),
    token: text('token').unique().notNull(),
    createdByUserId: uuid('created_by_user_id'),
    organizationId: uuid('organization_id'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('share_tokens_token_idx').on(t.token),
    index('share_tokens_resource_idx').on(t.resourceType, t.resourceId),
  ],
)
