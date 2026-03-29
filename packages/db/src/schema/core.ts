import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

// === Enums ===

export const entityTierEnum = pgEnum('entity_tier', ['brain', 'mini_brain', 'development'])
export const entityStatusEnum = pgEnum('entity_status', [
  'provisioning',
  'configured',
  'deployed',
  'verified',
  'active',
  'degraded',
  'suspended',
  'retired',
])
export const ticketStatusEnum = pgEnum('ticket_status', [
  'backlog',
  'queued',
  'in_progress',
  'review',
  'done',
  'failed',
  'cancelled',
])
export const ticketPriorityEnum = pgEnum('ticket_priority', ['low', 'medium', 'high', 'critical'])
export const ticketComplexityEnum = pgEnum('ticket_complexity', [
  'easy',
  'medium',
  'hard',
  'critical',
])
export const executionModeEnum = pgEnum('execution_mode', ['quick', 'autonomous', 'deep_work'])
export const agentStatusEnum = pgEnum('agent_status', [
  'idle',
  'planning',
  'executing',
  'reviewing',
  'error',
  'offline',
])
export const memoryTierEnum = pgEnum('memory_tier', ['core', 'recall', 'archival'])
export const approvalStatusEnum = pgEnum('approval_status', [
  'pending',
  'approved',
  'denied',
  'expired',
])
export const guardrailLayerEnum = pgEnum('guardrail_layer', ['input', 'tool', 'output'])
export const entityAgentRoleEnum = pgEnum('entity_agent_role', [
  'primary',
  'monitor',
  'healer',
  'specialist',
])
export const debateEdgeTypeEnum = pgEnum('debate_edge_type', ['support', 'attack', 'rebuttal'])
export const debateSessionStatusEnum = pgEnum('debate_session_status', [
  'active',
  'completed',
  'cancelled',
])
export const cronJobStatusEnum = pgEnum('cron_job_status', ['active', 'paused', 'failed'])
export const receiptStatusEnum = pgEnum('receipt_status', [
  'running',
  'completed',
  'failed',
  'rolled_back',
])
export const projectStatusEnum = pgEnum('project_status', [
  'planning',
  'active',
  'completed',
  'cancelled',
])
export const instinctScopeEnum = pgEnum('instinct_scope', ['development', 'mini_brain', 'brain'])
export const workspaceLifecycleEnum = pgEnum('workspace_lifecycle', [
  'draft',
  'active',
  'paused',
  'retired',
])
export const workspaceTypeEnum = pgEnum('workspace_type', [
  'general',
  'development',
  'staging',
  'system',
])
export const modelTypeEnum = pgEnum('model_type', [
  'vision',
  'reasoning',
  'agentic',
  'coder',
  'embedding',
  'flash',
  'guard',
  'judge',
  'router',
  'multimodal',
])
export const workspaceBindingTypeEnum = pgEnum('workspace_binding_type', [
  'brain',
  'engine',
  'skill',
])
export const secretTypeEnum = pgEnum('secret_type', [
  'brain_api_key',
  'mini_brain_secret',
  'app_secret',
  'database_url',
])

export const secretStatusEnum = pgEnum('secret_status', [
  'active',
  'rotating',
  'pending_activation',
  'revoked',
])

export const deploymentWorkflowStatusEnum = pgEnum('deployment_workflow_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
])

export const workspaceGoalStatusEnum = pgEnum('workspace_goal_status', [
  'active',
  'achieved',
  'abandoned',
])

// === Core Tables ===

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: workspaceTypeEnum('type').default('general'),
  goal: text('goal'),
  color: text('color'),
  icon: text('icon'),
  autonomyLevel: integer('autonomy_level').default(1),
  lifecycleState: workspaceLifecycleEnum('lifecycle_state').default('draft').notNull(),
  isSystemProtected: boolean('is_system_protected').default(false),
  createdBy: uuid('created_by'),
  settings: jsonb('settings'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: text('type'),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'restrict' }),
    status: agentStatusEnum('status').default('idle').notNull(),
    model: text('model'),
    color: text('color'),
    bg: text('bg'),
    description: text('description'),
    tags: text('tags').array(),
    skills: text('skills').array(),
    isWsOrchestrator: boolean('is_ws_orchestrator').default(false),
    parentOrchestratorId: uuid('parent_orchestrator_id'),
    requiredModelType: modelTypeEnum('required_model_type'),
    triggerMode: text('trigger_mode'),
    soul: text('soul'),
    temperature: real('temperature').default(1.0),
    maxTokens: integer('max_tokens').default(4096),
    toolAccess: text('tool_access').array(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('agents_workspace_id_idx').on(t.workspaceId),
    index('agents_workspace_status_idx').on(t.workspaceId, t.status),
    index('agents_type_idx').on(t.type),
  ],
)

