-- Organizations, projects, and human IAM (org → project → scope).

ALTER TABLE "tenants" RENAME TO "organizations";
--> statement-breakpoint
ALTER TABLE "api_keys" RENAME COLUMN "tenant_id" TO "org_id";
--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('org_admin', 'org_member');
--> statement-breakpoint
CREATE TYPE "public"."project_role" AS ENUM('project_admin', 'project_editor', 'project_viewer');
--> statement-breakpoint
CREATE TYPE "public"."scope_permission" AS ENUM('scope_admin', 'scope_editor', 'scope_ingest', 'scope_viewer');
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "kernel_tenant_uuid" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_clerk_org_id_unique" ON "organizations" ("clerk_org_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "projects_org_slug_unique" ON "projects" ("org_id", "slug");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "scopes" ADD COLUMN IF NOT EXISTS "project_id" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "scopes" ADD CONSTRAINT "scopes_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "project_id" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,
  "clerk_user_id" text NOT NULL,
  "role" "org_role" DEFAULT 'org_member' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_memberships_org_user_unique" ON "org_memberships" ("org_id", "clerk_user_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" text NOT NULL,
  "clerk_user_id" text NOT NULL,
  "role" "project_role" DEFAULT 'project_viewer' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_memberships_project_user_unique" ON "project_memberships" ("project_id", "clerk_user_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scope_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_id" text NOT NULL,
  "org_id" text NOT NULL,
  "clerk_user_id" text NOT NULL,
  "permission" "scope_permission" DEFAULT 'scope_viewer' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scope_grants_scope_user_unique" ON "scope_grants" ("scope_id", "clerk_user_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "scope_grants" ADD CONSTRAINT "scope_grants_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
