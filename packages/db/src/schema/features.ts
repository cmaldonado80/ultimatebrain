import { pgTable, text, timestamp, boolean, jsonb, uuid, integer, real, numeric, date, index, pgEnum } from 'drizzle-orm/pg-core'
import { agents, guardrailLayerEnum, instinctScopeEnum } from './core'

// Feature #1: Checkpointing
export const checkpoints = pgTable('checkpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  stepIndex: integer('step_index').notNull(),
  state: jsonb('state').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('checkpoints_entity_idx').on(table.entityType, table.entityId, table.stepIndex),
])

// Feature #2: Traces
export const traces = pgTable('traces', {
  traceId: text('trace_id').notNull(),
  parentSpanId: text('parent_span_id'),
  spanId: text('span_id').primaryKey(),
  operation: text('operation').notNull(),
  service: text('service'),
  agentId: uuid('agent_id'),
  ticketId: uuid('ticket_id'),
  durationMs: integer('duration_ms'),
  status: text('status'),
  attributes: jsonb('attributes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('traces_trace_id_idx').on(table.traceId),
  index('traces_agent_created_idx').on(table.agentId, table.createdAt),
  index('traces_ticket_idx').on(table.ticketId),
])

// Feature #3: Guardrails
export const guardrailLogs = pgTable('guardrail_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  layer: guardrailLayerEnum('layer').notNull(),
  agentId: uuid('agent_id'),
  ticketId: uuid('ticket_id'),
  ruleName: text('rule_name').notNull(),
  passed: boolean('passed').notNull(),
  violationDetail: text('violation_detail'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Feature #5: Evals
export const evalDatasets = pgTable('eval_datasets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const evalCases = pgTable('eval_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  datasetId: uuid('dataset_id').references(() => evalDatasets.id).notNull(),
  input: jsonb('input').notNull(),
  expectedOutput: jsonb('expected_output'),
  traceId: text('trace_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const evalRuns = pgTable('eval_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  datasetId: uuid('dataset_id').references(() => evalDatasets.id).notNull(),
  version: text('version'),
  scores: jsonb('scores'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Feature #7: A2A
export const agentCards = pgTable('agent_cards', {
  agentId: uuid('agent_id').references(() => agents.id).primaryKey(),
  capabilities: jsonb('capabilities'),
  authRequirements: jsonb('auth_requirements'),
  endpoint: text('endpoint'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Feature #8: Playbooks
export const playbooks = pgTable('playbooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  steps: jsonb('steps').notNull(),
  createdBy: text('created_by'),
  version: integer('version').default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Feature #9: Gateway Metrics
export const gatewayMetrics = pgTable('gateway_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  agentId: uuid('agent_id'),
  ticketId: uuid('ticket_id'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  latencyMs: integer('latency_ms'),
  costUsd: real('cost_usd'),
  cached: boolean('cached').default(false),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('gateway_metrics_provider_created_idx').on(table.provider, table.createdAt),
  index('gateway_metrics_agent_created_idx').on(table.agentId, table.createdAt),
])

// Feature #15: Skills Marketplace
export const skillsMarketplace = pgTable('skills_marketplace', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sourceUrl: text('source_url'),
  version: text('version'),
  installed: boolean('installed').default(false),
  config: jsonb('config'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ECC: Instincts
export const instincts = pgTable('instincts', {
  id: uuid('id').primaryKey().defaultRandom(),
  trigger: text('trigger').notNull(),
  action: text('action').notNull(),
  confidence: real('confidence').default(0.3).notNull(),
  domain: text('domain').default('universal'),
  scope: instinctScopeEnum('scope').default('development').notNull(),
  entityId: uuid('entity_id'),
  evidenceCount: integer('evidence_count').default(1),
  lastObservedAt: timestamp('last_observed_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const instinctObservations = pgTable('instinct_observations', {
  id: uuid('id').primaryKey().defaultRandom(),
  instinctId: uuid('instinct_id').references(() => instincts.id).notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Debate persistence (from ECC debate_sidebar.js redesign)
export const debateStatusEnum = pgEnum('debate_status', ['active', 'completed', 'cancelled'])
export const debateEdgeTypeEnum = pgEnum('debate_edge_type', ['support', 'attack', 'rebuttal'])

export const debateSessions = pgTable('debate_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id'),
  status: debateStatusEnum('status').default('active').notNull(),
  constitutionalRules: jsonb('constitutional_rules'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const debateNodes = pgTable('debate_nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => debateSessions.id).notNull(),
  agentId: uuid('agent_id'),
  text: text('text').notNull(),
  validity: real('validity'),
  parentId: uuid('parent_id'),
  isAxiom: boolean('is_axiom').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const debateEdges = pgTable('debate_edges', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromNodeId: uuid('from_node_id').references(() => debateNodes.id).notNull(),
  toNodeId: uuid('to_node_id').references(() => debateNodes.id).notNull(),
  type: debateEdgeTypeEnum('type').notNull(),
})

export const debateElo = pgTable('debate_elo', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').notNull(),
  eloRating: integer('elo_rating').default(1200).notNull(),
  matches: integer('matches').default(0).notNull(),
  wins: integer('wins').default(0).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Token accounting (from ECC cognition layer)
export const tokenLedger = pgTable('token_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id'),
  agentId: uuid('agent_id'),
  model: text('model').notNull(),
  provider: text('provider').notNull(),
  tokensIn: integer('tokens_in').default(0).notNull(),
  tokensOut: integer('tokens_out').default(0).notNull(),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).default('0').notNull(),
  period: date('period').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const tokenBudgets = pgTable('token_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').notNull(),
  dailyLimitUsd: numeric('daily_limit_usd', { precision: 10, scale: 2 }),
  monthlyLimitUsd: numeric('monthly_limit_usd', { precision: 10, scale: 2 }),
  alertThreshold: real('alert_threshold').default(0.8),
  enforce: boolean('enforce').default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
