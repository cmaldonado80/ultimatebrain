import { pgTable, text, timestamp, boolean, integer, jsonb, pgEnum, uuid, real, primaryKey, index } from 'drizzle-orm/pg-core'

// === Enums ===

export const entityTierEnum = pgEnum('entity_tier', ['brain', 'mini_brain', 'development'])
export const entityStatusEnum = pgEnum('entity_status', ['active', 'suspended', 'degraded', 'provisioning'])
export const ticketStatusEnum = pgEnum('ticket_status', ['backlog', 'queued', 'in_progress', 'review', 'done', 'failed', 'cancelled'])
export const ticketPriorityEnum = pgEnum('ticket_priority', ['low', 'medium', 'high', 'critical'])
export const ticketComplexityEnum = pgEnum('ticket_complexity', ['easy', 'medium', 'hard', 'critical'])
export const executionModeEnum = pgEnum('execution_mode', ['quick', 'autonomous', 'deep_work'])
export const agentStatusEnum = pgEnum('agent_status', ['idle', 'planning', 'executing', 'reviewing', 'error', 'offline'])
export const memoryTierEnum = pgEnum('memory_tier', ['core', 'recall', 'archival'])
export const approvalStatusEnum = pgEnum('approval_status', ['pending', 'approved', 'denied', 'expired'])
export const guardrailLayerEnum = pgEnum('guardrail_layer', ['input', 'tool', 'output'])
export const entityAgentRoleEnum = pgEnum('entity_agent_role', ['primary', 'monitor', 'healer', 'specialist'])
export const debateEdgeTypeEnum = pgEnum('debate_edge_type', ['support', 'attack', 'rebuttal'])
export const debateSessionStatusEnum = pgEnum('debate_session_status', ['active', 'completed', 'cancelled'])
export const cronJobStatusEnum = pgEnum('cron_job_status', ['active', 'paused', 'failed'])
export const receiptStatusEnum = pgEnum('receipt_status', ['running', 'completed', 'failed', 'rolled_back'])
export const projectStatusEnum = pgEnum('project_status', ['planning', 'active', 'completed', 'cancelled'])
export const instinctScopeEnum = pgEnum('instinct_scope', ['development', 'mini_brain', 'brain'])

// === Core Tables ===

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type'),
  goal: text('goal'),
  color: text('color'),
  icon: text('icon'),
  autonomyLevel: integer('autonomy_level').default(1),
  settings: jsonb('settings'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type'),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  status: agentStatusEnum('status').default('idle').notNull(),
  model: text('model'),
  color: text('color'),
  bg: text('bg'),
  description: text('description'),
  tags: text('tags').array(),
  skills: text('skills').array(),
  isWsOrchestrator: boolean('is_ws_orchestrator').default(false),
  triggerMode: text('trigger_mode'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('agents_workspace_id_idx').on(t.workspaceId),
])

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

export const projectWorkspaces = pgTable('project_workspaces', {
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
}, (t) => [
  primaryKey({ columns: [t.projectId, t.workspaceId] }),
])

export const projectLog = pgTable('project_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  workspaceId: uuid('workspace_id'),
  agentId: uuid('agent_id'),
  reply: text('reply'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('project_log_project_id_idx').on(t.projectId),
])

export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  status: ticketStatusEnum('status').default('backlog').notNull(),
  priority: ticketPriorityEnum('priority').default('medium').notNull(),
  complexity: ticketComplexityEnum('complexity').default('medium').notNull(),
  executionMode: executionModeEnum('execution_mode').default('autonomous'),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  assignedAgentId: uuid('assigned_agent_id').references(() => agents.id),
  projectId: uuid('project_id').references(() => projects.id),
  dagId: text('dag_id'),
  dagNodeType: text('dag_node_type'),
  metadata: jsonb('metadata'),
  result: text('result'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('tickets_workspace_id_idx').on(t.workspaceId),
  index('tickets_assigned_agent_id_idx').on(t.assignedAgentId),
  index('tickets_project_id_idx').on(t.projectId),
])

export const ticketExecution = pgTable('ticket_execution', {
  ticketId: uuid('ticket_id').references(() => tickets.id).primaryKey(),
  runId: text('run_id'),
  lockOwner: uuid('lock_owner').references(() => agents.id),
  lockedAt: timestamp('locked_at'),
  leaseUntil: timestamp('lease_until'),
  leaseSeconds: integer('lease_seconds'),
  wakePendingCount: integer('wake_pending_count').default(0),
  lastWakeAt: timestamp('last_wake_at'),
})

export const ticketStatusHistory = pgTable('ticket_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').references(() => tickets.id).notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  changedAt: timestamp('changed_at').defaultNow().notNull(),
}, (t) => [
  index('ticket_status_history_ticket_id_idx').on(t.ticketId),
])

export const ticketComments = pgTable('ticket_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').references(() => tickets.id).notNull(),
  agentId: uuid('agent_id').references(() => agents.id),
  text: text('text').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => [
  index('ticket_comments_ticket_id_idx').on(t.ticketId),
])

export const ticketDependencies = pgTable('ticket_dependencies', {
  ticketId: uuid('ticket_id').references(() => tickets.id).notNull(),
  blockedByTicketId: uuid('blocked_by_ticket_id').references(() => tickets.id).notNull(),
}, (t) => [
  primaryKey({ columns: [t.ticketId, t.blockedByTicketId] }),
])

export const ticketProof = pgTable('ticket_proof', {
  ticketId: uuid('ticket_id').references(() => tickets.id).primaryKey(),
  status: text('status'),
  shadowRequired: boolean('shadow_required').default(false),
  visualRequired: boolean('visual_required').default(false),
  shadowRunId: text('shadow_run_id'),
  visualRunId: text('visual_run_id'),
  checkedAt: timestamp('checked_at'),
  details: jsonb('details'),
})
