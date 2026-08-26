/**
 * Project routes — org-scoped workspaces between organization and scopes.
 */

import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { projects, type Db } from "@sgrs/db";
import { makeRequireClerkSession } from "../middleware/clerkSession.js";
import {
  listProjectsForUser,
  projectSlug,
  ensureOrgMembership,
} from "../services/organizations.js";
import { isOrgAdmin } from "../services/permissions.js";

const CreateProjectBody = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(64).optional(),
});

export function createProjectsRouter(db: Db) {
  const router = new Hono();
  const requireClerk = makeRequireClerkSession(db);

  router.use("*", requireClerk);

  router.get("/", async (c) => {
    const orgId = c.var.tenantId;
    const clerkUserId = c.var.clerkUserId;
    const rows = await listProjectsForUser(db, orgId, clerkUserId);
    return c.json({ projects: rows });
  });

  router.post("/", zValidator("json", CreateProjectBody), async (c) => {
    const orgId = c.var.tenantId;
    const clerkUserId = c.var.clerkUserId;
    const body = c.req.valid("json");

    const admin = await isOrgAdmin(db, orgId, clerkUserId);
    if (!admin) {
      return c.json(
        { error: "Org admin required to create projects.", code: "FORBIDDEN" },
        403,
      );
    }

    const slug = body.slug ?? projectSlug(body.name);
    const id = `${orgId}-${slug}`.slice(0, 120);

    const [row] = await db
      .insert(projects)
      .values({ id, org_id: orgId, name: body.name, slug })
      .returning();

    await ensureOrgMembership(db, orgId, clerkUserId, "org_admin");
    return c.json(row, 201);
  });

  router.get("/:id", async (c) => {
    const orgId = c.var.tenantId;
    const projectId = c.req.param("id");
    const rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.org_id, orgId)))
      .limit(1);
    if (!rows[0]) {
      return c.json({ error: "Project not found.", code: "NOT_FOUND" }, 404);
    }
    return c.json(rows[0]);
  });

  return router;
}
