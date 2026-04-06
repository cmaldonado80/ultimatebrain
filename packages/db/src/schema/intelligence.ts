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
    index('chat_run_steps_agent_idx').on(t.agentId),
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
  (t) => [
    index('run_memory_usage_run_idx').on(t.runId),
    index('run_memory_usage_memory_id_idx').on(t.memoryId),
  ],
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
    // Observation layer (Hindsight-inspired)
    factType: text('fact_type').default('raw'), // 'raw' | 'observation' | 'consolidated'
    proofCount: integer('proof_count').default(1).notNull(),
    sourceMemoryIds: uuid('source_memory_ids').array(),
    occurredStart: timestamp('occurred_start'),
    occurredEnd: timestamp('occurred_end'),
    supersedes: uuid('supersedes'), // ID of memory this one replaced (temporal contradiction)
    effectivenessWeight: real('effectiveness_weight').default(0.5),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('memories_key_idx').on(table.key),
    index('memories_tier_idx').on(table.tier),
    index('memories_workspace_id_idx').on(table.workspaceId),
    index('memories_fact_type_idx').on(table.factType),
    index('memories_proof_count_idx').on(table.proofCount),
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

/** Context effectiveness — tracks quality correlation per memory source */
export const contextEffectiveness = pgTable(
  'context_effectiveness',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memoryId: uuid('memory_id').references(() => memories.id, { onDelete: 'cascade' }),
    runId: uuid('run_id'),
    qualityScore: real('quality_score'),
    sourceType: text('source_type'), // 'rag' | 'memory' | 'peer' | 'critical'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('context_effectiveness_memory_id_idx').on(t.memoryId)],
)

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    modelOverride: text('model_override'), // Per-session model override (e.g., 'deepseek-v3.2:cloud')
    parentSessionId: uuid('parent_session_id'), // For session branching
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
    avgQualityScore: real('avg_quality_score'),
    highQualityRate: real('high_quality_rate'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('workflow_insights_workflow_idx').on(t.workflowId)],
)

// ── Run Quality Scoring ───────────────────────────────────────────────

export const runQuality = pgTable(
  'run_quality',
  {
    runId: uuid('run_id')
      .references(() => chatRuns.id, { onDelete: 'cascade' })
      .primaryKey(),
    score: real('score').notNull(),
    label: text('label').notNull(),
    successScore: real('success_score').notNull(),
    efficiencyScore: real('efficiency_score').notNull(),
    stabilityScore: real('stability_score').notNull(),
    consistencyScore: real('consistency_score').notNull(),
    explanation: text('explanation').notNull(),
    computedAt: timestamp('computed_at').defaultNow().notNull(),
  },
  (t) => [index('run_quality_score_idx').on(t.score)],
)

// ── Agent Evolution (A-Evolve inspired) ─────────────────────────────

export const evolutionStatusEnum = pgEnum('evolution_status', [
  'running',
  'accepted',
  'rejected',
  'rolled_back',
])

/**
 * Versioned snapshots of agent soul/config — every mutation is tracked.
 * Enables rollback to any prior version.
 */
export const agentSoulVersions = pgTable(
  'agent_soul_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .references(() => agents.id, { onDelete: 'cascade' })
      .notNull(),
    version: integer('version').notNull(),
    soul: text('soul').notNull(),
    model: text('model'),
    temperature: real('temperature'),
    maxTokens: integer('max_tokens'),
    toolAccess: text('tool_access').array(),
    // Performance at this version (populated after runs)
    avgQualityScore: real('avg_quality_score'),
    successRate: real('success_rate'),
    totalRuns: integer('total_runs').default(0),
    // Lineage
    parentVersionId: uuid('parent_version_id'),
    cycleId: uuid('cycle_id'),
    mutationSummary: text('mutation_summary'),
    isActive: boolean('is_active').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('soul_versions_agent_idx').on(t.agentId),
    index('soul_versions_active_idx').on(t.agentId, t.isActive),
    index('soul_versions_agent_version_idx').on(t.agentId, t.version),
  ],
)

/**
 * Evolution cycles — each run of the Observe→Analyze→Mutate→Gate→Apply loop.
 * Tracks what changed, why, and whether it helped.
 */
