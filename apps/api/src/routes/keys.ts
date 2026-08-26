/**
 * Product API key management — Clerk session auth only.
 *
 *   GET    /api/keys       — list keys (prefix + metadata; never plaintext)
 *   POST   /api/keys       — create key (plaintext returned once)
 *   DELETE /api/keys/:id   — revoke key
 */

import { zValidator } from "@hono/zod-validator";
import { eq, and, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { apiKeys, generateTenantApiKey, type Db } from "@sgrs/db";
import { makeRequireClerkSession } from "../middleware/clerkSession.js";

const CreateKeyBody = z.object({
  name: z.string().min(1).max(120),
  env: z.enum(["live", "test"]).default("live"),
});

export function createKeysRouter(db: Db) {
  const router = new Hono();
  const requireClerk = makeRequireClerkSession(db);

  router.use("*", requireClerk);

  router.get("/", async (c) => {
    const tenantId = c.var.tenantId;
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        key_prefix: apiKeys.key_prefix,
        scopes: apiKeys.scopes,
        created_at: apiKeys.created_at,
        last_used_at: apiKeys.last_used_at,
        revoked_at: apiKeys.revoked_at,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.org_id, tenantId), isNull(apiKeys.revoked_at)));

    return c.json({ keys: rows });
  });

  router.post("/", zValidator("json", CreateKeyBody), async (c) => {
    const tenantId = c.var.tenantId;
    const clerkUserId = c.var.clerkUserId;
    const body = c.req.valid("json");
    const { key, prefix, hash } = generateTenantApiKey(body.env);

    const [row] = await db
      .insert(apiKeys)
      .values({
        org_id: tenantId,
        name: body.name,
        key_prefix: prefix,
        key_hash: hash,
        created_by: clerkUserId,
      })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        key_prefix: apiKeys.key_prefix,
        created_at: apiKeys.created_at,
      });

    return c.json(
      {
        key: row,
        secret: key,
      },
      201,
    );
  });

  router.delete("/:id", async (c) => {
    const tenantId = c.var.tenantId;
    const id = c.req.param("id");

    const updated = await db
      .update(apiKeys)
      .set({ revoked_at: new Date() })
      .where(
        and(
          eq(apiKeys.id, id),
          eq(apiKeys.org_id, tenantId),
          isNull(apiKeys.revoked_at),
        ),
      )
      .returning({ id: apiKeys.id });

    if (!updated[0]) {
      return c.json({ error: "API key not found.", code: "NOT_FOUND" }, 404);
    }

    return c.json({ revoked: true, id: updated[0].id });
  });

  return router;
}
