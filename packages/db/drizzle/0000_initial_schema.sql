-- SGRS initial schema migration
-- Generated from packages/db/src/schema.ts

CREATE TYPE "public"."scope_state" AS ENUM('active', 'near-final', 'resolved', 'escalated', 'archived');
--> statement-breakpoint
CREATE TYPE "public"."model_provider" AS ENUM('openai', 'anthropic', 'azure-openai', 'ollama', 'openai-compatible');
--> statement-breakpoint
CREATE TYPE "public"."agent_role" AS ENUM('extractor', 'comparator', 'arbiter', 'proposer', 'reviewer', 'planner', 'resolver', 'status', 'tuner');
--> statement-breakpoint
CREATE TYPE "public"."agent_kind" AS ENUM('internal', 'external');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scopes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"tag" text NOT NULL,
	"state" "scope_state" DEFAULT 'active' NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"cycles" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_handles" (
	"handle" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"provider" "model_provider" NOT NULL,
	"model" text NOT NULL,
	"label" text,
	"api_key_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"role" "agent_role" NOT NULL,
	"kind" "agent_kind" NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pubkey_ed25519" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finality_status" (
	"scope_id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"per_dimension" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"monotonicity_rounds" integer DEFAULT 0 NOT NULL,
	"plateau_ema" real DEFAULT 0 NOT NULL,
	"convergence_rate" real DEFAULT 0 NOT NULL,
	"state" "scope_state" DEFAULT 'active' NOT NULL,
	"veto_active" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finality_certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"round" integer NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"policy_hash" text NOT NULL,
	"signature_ed25519" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finality_status" ADD CONSTRAINT "finality_status_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finality_certificates" ADD CONSTRAINT "finality_certificates_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;