export const evolutionCycles = pgTable(
  'evolution_cycles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .references(() => agents.id, { onDelete: 'cascade' })
      .notNull(),
    cycleNumber: integer('cycle_number').notNull(),
    status: evolutionStatusEnum('status').notNull().default('running'),
    // Observation phase
    observedRuns: integer('observed_runs').default(0),
    preScore: real('pre_score'),
    // Analysis
    failurePatterns: jsonb('failure_patterns'), // Array<{pattern, count, severity}>
    analysisPrompt: text('analysis_prompt'),
    analysisSummary: text('analysis_summary'),
    // Mutation
    proposedSoul: text('proposed_soul'),
    mutationDiff: text('mutation_diff'), // Summary of changes
    // Gating
    gateScore: real('gate_score'),
    gateThreshold: real('gate_threshold'),
    gatePassed: boolean('gate_passed'),
    // Result
    postScore: real('post_score'),
    scoreDelta: real('score_delta'),
    fromVersionId: uuid('from_version_id'),
    toVersionId: uuid('to_version_id'),
    // Metadata
    costUsd: real('cost_usd'),
    durationMs: integer('duration_ms'),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (t) => [
    index('evo_cycles_agent_idx').on(t.agentId),
    index('evo_cycles_status_idx').on(t.status),
    index('evo_cycles_agent_cycle_idx').on(t.agentId, t.cycleNumber),
  ],
)

// ── Cross-Agent Learning (Soul Fragments) ───────────────────────────

/**
 * Reusable soul fragments extracted from successful evolution mutations.
 * When one agent evolves successfully, the improvement is captured as a
 * fragment that other agents can reference or auto-inherit.
 */
export const soulFragments = pgTable(
  'soul_fragments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    category: text('category').notNull(), // 'error_handling' | 'communication' | 'tool_use' | 'reasoning' | 'domain'
    sourceAgentId: uuid('source_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    sourceCycleId: uuid('source_cycle_id'),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    proofCount: integer('proof_count').default(1).notNull(),
    adoptedByCount: integer('adopted_by_count').default(0).notNull(),
    isGlobal: boolean('is_global').default(false).notNull(), // available to all workspaces
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    index('soul_fragments_workspace_idx').on(t.workspaceId),
    index('soul_fragments_category_idx').on(t.category),
    index('soul_fragments_global_idx').on(t.isGlobal),
  ],
)

/** Causal insights — tracks before/after impact of interventions */
export const causalInsights = pgTable(
  'causal_insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    interventionType: text('intervention_type').notNull(),
    target: text('target').notNull(),
    metric: text('metric').notNull(),
    delta: real('delta').notNull(),
    confidence: real('confidence').notNull(),
    sampleSize: integer('sample_size').notNull(),
    meanBefore: real('mean_before').notNull(),
    meanAfter: real('mean_after').notNull(),
    interventionDetail: text('intervention_detail'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('causal_insights_type_idx').on(t.interventionType)],
)

/** Pathway effectiveness — meta-learning: which learning paths yield best results */
export const pathwayEffectiveness = pgTable(
  'pathway_effectiveness',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: text('event_type').notNull(),
    volume: integer('volume').notNull(),
    promotedCount: integer('promoted_count').notNull(),
    yieldRate: real('yield_rate').notNull(),
    durabilityRate: real('durability_rate'),
    effectivenessScore: real('effectiveness_score').notNull(),
    adjustedThreshold: real('adjusted_threshold'),
    metaInsight: text('meta_insight'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('pathway_effectiveness_event_type_idx').on(t.eventType)],
)

/** Decision records — institutional memory for high-impact decisions */
export const decisionRecords = pgTable(
  'decision_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    description: text('description').notNull(),
    assumptions: jsonb('assumptions').default({}),
    stakeholders: jsonb('stakeholders').default([]),
    expectedOutcome: text('expected_outcome'),
    actualOutcome: text('actual_outcome'),
    status: text('status').default('pending').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('decision_records_type_idx').on(t.type),
    index('decision_records_status_idx').on(t.status),
  ],
)
