-- SGRS governance domain migration
-- Adds: claims, drifts, contradictions, risks, documents, epoch_summaries

CREATE TYPE "public"."drift_severity" AS ENUM('low', 'medium', 'high');
--> statement-breakpoint
CREATE TYPE "public"."contradiction_severity" AS ENUM('low', 'medium', 'critical');
--> statement-breakpoint
CREATE TYPE "public"."contradiction_status" AS ENUM('open', 'resolved', 'deferred');
--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high', 'critical');
--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('pending', 'processing', 'indexed', 'failed');
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "text" text NOT NULL,
  "source" text NOT NULL,
  "dimension" text,
  "confidence" real NOT NULL,
  "round" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "drifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "claim_id" uuid,
  "subject" text NOT NULL,
  "previous_confidence" real NOT NULL,
  "current_confidence" real NOT NULL,
  "delta" real NOT NULL,
  "severity" "drift_severity" NOT NULL,
  "round" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "contradictions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "claim_a" text NOT NULL,
  "claim_b" text NOT NULL,
  "source_a" text NOT NULL,
  "source_b" text NOT NULL,
  "severity" "contradiction_severity" NOT NULL,
  "status" "contradiction_status" DEFAULT 'open' NOT NULL,
  "resolution" text,
  "resolved_by" text,
  "resolved_at" timestamp with time zone,
  "round" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "risks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "description" text NOT NULL,
  "level" "risk_level" NOT NULL,
  "category" text,
  "source" text NOT NULL,
  "round" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "status" "document_status" DEFAULT 'pending' NOT NULL,
  "claim_count" integer DEFAULT 0 NOT NULL,
  "ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "epoch_summaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "round" integer NOT NULL,
  "summary_text" text NOT NULL,
  "claim_count" integer DEFAULT 0 NOT NULL,
  "drift_count" integer DEFAULT 0 NOT NULL,
  "contradiction_count" integer DEFAULT 0 NOT NULL,
  "risk_count" integer DEFAULT 0 NOT NULL,
  "score" real DEFAULT 0 NOT NULL,
  "state" "scope_state" DEFAULT 'active' NOT NULL,
  "comments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "claims"
  ADD CONSTRAINT "claims_scope_id_scopes_id_fk"
  FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "drifts"
  ADD CONSTRAINT "drifts_scope_id_scopes_id_fk"
  FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "contradictions"
  ADD CONSTRAINT "contradictions_scope_id_scopes_id_fk"
  FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "risks"
  ADD CONSTRAINT "risks_scope_id_scopes_id_fk"
  FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_scope_id_scopes_id_fk"
  FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "epoch_summaries"
  ADD CONSTRAINT "epoch_summaries_scope_id_scopes_id_fk"
  FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Performance indexes
CREATE INDEX IF NOT EXISTS "claims_scope_round_idx" ON "claims" ("scope_id", "round" DESC);
CREATE INDEX IF NOT EXISTS "drifts_scope_round_idx" ON "drifts" ("scope_id", "round" DESC);
CREATE INDEX IF NOT EXISTS "contradictions_scope_status_idx" ON "contradictions" ("scope_id", "status");
CREATE INDEX IF NOT EXISTS "risks_scope_level_idx" ON "risks" ("scope_id", "level");
CREATE INDEX IF NOT EXISTS "documents_scope_idx" ON "documents" ("scope_id");
CREATE INDEX IF NOT EXISTS "epoch_summaries_scope_round_idx" ON "epoch_summaries" ("scope_id", "round" DESC);
