import { pgTable, text, timestamp, boolean, jsonb, uuid, integer, real } from 'drizzle-orm/pg-core'
import { agents, entityTierEnum, entityStatusEnum, entityAgentRoleEnum, debateSessionStatusEnum, debateEdgeTypeEnum, projects } from './core'

// Brain entity hierarchy
export const brainEntities = pgTable('brain_entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  domain: text('domain'),
  tier: entityTierEnum('tier').notNull(),
  parentId: uuid('parent_id'),
  enginesEnabled: text('engines_enabled').array(),
  domainEngines: jsonb('domain_engines'),
  apiKeyHash: text('api_key_hash'),
  endpoint: text('endpoint'),
  healthEndpoint: text('health_endpoint'),
  status: entityStatusEnum('status').default('provisioning').notNull(),
  config: jsonb('config'),
  hookProfile: text('hook_profile').default('standard'),
  lastHealthCheck: timestamp('last_health_check'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const brainEntityAgents = pgTable('brain_entity_agents', {
  entityId: uuid('entity_id').references(() => brainEntities.id).notNull(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  role: entityAgentRoleEnum('role').default('primary').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const brainEngineUsage = pgTable('brain_engine_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => brainEntities.id).notNull(),
  engine: text('engine').notNull(),
  requestsCount: integer('requests_count').default(0),
  tokensUsed: integer('tokens_used').default(0),
  costUsd: real('cost_usd').default(0),
  period: timestamp('period').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Debate persistence
export const debateSessions = pgTable('debate_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id),
  status: debateSessionStatusEnum('status').default('active').notNull(),
  constitutionalRules: jsonb('constitutional_rules'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const debateNodes = pgTable('debate_nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => debateSessions.id).notNull(),
  agentId: uuid('agent_id').references(() => agents.id),
  text: text('text').notNull(),
  validity: real('validity'),
  parentId: uuid('parent_id'),
  isAxiom: boolean('is_axiom').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const debateEdges = pgTable('debate_edges', {
  fromNodeId: uuid('from_node_id').references(() => debateNodes.id).notNull(),
  toNodeId: uuid('to_node_id').references(() => debateNodes.id).notNull(),
  type: debateEdgeTypeEnum('type').notNull(),
})

export const debateElo = pgTable('debate_elo', {
  agentId: uuid('agent_id').references(() => agents.id).primaryKey(),
  eloRating: integer('elo_rating').default(1200).notNull(),
  matches: integer('matches').default(0),
  wins: integer('wins').default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Token accounting
export const tokenLedger = pgTable('token_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => brainEntities.id),
  agentId: uuid('agent_id').references(() => agents.id),
  model: text('model'),
  provider: text('provider'),
  tokensIn: integer('tokens_in').default(0),
  tokensOut: integer('tokens_out').default(0),
  costUsd: real('cost_usd').default(0),
  period: timestamp('period').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const tokenBudgets = pgTable('token_budgets', {
  entityId: uuid('entity_id').references(() => brainEntities.id).primaryKey(),
  dailyLimitUsd: real('daily_limit_usd'),
  monthlyLimitUsd: real('monthly_limit_usd'),
  alertThreshold: real('alert_threshold').default(0.8),
  enforce: boolean('enforce').default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
