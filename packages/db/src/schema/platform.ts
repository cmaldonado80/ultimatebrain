import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  uuid,
  integer,
  real,
  primaryKey,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import {
  agents,
  entityTierEnum,
  entityStatusEnum,
  entityAgentRoleEnum,
  debateSessionStatusEnum,
  debateEdgeTypeEnum,
  projects,
} from './core'

// Brain entity hierarchy
export const brainEntities = pgTable('brain_entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  domain: text('domain'),
  tier: entityTierEnum('tier').notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => brainEntities.id, {
    onDelete: 'set null',
  }),
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

export const brainEntityAgents = pgTable(
  'brain_entity_agents',
  {
    entityId: uuid('entity_id')
      .references(() => brainEntities.id, { onDelete: 'cascade' })
      .notNull(),
    agentId: uuid('agent_id')
      .references(() => agents.id, { onDelete: 'cascade' })
      .notNull(),
    role: entityAgentRoleEnum('role').default('primary').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.entityId, t.agentId] })],
)

export const brainEngineUsage = pgTable(
  'brain_engine_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id')
      .references(() => brainEntities.id, { onDelete: 'cascade' })
      .notNull(),
    engine: text('engine').notNull(),
    requestsCount: integer('requests_count').default(0),
    tokensUsed: integer('tokens_used').default(0),
    costUsd: real('cost_usd').default(0),
    period: timestamp('period').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    index('brain_engine_usage_entity_id_idx').on(t.entityId),
    index('brain_engine_usage_entity_period_idx').on(t.entityId, t.period),
  ],
)

// Debate persistence
export const debateSessions = pgTable('debate_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  status: debateSessionStatusEnum('status').default('active').notNull(),
  constitutionalRules: jsonb('constitutional_rules'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const debateNodes = pgTable(
  'debate_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .references(() => debateSessions.id, { onDelete: 'cascade' })
      .notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    text: text('text').notNull(),
    validity: real('validity'),
    parentId: uuid('parent_id').references((): AnyPgColumn => debateNodes.id, {
      onDelete: 'set null',
    }),
    isAxiom: boolean('is_axiom').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [index('debate_nodes_session_id_idx').on(t.sessionId)],
)

export const debateEdges = pgTable(
  'debate_edges',
  {
    fromNodeId: uuid('from_node_id')
      .references(() => debateNodes.id, { onDelete: 'cascade' })
      .notNull(),
    toNodeId: uuid('to_node_id')
      .references(() => debateNodes.id, { onDelete: 'cascade' })
      .notNull(),
    type: debateEdgeTypeEnum('type').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.fromNodeId, t.toNodeId] }),
    index('debate_edges_to_node_id_idx').on(t.toNodeId),
  ],
)

export const debateElo = pgTable('debate_elo', {
  agentId: uuid('agent_id')
    .references(() => agents.id, { onDelete: 'cascade' })
    .primaryKey(),
  eloRating: integer('elo_rating').default(1200).notNull(),
  matches: integer('matches').default(0),
  wins: integer('wins').default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Token accounting
export const tokenLedger = pgTable(
  'token_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id').references(() => brainEntities.id, { onDelete: 'set null' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    model: text('model'),
    provider: text('provider'),
    tokensIn: integer('tokens_in').default(0),
    tokensOut: integer('tokens_out').default(0),
    costUsd: real('cost_usd').default(0),
    period: timestamp('period').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    index('token_ledger_entity_id_idx').on(t.entityId),
    index('token_ledger_entity_period_idx').on(t.entityId, t.period),
  ],
)

export const tokenBudgets = pgTable('token_budgets', {
  entityId: uuid('entity_id')
    .references(() => brainEntities.id, { onDelete: 'cascade' })
    .primaryKey(),
  dailyLimitUsd: real('daily_limit_usd'),
  monthlyLimitUsd: real('monthly_limit_usd'),
  alertThreshold: real('alert_threshold').default(0.8),
  enforce: boolean('enforce').default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
