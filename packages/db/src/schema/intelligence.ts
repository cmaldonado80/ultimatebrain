import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core'

import { agents, memoryTierEnum, workspaces } from './core'

// === Enums ===
export const candidateStatusEnum = pgEnum('candidate_status', ['pending', 'promoted', 'rejected'])

// ── Chat Run Tracking ──────────────────────────────────────────────────

export const chatRunStatusEnum = pgEnum('chat_run_status', [
  'running',
  'completed',
  'failed',
  'retried',
])

export const chatStepTypeEnum = pgEnum('chat_step_type', ['agent', 'tool', 'synthesis'])

export const chatStepStatusEnum = pgEnum('chat_step_status', ['running', 'completed', 'failed'])

export const retryTypeEnum = pgEnum('retry_type', ['manual', 'auto', 'suggested'])
export const retryScopeEnum = pgEnum('retry_scope', ['run', 'group', 'step'])
export const runAutonomyEnum = pgEnum('run_autonomy', ['manual', 'assist', 'auto'])

export const chatRuns = pgTable(
  'chat_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .references(() => chatSessions.id, { onDelete: 'cascade' })
      .notNull(),
    userMessageId: uuid('user_message_id').references(() => chatMessages.id, {
      onDelete: 'set null',
    }),
    status: chatRunStatusEnum('status').default('running').notNull(),
    agentIds: text('agent_ids').array(),
    stepCount: integer('step_count').default(0),
    retryOfRunId: uuid('retry_of_run_id'),
    retryType: retryTypeEnum('retry_type'),
    retryScope: retryScopeEnum('retry_scope'),
    retryTargetId: text('retry_target_id'),
    retryReason: text('retry_reason'),
    workflowId: uuid('workflow_id'),
    workflowName: text('workflow_name'),
    autonomyLevel: runAutonomyEnum('autonomy_level').default('manual'),
    autoActionsCount: integer('auto_actions_count').default(0),
    memoryCount: integer('memory_count').default(0),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    durationMs: integer('duration_ms'),
  },
  (t) => [
    index('chat_runs_session_idx').on(t.sessionId),
    index('chat_runs_started_idx').on(t.startedAt),
  ],
)

export const chatRunSteps = pgTable(
  'chat_run_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .references(() => chatRuns.id, { onDelete: 'cascade' })
      .notNull(),
    sequence: integer('sequence').notNull(),
    type: chatStepTypeEnum('type').notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    agentName: text('agent_name'),
    toolName: text('tool_name'),
    toolInput: jsonb('tool_input'),
    toolResult: text('tool_result'),
    groupId: text('group_id'),
    status: chatStepStatusEnum('status').default('running').notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    durationMs: integer('duration_ms'),
  },
  (t) => [
    index('chat_run_steps_run_idx').on(t.runId),
    index('chat_run_steps_sequence_idx').on(t.runId, t.sequence),
    index('chat_run_steps_group_idx').on(t.groupId),
  ],
)

// ── Run-Memory Linkage (per-run memory transparency) ────────────────────

export const runMemoryUsage = pgTable(
  'run_memory_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .references(() => chatRuns.id, { onDelete: 'cascade' })
      .notNull(),
    memoryId: uuid('memory_id').notNull(), // FK to memories (added after memories table)
    confidence: real('confidence'),
    tier: memoryTierEnum('tier'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('run_memory_usage_run_idx').on(t.runId)],
)

export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    content: text('content').notNull(),
    source: uuid('source').references(() => agents.id, { onDelete: 'set null' }),
    confidence: real('confidence').default(0.5).notNull(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    tier: memoryTierEnum('tier').default('recall').notNull(),
    accessCount: integer('access_count').default(0).notNull(),
    lastAccessedAt: timestamp('last_accessed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('memories_key_idx').on(table.key),
    index('memories_tier_idx').on(table.tier),
    index('memories_workspace_id_idx').on(table.workspaceId),
  ],
)

