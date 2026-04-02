import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  agents,
  approvalStatusEnum,
  cronJobStatusEnum,
  projects,
  receiptStatusEnum,
  tickets,
  workspaces,
} from './core'

// === Enums ===
export const swarmStatusEnum = pgEnum('swarm_status', ['active', 'completed', 'disbanded'])
export const receiptActionStatusEnum = pgEnum('receipt_action_status', [
  'completed',
  'rolled_back',
  'failed',
])
export const anomalySeverityEnum = pgEnum('anomaly_severity', ['low', 'medium', 'high', 'critical'])

export const cronJobs = pgTable(
  'cron_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    schedule: text('schedule').notNull(),
    type: text('type'),
    status: cronJobStatusEnum('status').default('active').notNull(),
    task: text('task'),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    enabled: boolean('enabled').default(true),
    failCount: integer('fail_count').default(0),
    lastRun: timestamp('last_run'),
    nextRun: timestamp('next_run'),
    lastResult: text('last_result'),
    runs: integer('runs').default(0),
    fails: integer('fails').default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [index('cron_jobs_workspace_id_idx').on(t.workspaceId)],
)

export const ephemeralSwarms = pgTable('ephemeral_swarms', {
  id: uuid('id').primaryKey().defaultRandom(),
  task: text('task').notNull(),
  status: swarmStatusEnum('status').default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const swarmAgents = pgTable(
  'swarm_agents',
  {
    swarmId: uuid('swarm_id')
      .references(() => ephemeralSwarms.id, { onDelete: 'cascade' })
      .notNull(),
    agentId: uuid('agent_id')
      .references(() => agents.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.swarmId, t.agentId] })],
)

export const receipts = pgTable(
  'receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    trigger: text('trigger'),
    status: receiptStatusEnum('status').default('running').notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    durationMs: integer('duration_ms'),
    rollbackAvailable: boolean('rollback_available').default(false),
  },
  (t) => [index('receipts_workspace_id_idx').on(t.workspaceId)],
)

export const receiptActions = pgTable(
  'receipt_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    receiptId: uuid('receipt_id')
      .references(() => receipts.id, { onDelete: 'cascade' })
      .notNull(),
    sequence: integer('sequence').notNull(),
    type: text('type').notNull(),
    target: text('target'),
    summary: text('summary'),
    status: receiptActionStatusEnum('status'),
    isRollbackEligible: boolean('is_rollback_eligible').default(false),
    durationMs: integer('duration_ms'),
    preState: jsonb('pre_state'),
    result: jsonb('result'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    index('receipt_actions_receipt_id_idx').on(t.receiptId),
    index('receipt_actions_receipt_seq_idx').on(t.receiptId, t.sequence),
  ],
)

export const receiptAnomalies = pgTable(
  'receipt_anomalies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    receiptId: uuid('receipt_id')
      .references(() => receipts.id, { onDelete: 'cascade' })
      .notNull(),
    description: text('description').notNull(),
    severity: anomalySeverityEnum('severity'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [index('receipt_anomalies_receipt_id_idx').on(t.receiptId)],
)

export const approvalGates = pgTable(
  'approval_gates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    action: text('action').notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    risk: text('risk'),
    status: approvalStatusEnum('status').default('pending').notNull(),
    requestedAt: timestamp('requested_at').defaultNow().notNull(),
    decidedAt: timestamp('decided_at'),
    decidedBy: text('decided_by'),
    reason: text('reason'),
    metadata: jsonb('metadata'),
    expiresAt: timestamp('expires_at'),
  },
  (t) => [
    index('approval_gates_status_idx').on(t.status),
    index('approval_gates_agent_idx').on(t.agentId),
  ],
)
