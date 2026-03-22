import { pgTable, text, timestamp, boolean, jsonb, uuid, real, vector, index } from 'drizzle-orm/pg-core'
import { agents, workspaces, memoryTierEnum } from './core'

export const memories = pgTable('memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull(),
  content: text('content').notNull(),
  source: uuid('source').references(() => agents.id),
  confidence: real('confidence'),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  tier: memoryTierEnum('tier').default('recall').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('memories_key_idx').on(table.key),
  index('memories_tier_idx').on(table.tier),
])

export const memoryVectors = pgTable('memory_vectors', {
  memoryId: uuid('memory_id').references(() => memories.id).primaryKey(),
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
})

export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => chatSessions.id).notNull(),
  role: text('role').notNull(),
  text: text('text').notNull(),
  attachment: jsonb('attachment'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const agentMessages = pgTable('agent_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromAgentId: uuid('from_agent_id').references(() => agents.id).notNull(),
  toAgentId: uuid('to_agent_id').references(() => agents.id).notNull(),
  text: text('text').notNull(),
  read: boolean('read').default(false),
  ackStatus: text('ack_status'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('agent_messages_to_read_idx').on(table.toAgentId, table.read),
])

export const episodes = pgTable('episodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('episodes_type_created_idx').on(table.eventType, table.createdAt),
])

export const cognitionState = pgTable('cognition_state', {
  id: text('id').primaryKey().default('1'),
  features: jsonb('features'),
  policies: jsonb('policies'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const promptOverlays = pgTable('prompt_overlays', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  content: text('content').notNull(),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const agentTrustScores = pgTable('agent_trust_scores', {
  agentId: uuid('agent_id').references(() => agents.id).primaryKey(),
  score: real('score').default(0.5).notNull(),
  factors: jsonb('factors'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const cognitiveCandidates = pgTable('cognitive_candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  memoryId: uuid('memory_id').references(() => memories.id),
  status: text('status').default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