export const memoryVectors = pgTable('memory_vectors', {
  memoryId: uuid('memory_id')
    .references(() => memories.id, { onDelete: 'cascade' })
    .primaryKey(),
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('chat_sessions_agent_id_idx').on(t.agentId),
    index('chat_sessions_workspace_id_idx').on(t.workspaceId),
  ],
)

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .references(() => chatSessions.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').notNull(),
    text: text('text').notNull(),
    sourceAgentId: uuid('source_agent_id'),
    attachment: jsonb('attachment'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [index('chat_messages_session_id_idx').on(t.sessionId)],
)

export const agentMessages = pgTable(
  'agent_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromAgentId: uuid('from_agent_id')
      .references(() => agents.id, { onDelete: 'cascade' })
      .notNull(),
    toAgentId: uuid('to_agent_id')
      .references(() => agents.id, { onDelete: 'cascade' })
      .notNull(),
    text: text('text').notNull(),
    read: boolean('read').default(false).notNull(),
    ackStatus: text('ack_status').default('pending').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('agent_messages_to_read_idx').on(table.toAgentId, table.read),
    index('agent_messages_from_agent_id_idx').on(table.fromAgentId),
    index('agent_messages_to_agent_id_idx').on(table.toAgentId),
  ],
)

export const episodes = pgTable(
  'episodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [index('episodes_type_created_idx').on(table.eventType, table.createdAt)],
)

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
  agentId: uuid('agent_id')
    .references(() => agents.id, { onDelete: 'cascade' })
    .primaryKey(),
  score: real('score').default(0.5).notNull(),
  factors: jsonb('factors'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const cognitiveCandidates = pgTable(
  'cognitive_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memoryId: uuid('memory_id')
      .references(() => memories.id, { onDelete: 'cascade' })
      .notNull(),
    status: candidateStatusEnum('status').default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [index('cognitive_candidates_memory_id_idx').on(t.memoryId)],
)

// ── Workflow Intelligence (cached aggregates) ──────────────────────────

// ── Recommendation Feedback Loop ───────────────────────────────────────

export const recommendationEvents = pgTable(
  'recommendation_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .references(() => chatSessions.id, { onDelete: 'cascade' })
      .notNull(),
    runId: uuid('run_id'),
    recommendationId: text('recommendation_id').notNull(),
    recommendationType: text('recommendation_type').notNull(),
    workflowId: uuid('workflow_id'),
    autonomyLevel: text('autonomy_level'),
    confidence: real('confidence'),
    shownAt: timestamp('shown_at').defaultNow().notNull(),
    dismissedAt: timestamp('dismissed_at'),
    clickedAt: timestamp('clicked_at'),
    actionType: text('action_type'),
    resultingRunId: uuid('resulting_run_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('rec_events_session_idx').on(t.sessionId),
    index('rec_events_type_idx').on(t.recommendationType),
    index('rec_events_workflow_idx').on(t.workflowId),
    index('rec_events_resulting_run_idx').on(t.resultingRunId),
  ],
)

export const recommendationOutcomes = pgTable(
  'recommendation_outcomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .references(() => recommendationEvents.id, { onDelete: 'cascade' })
      .notNull(),
    resultingRunId: uuid('resulting_run_id').notNull(),
    improved: boolean('improved').default(false).notNull(),
    faster: boolean('faster').default(false).notNull(),
    recovered: boolean('recovered').default(false).notNull(),
    fewerSteps: boolean('fewer_steps').default(false).notNull(),
    deltaDurationMs: integer('delta_duration_ms'),
    deltaStepCount: integer('delta_step_count'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('rec_outcomes_event_idx').on(t.eventId),
    index('rec_outcomes_run_idx').on(t.resultingRunId),
  ],
)

// ── Workflow Intelligence (cached aggregates) ──────────────────────────

export const workflowInsights = pgTable(
  'workflow_insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id'),
    workflowName: text('workflow_name'),
    totalRuns: integer('total_runs').default(0).notNull(),
    completedRuns: integer('completed_runs').default(0).notNull(),
    failedRuns: integer('failed_runs').default(0).notNull(),
    successRate: real('success_rate').default(0).notNull(),
    avgDurationMs: integer('avg_duration_ms'),
    avgStepCount: integer('avg_step_count'),
    retryRecoveryRate: real('retry_recovery_rate'),
    memoryImpactScore: real('memory_impact_score'),
    autonomyBreakdown: jsonb('autonomy_breakdown'),
    topAgentIds: text('top_agent_ids').array(),
    topToolNames: text('top_tool_names').array(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('workflow_insights_workflow_idx').on(t.workflowId)],
)
