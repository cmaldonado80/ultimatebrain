import { pgTable, text, timestamp, boolean, jsonb, uuid, integer, real, index } from 'drizzle-orm/pg-core'
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

// Feature #7: Flows
export const flows = pgTable('flows', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  steps: jsonb('steps').notNull(),
  status: text('status').default('draft').notNull(),
  createdBy: text('created_by'),
  version: integer('version').default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
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

// NOTE: Debate tables (debateSessions, debateNodes, debateEdges, debateElo)
// and token tables (tokenLedger, tokenBudgets) are defined in platform.ts
// with proper FK constraints to agents and brainEntities.
