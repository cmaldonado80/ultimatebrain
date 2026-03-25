CREATE TYPE "public"."model_type" AS ENUM('vision', 'reasoning', 'agentic', 'coder', 'embedding', 'flash', 'guard', 'judge', 'router', 'multimodal');--> statement-breakpoint
CREATE TYPE "public"."workspace_binding_type" AS ENUM('brain', 'engine', 'skill');--> statement-breakpoint
CREATE TYPE "public"."workspace_goal_status" AS ENUM('active', 'achieved', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."workspace_lifecycle" AS ENUM('draft', 'active', 'paused', 'retired');--> statement-breakpoint
CREATE TYPE "public"."workspace_type" AS ENUM('general', 'development', 'staging', 'system');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
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
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "model_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" text NOT NULL,
	"display_name" text NOT NULL,
	"provider" text NOT NULL,
	"model_type" "model_type" NOT NULL,
	"secondary_types" text[],
	"context_window" integer,
	"max_output_tokens" integer,
	"supports_vision" boolean DEFAULT false,
	"supports_tools" boolean DEFAULT false,
	"supports_streaming" boolean DEFAULT false,
	"input_cost_per_m_token" real,
	"output_cost_per_m_token" real,
	"speed_tier" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"detected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "model_registry_model_id_unique" UNIQUE("model_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"binding_type" "workspace_binding_type" NOT NULL,
	"binding_key" text NOT NULL,
	"config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
);
--> statement-breakpoint
CREATE TABLE "workspace_lifecycle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_state" "workspace_lifecycle",
	"to_state" "workspace_lifecycle",
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ollama_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "a2a_delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_agent_id" uuid,
	"to_agent_id" uuid,
	"task" text NOT NULL,
	"context" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "healing_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"reason" text NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "type" SET DATA TYPE workspace_type;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "type" SET DEFAULT 'general';--> statement-breakpoint
ALTER TABLE "agent_messages" ALTER COLUMN "read" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_messages" ALTER COLUMN "ack_status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "agent_messages" ALTER COLUMN "ack_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cognitive_candidates" ALTER COLUMN "memory_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "confidence" SET DEFAULT 0.5;--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "confidence" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "parent_orchestrator_id" uuid;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "required_model_type" "model_type";--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "lifecycle_state" "workspace_lifecycle" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "is_system_protected" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "access_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "last_accessed_at" timestamp;--> statement-breakpoint
ALTER TABLE "orchestrator_routes" ADD COLUMN "orchestrator_id" uuid;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_bindings" ADD CONSTRAINT "workspace_bindings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_goals" ADD CONSTRAINT "workspace_goals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_events" ADD CONSTRAINT "workspace_lifecycle_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a2a_delegations" ADD CONSTRAINT "a2a_delegations_from_agent_id_agents_id_fk" FOREIGN KEY ("from_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a2a_delegations" ADD CONSTRAINT "a2a_delegations_to_agent_id_agents_id_fk" FOREIGN KEY ("to_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_registry_provider_idx" ON "model_registry" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "model_registry_type_idx" ON "model_registry" USING btree ("model_type");--> statement-breakpoint
CREATE INDEX "workspace_bindings_workspace_id_idx" ON "workspace_bindings" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_goals_workspace_id_idx" ON "workspace_goals" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_lifecycle_events_workspace_id_idx" ON "workspace_lifecycle_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "a2a_delegations_to_agent_idx" ON "a2a_delegations" USING btree ("to_agent_id","status");--> statement-breakpoint
CREATE INDEX "a2a_delegations_status_idx" ON "a2a_delegations" USING btree ("status");--> statement-breakpoint
ALTER TABLE "orchestrator_routes" ADD CONSTRAINT "orchestrator_routes_orchestrator_id_agents_id_fk" FOREIGN KEY ("orchestrator_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipts_workspace_id_idx" ON "receipts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "cognitive_candidates_memory_id_idx" ON "cognitive_candidates" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "brain_engine_usage_entity_period_idx" ON "brain_engine_usage" USING btree ("entity_id","period");--> statement-breakpoint
CREATE INDEX "debate_edges_to_node_id_idx" ON "debate_edges" USING btree ("to_node_id");--> statement-breakpoint
CREATE INDEX "token_ledger_entity_period_idx" ON "token_ledger" USING btree ("entity_id","period");