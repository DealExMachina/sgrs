/**
 * Human IAM — org, project, and scope permissions.
 */

import { and, eq } from "drizzle-orm";
import type { Context, MiddlewareHandler, Next } from "hono";
import {
  orgMemberships,
  projectMemberships,
  scopeGrants,
  type Db,
} from "@sgrs/db";

export type ScopeAction = "read" | "write" | "ingest" | "admin";

const PROJECT_WRITE_ROLES = new Set(["project_admin", "project_editor"]);
const PROJECT_READ_ROLES = new Set([
  "project_admin",
  "project_editor",
  "project_viewer",
]);

const SCOPE_PERM_RANK: Record<string, number> = {
  scope_viewer: 1,
  scope_ingest: 2,
  scope_editor: 3,
  scope_admin: 4,
};

function actionMinPermission(action: ScopeAction): string {
  switch (action) {
    case "read":
      return "scope_viewer";
    case "ingest":
      return "scope_ingest";
    case "write":
      return "scope_editor";
    case "admin":
      return "scope_admin";
  }
}

export async function isOrgAdmin(
  db: Db,
  orgId: string,
  clerkUserId: string,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(orgMemberships)
    .where(
      and(
        eq(orgMemberships.org_id, orgId),
        eq(orgMemberships.clerk_user_id, clerkUserId),
        eq(orgMemberships.role, "org_admin"),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

export async function canAccessProject(
  db: Db,
  orgId: string,
  projectId: string,
  clerkUserId: string,
  write = false,
): Promise<boolean> {
  if (await isOrgAdmin(db, orgId, clerkUserId)) return true;

  const rows = await db
    .select()
    .from(projectMemberships)
    .where(
      and(
        eq(projectMemberships.project_id, projectId),
        eq(projectMemberships.clerk_user_id, clerkUserId),
      ),
    )
    .limit(1);

  const role = rows[0]?.role;
  if (!role) return false;
  return write ? PROJECT_WRITE_ROLES.has(role) : PROJECT_READ_ROLES.has(role);
}

export async function canAccessScope(
  db: Db,
  orgId: string,
  projectId: string | null,
  scopeId: string,
  clerkUserId: string,
  action: ScopeAction,
): Promise<boolean> {
  if (await isOrgAdmin(db, orgId, clerkUserId)) return true;

  if (projectId) {
    const projectRole = await db
      .select()
      .from(projectMemberships)
      .where(
        and(
          eq(projectMemberships.project_id, projectId),
          eq(projectMemberships.clerk_user_id, clerkUserId),
        ),
      )
      .limit(1);
    const role = projectRole[0]?.role;
    if (role === "project_admin") return true;
    if (action !== "admin" && role === "project_editor") return true;
    if (action === "read" && role === "project_viewer") return true;
  }

  const grants = await db
    .select()
    .from(scopeGrants)
    .where(
      and(
        eq(scopeGrants.scope_id, scopeId),
        eq(scopeGrants.org_id, orgId),
        eq(scopeGrants.clerk_user_id, clerkUserId),
      ),
    )
    .limit(1);

  const perm = grants[0]?.permission;
  if (!perm) return false;

  const need = actionMinPermission(action);
  return (SCOPE_PERM_RANK[perm] ?? 0) >= (SCOPE_PERM_RANK[need] ?? 99);
}

/** Require X-Project-ID and project access (after org/tenant middleware). */
export function makeRequireProject(db: Db, write = false): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const orgId = c.var.tenantId;
    const clerkUserId = c.var.clerkUserId;
    const authMethod = c.var.authMethod;

    const raw =
      c.req.header("x-project-id") ?? c.req.header("X-Project-ID") ?? "";
    if (!raw.trim()) {
      return c.json(
        { error: "Missing X-Project-ID header", code: "PROJECT_MISSING" },
        400,
      );
    }

    c.set("projectId", raw.trim());

    if (authMethod === "api_key" || !clerkUserId) {
      await next();
      return;
    }

    const allowed = await canAccessProject(
      db,
      orgId,
      raw.trim(),
      clerkUserId,
      write,
    );
    if (!allowed) {
      return c.json(
        { error: "Project access denied.", code: "PROJECT_FORBIDDEN" },
        403,
      );
    }

    await next();
  };
}

declare module "hono" {
  interface ContextVariableMap {
    projectId: string;
  }
}
