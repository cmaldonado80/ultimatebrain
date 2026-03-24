-- Memory access tracking and temporal decay support
ALTER TABLE "memories" ADD COLUMN "access_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "last_accessed_at" timestamp;
