import { pgTable, text, timestamp, boolean, jsonb, uuid, real, vector, index, pgEnum } from 'drizzle-orm/pg-core'
import { agents, workspaces, memoryTierEnum } from './core'

// === Enums ===
export const candidateStatusEnum = pgEnum('candidate_status', ['pending', 'promoted', 'rejected'])

export const memories = pgTable('memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull(),
  content: text('content').notNull(),
  source: uuid('source').references(() => agents.id, { onDelete: 'set null' }),
  confidence: real('confidence'),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
  tier: memoryTierEnum('tier').default('recall').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('memories_key_idx').on(table.key),
  index('memories_tier_idx').on(table.tier),
  index('memories_workspace_id_idx').on(table.workspaceId),
])

export const memoryVectors = pgTable('memory_vectors', {
  memoryId: uuid('memory_id').references(() => memories.id, { onDelete: 'cascade' }).primaryKey(),
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('chat_sessions_agent_id_idx').on(t.agentId),
])

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').notNull(),
  text: text('text').notNull(),
  attachment: jsonb('attachment'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const agentMessages = pgTable('agent_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromAgentId: uuid('from_agent_id').references(() => agents.id, { onDelete: 'cascade' }).notNull(),
  toAgentId: uuid('to_agent_id').references(() => agents.id, { onDelete: 'cascade' }).notNull(),
  text: text('text').notNull(),
  read: boolean('read').default(false),
  ackStatus: text('ack_status'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('agent_messages_to_read_idx').on(table.toAgentId, table.read),
  index('agent_messages_from_agent_id_idx').on(table.fromAgentId),
  index('agent_messages_to_agent_id_idx').on(table.toAgentId),
])

export const episodes = pgTable('episodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
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
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const agentTrustScores = pgTable('agent_trust_scores', {
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }).primaryKey(),
  score: real('score').default(0.5).notNull(),
  factors: jsonb('factors'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const cognitiveCandidates = pgTable('cognitive_candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  memoryId: uuid('memory_id').references(() => memories.id, { onDelete: 'cascade' }),
  status: candidateStatusEnum('status').default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})
