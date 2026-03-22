import { pgTable, text, timestamp, boolean, integer, jsonb, uuid } from 'drizzle-orm/pg-core'
import { agents, workspaces, tickets, projects, cronJobStatusEnum, receiptStatusEnum, approvalStatusEnum } from './core'

export const cronJobs = pgTable('cron_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  schedule: text('schedule').notNull(),
  type: text('type'),
  status: cronJobStatusEnum('status').default('active').notNull(),
  task: text('task'),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  agentId: uuid('agent_id').references(() => agents.id),
  enabled: boolean('enabled').default(true),
  failCount: integer('fail_count').default(0),
  lastRun: timestamp('last_run'),
  nextRun: timestamp('next_run'),
  lastResult: text('last_result'),
  runs: integer('runs').default(0),
  fails: integer('fails').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const ephemeralSwarms = pgTable('ephemeral_swarms', {
  id: uuid('id').primaryKey().defaultRandom(),
  task: text('task').notNull(),
  status: text('status').default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const swarmAgents = pgTable('swarm_agents', {
  swarmId: uuid('swarm_id').references(() => ephemeralSwarms.id).notNull(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  role: text('role'),
})

export const receipts = pgTable('receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id),
  ticketId: uuid('ticket_id').references(() => tickets.id),
  projectId: uuid('project_id').references(() => projects.id),
  workspaceId: uuid('workspace_id'),
  trigger: text('trigger'),
  status: receiptStatusEnum('status').default('running').notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  durationMs: integer('duration_ms'),
  rollbackAvailable: boolean('rollback_available').default(false),
})

export const receiptActions = pgTable('receipt_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  receiptId: uuid('receipt_id').references(() => receipts.id).notNull(),
  sequence: integer('sequence').notNull(),
  type: text('type').notNull(),
  target: text('target'),
  summary: text('summary'),
  status: text('status'),
  isRollbackEligible: boolean('is_rollback_eligible').default(false),
  durationMs: integer('duration_ms'),
  preState: jsonb('pre_state'),
  result: jsonb('result'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const receiptAnomalies = pgTable('receipt_anomalies', {
  id: uuid('id').primaryKey().defaultRandom(),
  receiptId: uuid('receipt_id').references(() => receipts.id).notNull(),
  description: text('description').notNull(),
  severity: text('severity'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const approvalGates = pgTable('approval_gates', {
  id: uuid('id').primaryKey().defaultRandom(),
  action: text('action').notNull(),
  agentId: uuid('agent_id').references(() => agents.id),
  risk: text('risk'),
  status: approvalStatusEnum('status').default('pending').notNull(),
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  decidedAt: timestamp('decided_at'),
  decidedBy: text('decided_by'),
  reason: text('reason'),
  metadata: jsonb('metadata'),
  expiresAt: timestamp('expires_at'),
})
