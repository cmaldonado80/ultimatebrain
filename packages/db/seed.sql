-- Seed data for UltimateBrain
-- Run this in Neon SQL Editor after the migration

-- 1. Workspace
INSERT INTO workspaces (id, name, type, goal, color, icon, autonomy_level, settings, created_at, updated_at)
VALUES (
  gen_random_uuid(), 'Dev Workspace', 'development', 'Local development and testing workspace',
  '#6366f1', 'brain', 3, '{"notifications": true, "autoAssign": true}'::jsonb,
  now(), now()
);

-- 2. Agents (using workspace from above)
WITH ws AS (SELECT id FROM workspaces WHERE name = 'Dev Workspace' LIMIT 1)
INSERT INTO agents (id, name, type, workspace_id, status, model, color, bg, description, tags, skills, is_ws_orchestrator, trigger_mode, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Planner', 'planner', (SELECT id FROM ws), 'idle', 'claude-sonnet-4-20250514', '#8b5cf6', '#ede9fe', 'Breaks down goals into actionable tickets and execution plans', ARRAY['planning','strategy'], ARRAY['decomposition','prioritization','dependency-analysis'], true, 'auto', now(), now()),
  (gen_random_uuid(), 'Executor', 'executor', (SELECT id FROM ws), 'executing', 'claude-sonnet-4-20250514', '#10b981', '#d1fae5', 'Executes tasks autonomously using available tools', ARRAY['execution','coding'], ARRAY['code-generation','file-ops','testing'], false, 'auto', now(), now()),
  (gen_random_uuid(), 'Reviewer', 'reviewer', (SELECT id FROM ws), 'reviewing', 'claude-sonnet-4-20250514', '#f59e0b', '#fef3c7', 'Reviews completed work for quality, correctness, and safety', ARRAY['review','qa'], ARRAY['code-review','testing','security-audit'], false, 'on-demand', now(), now());

-- 3. Tickets
WITH ws AS (SELECT id FROM workspaces WHERE name = 'Dev Workspace' LIMIT 1),
     executor AS (SELECT id FROM agents WHERE name = 'Executor' LIMIT 1),
     planner AS (SELECT id FROM agents WHERE name = 'Planner' LIMIT 1),
     reviewer AS (SELECT id FROM agents WHERE name = 'Reviewer' LIMIT 1)
INSERT INTO tickets (id, title, description, status, priority, complexity, execution_mode, workspace_id, assigned_agent_id, result, metadata, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Set up project scaffolding', 'Initialize monorepo structure with turborepo, configure shared packages', 'done', 'high', 'medium', 'autonomous', (SELECT id FROM ws), (SELECT id FROM executor), 'Monorepo scaffolding complete with packages/api, packages/db, packages/ui', '{}'::jsonb, now(), now()),
  (gen_random_uuid(), 'Implement agent message bus', 'Build inter-agent communication layer with pub/sub and direct messaging', 'in_progress', 'high', 'hard', 'deep_work', (SELECT id FROM ws), (SELECT id FROM executor), NULL, '{"branch": "feat/agent-bus", "filesChanged": 12}'::jsonb, now(), now()),
  (gen_random_uuid(), 'Design memory consolidation pipeline', 'Plan the recall to core promotion pathway with confidence scoring', 'queued', 'medium', 'hard', 'autonomous', (SELECT id FROM ws), (SELECT id FROM planner), NULL, '{}'::jsonb, now(), now()),
  (gen_random_uuid(), 'Add retry logic to tool executor', 'Implement exponential backoff and circuit-breaker for external tool calls', 'failed', 'critical', 'medium', 'quick', (SELECT id FROM ws), (SELECT id FROM executor), 'Error: timeout connecting to tool-registry service', '{"retryCount": 3, "lastError": "ECONNREFUSED"}'::jsonb, now(), now()),
  (gen_random_uuid(), 'Review checkpoint restore implementation', 'Verify checkpoint save/restore handles partial state and edge cases correctly', 'review', 'medium', 'medium', 'autonomous', (SELECT id FROM ws), (SELECT id FROM reviewer), NULL, '{}'::jsonb, now(), now());

-- 4. Eval dataset + cases
INSERT INTO eval_datasets (id, name, description, created_at, updated_at)
VALUES (gen_random_uuid(), 'Agent Routing Accuracy', 'Evaluates whether the orchestrator routes tasks to the correct agent type', now(), now());

WITH ds AS (SELECT id FROM eval_datasets WHERE name = 'Agent Routing Accuracy' LIMIT 1)
INSERT INTO eval_cases (id, dataset_id, input, expected_output, created_at, updated_at)
VALUES
  (gen_random_uuid(), (SELECT id FROM ds), '{"task": "Write unit tests for the auth module", "context": "testing"}'::jsonb, '{"assignedType": "executor", "confidence": 0.95}'::jsonb, now(), now()),
  (gen_random_uuid(), (SELECT id FROM ds), '{"task": "Break down the Q3 roadmap into milestones", "context": "strategy"}'::jsonb, '{"assignedType": "planner", "confidence": 0.9}'::jsonb, now(), now()),
  (gen_random_uuid(), (SELECT id FROM ds), '{"task": "Audit the PR for security vulnerabilities", "context": "security"}'::jsonb, '{"assignedType": "reviewer", "confidence": 0.92}'::jsonb, now(), now());

-- 5. Memories
WITH planner AS (SELECT id FROM agents WHERE name = 'Planner' LIMIT 1),
     executor AS (SELECT id FROM agents WHERE name = 'Executor' LIMIT 1),
     reviewer AS (SELECT id FROM agents WHERE name = 'Reviewer' LIMIT 1),
     ws AS (SELECT id FROM workspaces WHERE name = 'Dev Workspace' LIMIT 1)
INSERT INTO memories (id, key, content, source, confidence, workspace_id, tier, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'project.architecture', 'The system uses a monorepo with turborepo. Core packages: api, db, ui, shared.', (SELECT id FROM planner)::text, 0.95, (SELECT id FROM ws), 'core', now(), now()),
  (gen_random_uuid(), 'convention.naming', 'All database tables use snake_case. TypeScript interfaces use PascalCase.', (SELECT id FROM reviewer)::text, 0.9, (SELECT id FROM ws), 'core', now(), now()),
  (gen_random_uuid(), 'task.agent-bus.progress', 'Agent message bus implementation is 60% complete. PubSub layer done, direct messaging pending.', (SELECT id FROM executor)::text, 0.8, (SELECT id FROM ws), 'recall', now(), now()),
  (gen_random_uuid(), 'incident.tool-registry-outage', 'Tool registry service experienced 15min outage due to connection pool exhaustion. Resolved by increasing pool size.', (SELECT id FROM executor)::text, 0.7, (SELECT id FROM ws), 'recall', now(), now()),
  (gen_random_uuid(), 'decision.checkpoint-format', 'Team decided to use JSON-based checkpoints over protobuf for easier debugging during development phase.', (SELECT id FROM planner)::text, 0.6, (SELECT id FROM ws), 'archival', now(), now());

-- 6. Channel
INSERT INTO channels (id, type, config, enabled, created_at, updated_at)
VALUES (gen_random_uuid(), 'webhook', '{"url": "https://hooks.example.com/dev-workspace", "events": ["ticket.created", "ticket.completed", "agent.error"], "retries": 3}'::jsonb, true, now(), now());

-- 7. Brain entity
INSERT INTO brain_entities (id, name, domain, tier, engines_enabled, domain_engines, endpoint, health_endpoint, status, config, hook_profile, created_at, updated_at)
VALUES (gen_random_uuid(), 'Dev Brain', 'development', 'development', ARRAY['planning','execution','review'], '{"planning": {"model": "claude-sonnet-4-20250514"}, "execution": {"model": "claude-sonnet-4-20250514"}}'::jsonb, 'http://localhost:4000', 'http://localhost:4000/health', 'active', '{"maxConcurrentTickets": 5, "autoHeal": true}'::jsonb, 'standard', now(), now());
