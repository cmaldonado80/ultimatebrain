import { pgTable, text, timestamp, boolean, jsonb, uuid, integer, index } from 'drizzle-orm/pg-core'
import { agents, workspaces, tickets } from './core'

export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(),
  config: jsonb('config'),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: text('source'),
  url: text('url').notNull(),
  secret: text('secret'),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  content: text('content'),
  ticketId: uuid('ticket_id').references(() => tickets.id),
  agentId: uuid('agent_id').references(() => agents.id),
  type: text('type'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const strategyRuns = pgTable('strategy_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  plan: text('plan'),
  status: text('status').default('pending'),
  agentId: uuid('agent_id').references(() => agents.id),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  tickets: text('tickets').array(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
})

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  encryptedKey: text('encrypted_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const modelFallbacks = pgTable('model_fallbacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id),
  chain: text('chain').array().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const orchestratorRoutes = pgTable('orchestrator_routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromWorkspace: uuid('from_workspace').references(() => workspaces.id),
  toWorkspace: uuid('to_workspace').references(() => workspaces.id),
  rule: text('rule'),
  priority: integer('priority').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})
