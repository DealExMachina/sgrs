/**
 * Model handle routes — connect, list, get, revoke AI model integrations.
 *
 * SECURITY: The plaintext API key is accepted exactly once (POST /api/models),
 * encrypted with AES-256-GCM, and never returned to any client again.
 * All responses use the opaque `handle` field only.
 *
 * Routes:
 *   POST   /api/models           — connect a model (stores encrypted key)
 *   GET    /api/models           — list all handles for tenant
 *   GET    /api/models/:handle   — get single handle (no api_key_enc field)
 *   DELETE /api/models/:handle   — revoke handle
 */

import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { modelHandles as modelHandlesTable, encryptApiKey } from "@sgrs/db";
import { ConnectModelRequest, ModelHandle } from "@sgrs/api-schema";
import type { Db, AnalyticsDb } from "@sgrs/db";
import type { EventsApi } from "@sgrs/client-ts";
import type { z } from "zod";
import * as ev from "../events.js";

/** Fire-and-forget NATS publish — never throws into route handler. */
function publish(eventsApi: EventsApi | undefined, fn: () => void): void {
  if (!eventsApi?.connected) return;
  try { fn(); } catch (e) {
    console.error("[sgrs][events] publish failed:", e);
  }
}

// ─── Handle generation ────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random model handle.
 * Format: `mh_` + 24 URL-safe base64 characters (≈143 bits of entropy).
 */
function generateHandle(): string {
  // 18 random bytes → 24 base64url chars (no padding), e.g. "mh_dG9rZW5leGFtcGxlWA"
  return "mh_" + randomBytes(18).toString("base64url");
}

// ─── Router factory ───────────────────────────────────────────────────────────

export function createModelsRouter(db: Db, analytics: AnalyticsDb, eventsApi?: EventsApi) {
  const router = new Hono();

  /** POST /api/models — connect a model */
  router.post("/", zValidator("json", ConnectModelRequest), async (c) => {
    const tenantId = c.get("tenantId");
    const body = c.req.valid("json");

    const handle = generateHandle();
    const api_key_enc = encryptApiKey(body.api_key);

    const row = await db
      .insert(modelHandlesTable)
      .values({
        handle,
        tenant_id: tenantId,
        provider: body.provider,
        model: body.model,
        label: body.label,
        api_key_enc,
        created_at: new Date(),
        last_used_at: null,
      })
      .returning();

    const created = row[0];
    if (!created) throw new Error("Insert returned no rows");

    const apiHandle = toApiHandle(created);

    void analytics
      .appendAudit({
        event_type: "model.connected",
        tenant_id: tenantId,
        entity_id: handle,
        actor: "api",
        payload: { handle, provider: body.provider, model: body.model },
      })
      .catch((e) => console.error("[sgrs][audit] appendAudit failed:", e));

    publish(eventsApi, () =>
      eventsApi!.publishModelEvent(tenantId, handle, ev.modelConnected(tenantId, apiHandle))
    );

    return c.json(apiHandle, 201);
  });

  /** GET /api/models — list all model handles for tenant */
  router.get("/", async (c) => {
    const tenantId = c.get("tenantId");
    const rows = await db
      .select()
      .from(modelHandlesTable)
      .where(eq(modelHandlesTable.tenant_id, tenantId));

    return c.json(rows.map(toApiHandle));
  });

  /** GET /api/models/:handle — get single model handle */
  router.get("/:handle", async (c) => {
    const tenantId = c.get("tenantId");
    const handle = c.req.param("handle");

    const rows = await db
      .select()
      .from(modelHandlesTable)
      .where(
        and(
          eq(modelHandlesTable.handle, handle),
          eq(modelHandlesTable.tenant_id, tenantId)
        )
      );

    if (!rows[0])
      return c.json({ error: "Model handle not found", code: "NOT_FOUND" }, 404);
    return c.json(toApiHandle(rows[0]));
  });

  /** DELETE /api/models/:handle — revoke model handle */
  router.delete("/:handle", async (c) => {
    const tenantId = c.get("tenantId");
    const handle = c.req.param("handle");

    const rows = await db
      .delete(modelHandlesTable)
      .where(
        and(
          eq(modelHandlesTable.handle, handle),
          eq(modelHandlesTable.tenant_id, tenantId)
        )
      )
      .returning({ handle: modelHandlesTable.handle });

    if (!rows[0])
      return c.json({ error: "Model handle not found", code: "NOT_FOUND" }, 404);

    void analytics
      .appendAudit({
        event_type: "model.revoked",
        tenant_id: tenantId,
        entity_id: handle,
        actor: "api",
        payload: null,
      })
      .catch((e) => console.error("[sgrs][audit] appendAudit failed:", e));

    publish(eventsApi, () =>
      eventsApi!.publishModelEvent(tenantId, handle, ev.modelRevoked(tenantId, handle))
    );

    return c.json({ handle }, 200);
  });

  return router;
}

// ─── Shape mapper ─────────────────────────────────────────────────────────────

/** Map DB row → public API shape. NEVER includes api_key_enc. */
function toApiHandle(row: {
  handle: string;
  provider: string;
  model: string;
  label?: string | null;
  created_at: Date | string;
  last_used_at?: Date | string | null;
}): z.infer<typeof ModelHandle> {
  return {
    handle: row.handle,
    provider: row.provider as z.infer<typeof ModelHandle>["provider"],
    model: row.model,
    label: row.label ?? undefined,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
    last_used_at: row.last_used_at
      ? row.last_used_at instanceof Date
        ? row.last_used_at.toISOString()
        : row.last_used_at
      : null,
  };
}
