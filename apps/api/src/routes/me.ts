/**
 * Current user, organization, and accessible projects (Clerk session).
 */

import { Hono } from "hono";
import type { Db } from "@sgrs/db";
import { makeRequireClerkSession } from "../middleware/clerkSession.js";
import {
  findOrgById,
  listProjectsForUser,
} from "../services/organizations.js";
import { isOrgAdmin } from "../services/permissions.js";

export function createMeRouter(db: Db) {
  const router = new Hono();
  router.use("*", makeRequireClerkSession(db));

  router.get("/", async (c) => {
    const clerkUserId = c.var.clerkUserId;
    const orgId = c.var.tenantId;
    const org = await findOrgById(db, orgId);
    const projects = await listProjectsForUser(db, orgId, clerkUserId);
    const orgAdmin = await isOrgAdmin(db, orgId, clerkUserId);

    return c.json({
      clerk_user_id: clerkUserId,
      org_id: orgId,
      org_name: org?.name ?? null,
      org_admin: orgAdmin,
      clerk_org_id: c.var.clerkOrgId ?? null,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
      })),
      /** @deprecated use org_id */
      tenant_id: orgId,
    });
  });

  return router;
}
