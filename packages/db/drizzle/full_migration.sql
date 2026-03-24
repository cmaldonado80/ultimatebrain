CREATE TYPE "public"."agent_status" AS ENUM('idle', 'planning', 'executing', 'reviewing', 'error', 'offline');;

CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'denied', 'expired');;

CREATE TYPE "public"."cron_job_status" AS ENUM('active', 'paused', 'failed');;

CREATE TYPE "public"."debate_edge_type" AS ENUM('support', 'attack', 'rebuttal');;

CREATE TYPE "public"."debate_session_status" AS ENUM('active', 'completed', 'cancelled');;

CREATE TYPE "public"."entity_agent_role" AS ENUM('primary', 'monitor', 'healer', 'specialist');;

CREATE TYPE "public"."entity_status" AS ENUM('active', 'suspended', 'degraded', 'provisioning');;

CREATE TYPE "public"."entity_tier" AS ENUM('brain', 'mini_brain', 'development');;

CREATE TYPE "public"."execution_mode" AS ENUM('quick', 'autonomous', 'deep_work');;

CREATE TYPE "public"."guardrail_layer" AS ENUM('input', 'tool', 'output');;

CREATE TYPE "public"."instinct_scope" AS ENUM('development', 'mini_brain', 'brain');;

CREATE TYPE "public"."memory_tier" AS ENUM('core', 'recall', 'archival');;

CREATE TYPE "public"."project_status" AS ENUM('planning', 'active', 'completed', 'cancelled');;

CREATE TYPE "public"."receipt_status" AS ENUM('running', 'completed', 'failed', 'rolled_back');;

CREATE TYPE "public"."ticket_complexity" AS ENUM('easy', 'medium', 'hard', 'critical');;

CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'medium', 'high', 'critical');;

CREATE TYPE "public"."ticket_status" AS ENUM('backlog', 'queued', 'in_progress', 'review', 'done', 'failed', 'cancelled');;

CREATE TYPE "public"."anomaly_severity" AS ENUM('low', 'medium', 'high', 'critical');;

CREATE TYPE "public"."receipt_action_status" AS ENUM('completed', 'rolled_back', 'failed');;

CREATE TYPE "public"."swarm_status" AS ENUM('active', 'completed', 'disbanded');;

CREATE TYPE "public"."candidate_status" AS ENUM('pending', 'promoted', 'rejected');;

CREATE TYPE "public"."flow_status" AS ENUM('draft', 'active', 'paused', 'archived');;

CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"workspace_id" uuid,
	"status" "agent_status" DEFAULT 'idle' NOT NULL,
	"model" text,
	"color" text,
	"bg" text,
	"description" text,
	"tags" text[],
	"skills" text[],
	"is_ws_orchestrator" boolean DEFAULT false,
	"trigger_mode" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
;

CREATE TABLE "project_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"workspace_id" uuid,
	"agent_id" uuid,
	"updated_at" timestamp DEFAULT now(),
	"reply" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
;

CREATE TABLE "project_workspaces" (
	"project_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "project_workspaces_project_id_workspace_id_pk" PRIMARY KEY("project_id","workspace_id")
);
;

CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"goal" text,
	"status" "project_status" DEFAULT 'planning' NOT NULL,
	"deadline" timestamp,
	"health_score" real,
	"health_diagnosis" text,
	"synthesis" text,
	"cancelled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
;

CREATE TABLE "ticket_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"agent_id" uuid,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "ticket_dependencies" (
	"ticket_id" uuid NOT NULL,
	"blocked_by_ticket_id" uuid NOT NULL,
	CONSTRAINT "ticket_dependencies_ticket_id_blocked_by_ticket_id_pk" PRIMARY KEY("ticket_id","blocked_by_ticket_id")
);
;