export const modelRegistry = pgTable(
  'model_registry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modelId: text('model_id').notNull().unique(),
    displayName: text('display_name').notNull(),
    provider: text('provider').notNull(),
    modelType: modelTypeEnum('model_type').notNull(),
    secondaryTypes: text('secondary_types').array(),
    contextWindow: integer('context_window'),
    maxOutputTokens: integer('max_output_tokens'),
    supportsVision: boolean('supports_vision').default(false),
    supportsTools: boolean('supports_tools').default(false),
    supportsStreaming: boolean('supports_streaming').default(false),
    inputCostPerMToken: real('input_cost_per_m_token'),
    outputCostPerMToken: real('output_cost_per_m_token'),
    speedTier: text('speed_tier'),
    isActive: boolean('is_active').default(true).notNull(),
    detectedAt: timestamp('detected_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('model_registry_provider_idx').on(t.provider),
    index('model_registry_type_idx').on(t.modelType),
  ],
)

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  goal: text('goal'),
  status: projectStatusEnum('status').default('planning').notNull(),
  deadline: timestamp('deadline'),
  healthScore: real('health_score'),
  healthDiagnosis: text('health_diagnosis'),
  synthesis: text('synthesis'),
  cancelled: boolean('cancelled').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const projectWorkspaces = pgTable(
  'project_workspaces',
  {
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.workspaceId] })],
)

export const projectLog = pgTable(
  'project_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: uuid('workspace_id'),
    agentId: uuid('agent_id'),
    updatedAt: timestamp('updated_at').defaultNow(),
    reply: text('reply'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('project_log_project_id_idx').on(t.projectId)],
)

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description'),
    status: ticketStatusEnum('status').default('backlog').notNull(),
    priority: ticketPriorityEnum('priority').default('medium').notNull(),
    complexity: ticketComplexityEnum('complexity').default('medium').notNull(),
    executionMode: executionModeEnum('execution_mode').default('autonomous'),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    assignedAgentId: uuid('assigned_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    dagId: text('dag_id'),
    dagNodeType: text('dag_node_type'),
    metadata: jsonb('metadata'),
    result: text('result'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('tickets_workspace_id_idx').on(t.workspaceId),
    index('tickets_assigned_agent_id_idx').on(t.assignedAgentId),
    index('tickets_project_id_idx').on(t.projectId),
    index('tickets_status_priority_idx').on(t.status, t.priority, t.createdAt),
  ],
)

export const ticketExecution = pgTable('ticket_execution', {
  ticketId: uuid('ticket_id')
    .references(() => tickets.id, { onDelete: 'cascade' })
    .primaryKey(),
  runId: text('run_id'),
  lockOwner: uuid('lock_owner').references(() => agents.id, { onDelete: 'set null' }),
  lockedAt: timestamp('locked_at'),
  leaseUntil: timestamp('lease_until'),
  leaseSeconds: integer('lease_seconds'),
  wakePendingCount: integer('wake_pending_count').default(0),
  lastWakeAt: timestamp('last_wake_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const ticketStatusHistory = pgTable(
  'ticket_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .references(() => tickets.id, { onDelete: 'cascade' })
      .notNull(),
    fromStatus: ticketStatusEnum('from_status'),
    toStatus: ticketStatusEnum('to_status').notNull(),
    changedAt: timestamp('changed_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [index('ticket_status_history_ticket_id_idx').on(t.ticketId)],
)

export const ticketComments = pgTable(
  'ticket_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .references(() => tickets.id, { onDelete: 'cascade' })
      .notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    text: text('text').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [index('ticket_comments_ticket_id_idx').on(t.ticketId)],
)

export const ticketDependencies = pgTable(
  'ticket_dependencies',
  {
    ticketId: uuid('ticket_id')
      .references(() => tickets.id, { onDelete: 'cascade' })
      .notNull(),
    blockedByTicketId: uuid('blocked_by_ticket_id')
      .references(() => tickets.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.blockedByTicketId] })],
)

export const ticketProof = pgTable('ticket_proof', {
  ticketId: uuid('ticket_id')
    .references(() => tickets.id, { onDelete: 'cascade' })
    .primaryKey(),
  status: text('status'),
  shadowRequired: boolean('shadow_required').default(false),
  visualRequired: boolean('visual_required').default(false),
  shadowRunId: text('shadow_run_id'),
  visualRunId: text('visual_run_id'),
  checkedAt: timestamp('checked_at'),
  details: jsonb('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// === Workspace Bindings ===

export const workspaceBindings = pgTable(
  'workspace_bindings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    bindingType: workspaceBindingTypeEnum('binding_type').notNull(),
    bindingKey: text('binding_key').notNull(),
    config: jsonb('config'),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('workspace_bindings_workspace_id_idx').on(t.workspaceId)],
)

// === Workspace Goals ===

export const workspaceGoals = pgTable(
  'workspace_goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    description: text('description'),
    priority: integer('priority').default(0).notNull(),
    status: workspaceGoalStatusEnum('status').default('active').notNull(),
    targetMetric: text('target_metric'),
    targetValue: real('target_value'),
    currentValue: real('current_value'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('workspace_goals_workspace_id_idx').on(t.workspaceId)],
)

// === Workspace Lifecycle Events ===

export const workspaceLifecycleEvents = pgTable(
  'workspace_lifecycle_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    eventType: text('event_type').notNull(),
    fromState: workspaceLifecycleEnum('from_state'),
    toState: workspaceLifecycleEnum('to_state'),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('workspace_lifecycle_events_workspace_id_idx').on(t.workspaceId)],
)
