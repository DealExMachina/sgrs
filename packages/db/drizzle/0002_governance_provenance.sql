-- SGRS governance provenance migration
-- Adds document provenance + claim/risk → document traceability links.

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "provenance" text;
--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "document_id" uuid;
--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "document_id" uuid;