CREATE TABLE "ticket_execution" (
	"ticket_id" uuid PRIMARY KEY NOT NULL,
	"run_id" text,
	"lock_owner" uuid,
	"locked_at" timestamp,
	"lease_until" timestamp,
	"lease_seconds" integer,
	"wake_pending_count" integer DEFAULT 0,
	"last_wake_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "ticket_proof" (
	"ticket_id" uuid PRIMARY KEY NOT NULL,
	"status" text,
	"shadow_required" boolean DEFAULT false,
	"visual_required" boolean DEFAULT false,
	"shadow_run_id" text,
	"visual_run_id" text,
	"checked_at" timestamp,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "ticket_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"from_status" "ticket_status",
	"to_status" "ticket_status" NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "ticket_status" DEFAULT 'backlog' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"complexity" "ticket_complexity" DEFAULT 'medium' NOT NULL,
	"execution_mode" "execution_mode" DEFAULT 'autonomous',
	"workspace_id" uuid,
	"assigned_agent_id" uuid,
	"project_id" uuid,
	"dag_id" text,
	"dag_node_type" text,
	"metadata" jsonb,
	"result" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
;

CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"goal" text,
	"color" text,
	"icon" text,
	"autonomy_level" integer DEFAULT 1,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
;

CREATE TABLE "approval_gates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"agent_id" uuid,
	"risk" text,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	"decided_by" text,
	"reason" text,
	"metadata" jsonb,
	"expires_at" timestamp
);
;

CREATE TABLE "cron_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"schedule" text NOT NULL,
	"type" text,
	"status" "cron_job_status" DEFAULT 'active' NOT NULL,
	"task" text,
	"workspace_id" uuid,
	"agent_id" uuid,
	"enabled" boolean DEFAULT true,
	"fail_count" integer DEFAULT 0,
	"last_run" timestamp,
	"next_run" timestamp,
	"last_result" text,
	"runs" integer DEFAULT 0,
	"fails" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "ephemeral_swarms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task" text NOT NULL,
	"status" "swarm_status" DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "receipt_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"target" text,
	"summary" text,
	"status" "receipt_action_status",
	"is_rollback_eligible" boolean DEFAULT false,
	"duration_ms" integer,
	"pre_state" jsonb,
	"result" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "receipt_anomalies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"description" text NOT NULL,
	"severity" "anomaly_severity",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"ticket_id" uuid,
	"project_id" uuid,
	"workspace_id" uuid,
	"trigger" text,
	"status" "receipt_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"duration_ms" integer,
	"rollback_available" boolean DEFAULT false
);
;

CREATE TABLE "swarm_agents" (
	"swarm_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"role" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "swarm_agents_swarm_id_agent_id_pk" PRIMARY KEY("swarm_id","agent_id")
);
;

CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_agent_id" uuid NOT NULL,
	"to_agent_id" uuid NOT NULL,
	"text" text NOT NULL,
	"read" boolean DEFAULT false,
	"ack_status" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "agent_trust_scores" (
	"agent_id" uuid PRIMARY KEY NOT NULL,
	"score" real DEFAULT 0.5 NOT NULL,
	"factors" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
;

CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"attachment" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
;

CREATE TABLE "cognition_state" (
	"id" text PRIMARY KEY DEFAULT '1' NOT NULL,
	"features" jsonb,
	"policies" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
;

CREATE TABLE "cognitive_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid,
	"status" "candidate_status" DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"content" text NOT NULL,
	"source" uuid,
	"confidence" real,
	"workspace_id" uuid,
	"tier" "memory_tier" DEFAULT 'recall' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

	"memory_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "prompt_overlays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"content" text NOT NULL,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"content" text,
	"ticket_id" uuid,
	"agent_id" uuid,
	"type" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"config" jsonb,
	"enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "model_fallbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"chain" text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "orchestrator_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_workspace" uuid,
	"to_workspace" uuid,
	"rule" text,
	"priority" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "strategy_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan" text,
	"status" text DEFAULT 'pending',
	"agent_id" uuid,
	"workspace_id" uuid,
	"tickets" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
;

CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text,
	"url" text NOT NULL,
	"secret" text,
	"enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "agent_cards" (
	"agent_id" uuid PRIMARY KEY NOT NULL,
	"capabilities" jsonb,
	"auth_requirements" jsonb,
	"endpoint" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
;

CREATE TABLE "checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"state" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "eval_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"input" jsonb NOT NULL,
	"expected_output" jsonb,
	"trace_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "eval_datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"version" text,
	"scores" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"steps" jsonb NOT NULL,
	"status" "flow_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
;

CREATE TABLE "gateway_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"agent_id" uuid,
	"ticket_id" uuid,
	"tokens_in" integer,
	"tokens_out" integer,
	"latency_ms" integer,
	"cost_usd" real,
	"cached" boolean DEFAULT false,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "guardrail_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layer" "guardrail_layer" NOT NULL,
	"agent_id" uuid,
	"ticket_id" uuid,
	"rule_name" text NOT NULL,
	"passed" boolean NOT NULL,
	"violation_detail" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "instinct_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instinct_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "instincts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" text NOT NULL,
	"action" text NOT NULL,
	"confidence" real DEFAULT 0.3 NOT NULL,
	"domain" text DEFAULT 'universal',
	"scope" "instinct_scope" DEFAULT 'development' NOT NULL,
	"entity_id" uuid,
	"evidence_count" integer DEFAULT 1,
	"last_observed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
;

CREATE TABLE "playbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"steps" jsonb NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "skills_marketplace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source_url" text,
	"version" text,
	"installed" boolean DEFAULT false,
	"config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "traces" (
	"trace_id" text NOT NULL,
	"parent_span_id" text,
	"span_id" text PRIMARY KEY NOT NULL,
	"operation" text NOT NULL,
	"service" text,
	"agent_id" uuid,
	"ticket_id" uuid,
	"duration_ms" integer,
	"status" text,
	"attributes" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "brain_engine_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"engine" text NOT NULL,
	"requests_count" integer DEFAULT 0,
	"tokens_used" integer DEFAULT 0,
	"cost_usd" real DEFAULT 0,
	"period" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "brain_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"tier" "entity_tier" NOT NULL,
	"parent_id" uuid,
	"engines_enabled" text[],
	"domain_engines" jsonb,
	"api_key_hash" text,
	"endpoint" text,
	"health_endpoint" text,
	"status" "entity_status" DEFAULT 'provisioning' NOT NULL,
	"config" jsonb,
	"hook_profile" text DEFAULT 'standard',
	"last_health_check" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
;

CREATE TABLE "brain_entity_agents" (
	"entity_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"role" "entity_agent_role" DEFAULT 'primary' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brain_entity_agents_entity_id_agent_id_pk" PRIMARY KEY("entity_id","agent_id")
);
;

CREATE TABLE "debate_edges" (
	"from_node_id" uuid NOT NULL,
	"to_node_id" uuid NOT NULL,
	"type" "debate_edge_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "debate_edges_from_node_id_to_node_id_pk" PRIMARY KEY("from_node_id","to_node_id")
);
;

CREATE TABLE "debate_elo" (
	"agent_id" uuid PRIMARY KEY NOT NULL,
	"elo_rating" integer DEFAULT 1200 NOT NULL,
	"matches" integer DEFAULT 0,
	"wins" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
;

CREATE TABLE "debate_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"agent_id" uuid,
	"text" text NOT NULL,
	"validity" real,
	"parent_id" uuid,
	"is_axiom" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "debate_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"status" "debate_session_status" DEFAULT 'active' NOT NULL,
	"constitutional_rules" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

CREATE TABLE "token_budgets" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"daily_limit_usd" real,
	"monthly_limit_usd" real,
	"alert_threshold" real DEFAULT 0.8,
	"enforce" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
;

CREATE TABLE "token_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid,
	"agent_id" uuid,
	"model" text,
	"provider" text,
	"tokens_in" integer DEFAULT 0,
	"tokens_out" integer DEFAULT 0,
	"cost_usd" real DEFAULT 0,
	"period" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
;

ALTER TABLE "agents" ADD CONSTRAINT "agents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;;

ALTER TABLE "project_log" ADD CONSTRAINT "project_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "project_workspaces" ADD CONSTRAINT "project_workspaces_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "project_workspaces" ADD CONSTRAINT "project_workspaces_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "ticket_dependencies" ADD CONSTRAINT "ticket_dependencies_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "ticket_dependencies" ADD CONSTRAINT "ticket_dependencies_blocked_by_ticket_id_tickets_id_fk" FOREIGN KEY ("blocked_by_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "ticket_execution" ADD CONSTRAINT "ticket_execution_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "ticket_execution" ADD CONSTRAINT "ticket_execution_lock_owner_agents_id_fk" FOREIGN KEY ("lock_owner") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "ticket_proof" ADD CONSTRAINT "ticket_proof_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_agent_id_agents_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "approval_gates" ADD CONSTRAINT "approval_gates_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "cron_jobs" ADD CONSTRAINT "cron_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "cron_jobs" ADD CONSTRAINT "cron_jobs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "receipt_actions" ADD CONSTRAINT "receipt_actions_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "receipt_anomalies" ADD CONSTRAINT "receipt_anomalies_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "swarm_agents" ADD CONSTRAINT "swarm_agents_swarm_id_ephemeral_swarms_id_fk" FOREIGN KEY ("swarm_id") REFERENCES "public"."ephemeral_swarms"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "swarm_agents" ADD CONSTRAINT "swarm_agents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_from_agent_id_agents_id_fk" FOREIGN KEY ("from_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_to_agent_id_agents_id_fk" FOREIGN KEY ("to_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "agent_trust_scores" ADD CONSTRAINT "agent_trust_scores_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "cognitive_candidates" ADD CONSTRAINT "cognitive_candidates_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "memories" ADD CONSTRAINT "memories_source_agents_id_fk" FOREIGN KEY ("source") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "memories" ADD CONSTRAINT "memories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;;


ALTER TABLE "prompt_overlays" ADD CONSTRAINT "prompt_overlays_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "model_fallbacks" ADD CONSTRAINT "model_fallbacks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "orchestrator_routes" ADD CONSTRAINT "orchestrator_routes_from_workspace_workspaces_id_fk" FOREIGN KEY ("from_workspace") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "orchestrator_routes" ADD CONSTRAINT "orchestrator_routes_to_workspace_workspaces_id_fk" FOREIGN KEY ("to_workspace") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "strategy_runs" ADD CONSTRAINT "strategy_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "strategy_runs" ADD CONSTRAINT "strategy_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "agent_cards" ADD CONSTRAINT "agent_cards_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_dataset_id_eval_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."eval_datasets"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_dataset_id_eval_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."eval_datasets"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "instinct_observations" ADD CONSTRAINT "instinct_observations_instinct_id_instincts_id_fk" FOREIGN KEY ("instinct_id") REFERENCES "public"."instincts"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "brain_engine_usage" ADD CONSTRAINT "brain_engine_usage_entity_id_brain_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."brain_entities"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "brain_entities" ADD CONSTRAINT "brain_entities_parent_id_brain_entities_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."brain_entities"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "brain_entity_agents" ADD CONSTRAINT "brain_entity_agents_entity_id_brain_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."brain_entities"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "brain_entity_agents" ADD CONSTRAINT "brain_entity_agents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "debate_edges" ADD CONSTRAINT "debate_edges_from_node_id_debate_nodes_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "public"."debate_nodes"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "debate_edges" ADD CONSTRAINT "debate_edges_to_node_id_debate_nodes_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "public"."debate_nodes"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "debate_elo" ADD CONSTRAINT "debate_elo_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "debate_nodes" ADD CONSTRAINT "debate_nodes_session_id_debate_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."debate_sessions"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "debate_nodes" ADD CONSTRAINT "debate_nodes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "debate_nodes" ADD CONSTRAINT "debate_nodes_parent_id_debate_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."debate_nodes"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "debate_sessions" ADD CONSTRAINT "debate_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "token_budgets" ADD CONSTRAINT "token_budgets_entity_id_brain_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."brain_entities"("id") ON DELETE cascade ON UPDATE no action;;

ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_entity_id_brain_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."brain_entities"("id") ON DELETE set null ON UPDATE no action;;

ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;;

CREATE INDEX "agents_workspace_id_idx" ON "agents" USING btree ("workspace_id");;

CREATE INDEX "project_log_project_id_idx" ON "project_log" USING btree ("project_id");;

CREATE INDEX "ticket_comments_ticket_id_idx" ON "ticket_comments" USING btree ("ticket_id");;

CREATE INDEX "ticket_status_history_ticket_id_idx" ON "ticket_status_history" USING btree ("ticket_id");;

CREATE INDEX "tickets_workspace_id_idx" ON "tickets" USING btree ("workspace_id");;

CREATE INDEX "tickets_assigned_agent_id_idx" ON "tickets" USING btree ("assigned_agent_id");;

CREATE INDEX "tickets_project_id_idx" ON "tickets" USING btree ("project_id");;

CREATE INDEX "cron_jobs_workspace_id_idx" ON "cron_jobs" USING btree ("workspace_id");;

CREATE INDEX "receipt_actions_receipt_id_idx" ON "receipt_actions" USING btree ("receipt_id");;

CREATE INDEX "receipt_anomalies_receipt_id_idx" ON "receipt_anomalies" USING btree ("receipt_id");;

CREATE INDEX "agent_messages_to_read_idx" ON "agent_messages" USING btree ("to_agent_id","read");;

CREATE INDEX "agent_messages_from_agent_id_idx" ON "agent_messages" USING btree ("from_agent_id");;

CREATE INDEX "agent_messages_to_agent_id_idx" ON "agent_messages" USING btree ("to_agent_id");;

CREATE INDEX "chat_sessions_agent_id_idx" ON "chat_sessions" USING btree ("agent_id");;

CREATE INDEX "episodes_type_created_idx" ON "episodes" USING btree ("event_type","created_at");;

CREATE INDEX "memories_key_idx" ON "memories" USING btree ("key");;

CREATE INDEX "memories_tier_idx" ON "memories" USING btree ("tier");;

CREATE INDEX "memories_workspace_id_idx" ON "memories" USING btree ("workspace_id");;

CREATE INDEX "checkpoints_entity_idx" ON "checkpoints" USING btree ("entity_type","entity_id","step_index");;

CREATE INDEX "eval_cases_dataset_id_idx" ON "eval_cases" USING btree ("dataset_id");;

CREATE INDEX "eval_runs_dataset_id_idx" ON "eval_runs" USING btree ("dataset_id");;

CREATE INDEX "gateway_metrics_provider_created_idx" ON "gateway_metrics" USING btree ("provider","created_at");;

CREATE INDEX "gateway_metrics_agent_created_idx" ON "gateway_metrics" USING btree ("agent_id","created_at");;

CREATE INDEX "guardrail_logs_agent_id_idx" ON "guardrail_logs" USING btree ("agent_id");;

CREATE INDEX "traces_trace_id_idx" ON "traces" USING btree ("trace_id");;

CREATE INDEX "traces_agent_id_idx" ON "traces" USING btree ("agent_id");;

CREATE INDEX "traces_agent_created_idx" ON "traces" USING btree ("agent_id","created_at");;

CREATE INDEX "traces_ticket_idx" ON "traces" USING btree ("ticket_id");;

CREATE INDEX "brain_engine_usage_entity_id_idx" ON "brain_engine_usage" USING btree ("entity_id");;

CREATE INDEX "debate_nodes_session_id_idx" ON "debate_nodes" USING btree ("session_id");;

CREATE INDEX "token_ledger_entity_id_idx" ON "token_ledger" USING btree ("entity_id");
-- Workspace lifecycle states, bindings, and goals
CREATE TYPE "public"."workspace_lifecycle" AS ENUM('draft', 'active', 'paused', 'retired');--> statement-breakpoint
CREATE TYPE "public"."workspace_binding_type" AS ENUM('brain', 'engine', 'skill');--> statement-breakpoint
CREATE TYPE "public"."workspace_goal_status" AS ENUM('active', 'achieved', 'abandoned');--> statement-breakpoint

ALTER TABLE "workspaces" ADD COLUMN "lifecycle_state" "workspace_lifecycle" DEFAULT 'draft' NOT NULL;--> statement-breakpoint

CREATE TABLE "workspace_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"binding_type" "workspace_binding_type" NOT NULL,
	"binding_key" text NOT NULL,
	"config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "workspace_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" "workspace_goal_status" DEFAULT 'active' NOT NULL,
	"target_metric" text,
	"target_value" real,
	"current_value" real,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "workspace_lifecycle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_state" "workspace_lifecycle",
	"to_state" "workspace_lifecycle",
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "workspace_bindings" ADD CONSTRAINT "workspace_bindings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_goals" ADD CONSTRAINT "workspace_goals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_events" ADD CONSTRAINT "workspace_lifecycle_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "workspace_bindings_workspace_id_idx" ON "workspace_bindings" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_goals_workspace_id_idx" ON "workspace_goals" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_lifecycle_events_workspace_id_idx" ON "workspace_lifecycle_events" USING btree ("workspace_id");
-- Memory access tracking and temporal decay support
ALTER TABLE "memories" ADD COLUMN "access_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "last_accessed_at" timestamp;
-- NextAuth.js authentication tables

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text,
  "email" text NOT NULL UNIQUE,
  "email_verified" timestamp,
  "image" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "accounts" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "provider" text NOT NULL,
  "provider_account_id" text NOT NULL,
  "refresh_token" text,
  "access_token" text,
  "expires_at" integer,
  "token_type" text,
  "scope" text,
  "id_token" text,
  "session_state" text,
  PRIMARY KEY ("provider", "provider_account_id")
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "session_token" text PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification_tokens" (
  "identifier" text NOT NULL,
  "token" text NOT NULL,
  "expires" timestamp NOT NULL,
  PRIMARY KEY ("identifier", "token")
);
