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
