/**
 * Scope routes — full CRUD on governance scopes.
 *
 * All routes require:
 *   - X-Tenant-ID header (enforced by tenant middleware)
 *   - Authorization: Bearer (enforced by auth middleware, if API_KEY is set)
 *
 * POST / PUT / PATCH / DELETE write an audit event to DuckDB.
 *
 * Routes:
 *   GET    /api/scopes          — list all scopes for tenant
 *   POST   /api/scopes          — create scope
 *   GET    /api/scopes/:id      — get scope by id
 *   PUT    /api/scopes/:id      — full replace
 *   PATCH  /api/scopes/:id      — partial update
 *   DELETE /api/scopes/:id      — delete scope
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { scopes as scopesTable } from "@sgrs/db";
import { Scope, ScopeId, ScopeState } from "@sgrs/api-schema";
import type { Db, AnalyticsDb } from "@sgrs/db";
import type { EventsApi } from "@sgrs/client-ts";
import * as ev from "../events.js";

// ─── Input schemas ────────────────────────────────────────────────────────────

const CreateScopeBody = z.object({
  id: ScopeId,
  name: z.string().min(1).max(200),
  tag: z.string().min(1).max(40),
  state: ScopeState.optional().default("active"),
  score: z.number().min(0).max(1).optional().default(0),
  cycles: z.number().int().nonnegative().optional().default(0),
});

const UpdateScopeBody = CreateScopeBody.omit({ id: true });
// Explicit optional fields — no inherited .default() so empty {} stays empty after parse.
const PatchScopeBody = z.object({
  name: z.string().min(1).max(200).optional(),
  tag: z.string().min(1).max(40).optional(),
  state: ScopeState.optional(),
  score: z.number().min(0).max(1).optional(),
  cycles: z.number().int().nonnegative().optional(),
});

// ─── Router factory ───────────────────────────────────────────────────────────

/** Fire-and-forget NATS publish — never throws into route handler. */
function publish(
  eventsApi: EventsApi | undefined,
  fn: () => void,
): void {
  if (!eventsApi?.connected) return;
  try { fn(); } catch (e) {
    console.error("[sgrs][events] publish failed:", e);
  }
}

export function createScopesRouter(db: Db, analytics: AnalyticsDb, eventsApi?: EventsApi) {
  const router = new Hono();

  /** GET /api/scopes — list all scopes for tenant */
  router.get("/", async (c) => {
    const tenantId = c.get("tenantId");
    const rows = await db
      .select()
      .from(scopesTable)
      .where(eq(scopesTable.tenant_id, tenantId));

    return c.json(rows.map(toApiScope));
  });

  /** POST /api/scopes — create scope */
  router.post("/", zValidator("json", CreateScopeBody), async (c) => {
    const tenantId = c.get("tenantId");
    const body = c.req.valid("json");

    const now = new Date();
    const row = await db
      .insert(scopesTable)
      .values({
        ...body,
        tenant_id: tenantId,
        created_at: now,
        updated_at: now,
      })
      .returning();

    const created = row[0];
    if (!created) throw new Error("Insert returned no rows");

    const apiScope = toApiScope(created);

    // Fire-and-forget audit
    void analytics
      .appendAudit({
        event_type: "scope.created",
        tenant_id: tenantId,
        entity_id: created.id,
        actor: "api",
        payload: created,
      })
      .catch((e) => console.error("[sgrs][audit] appendAudit failed:", e));

    // Publish NATS event (no-op when NATS is not configured)
    publish(eventsApi, () =>
      eventsApi!.publishScopeEvent(tenantId, created.id, ev.scopeCreated(tenantId, apiScope))
    );

    return c.json(apiScope, 201);
  });

  /** GET /api/scopes/:id — get single scope */
  router.get("/:id", async (c) => {
    const tenantId = c.get("tenantId");
    const id = c.req.param("id");

    const rows = await db
      .select()
      .from(scopesTable)
      .where(and(eq(scopesTable.id, id), eq(scopesTable.tenant_id, tenantId)));

    if (!rows[0]) return c.json({ error: "Scope not found", code: "NOT_FOUND" }, 404);
    return c.json(toApiScope(rows[0]));
  });

  /** PUT /api/scopes/:id — full replace */
  router.put("/:id", zValidator("json", UpdateScopeBody), async (c) => {
    const tenantId = c.get("tenantId");
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const rows = await db
      .update(scopesTable)
      .set({ ...body, updated_at: new Date() })
      .where(and(eq(scopesTable.id, id), eq(scopesTable.tenant_id, tenantId)))
      .returning();

    if (!rows[0]) return c.json({ error: "Scope not found", code: "NOT_FOUND" }, 404);

    const apiScope = toApiScope(rows[0]);

    void analytics
      .appendAudit({
        event_type: "scope.updated",
        tenant_id: tenantId,
        entity_id: id,
        actor: "api",
        payload: body,
      })
      .catch((e) => console.error("[sgrs][audit] appendAudit failed:", e));

    publish(eventsApi, () =>
      eventsApi!.publishScopeEvent(tenantId, id, ev.scopeUpdated(tenantId, apiScope, body))
    );

    return c.json(apiScope);
  });

  /** PATCH /api/scopes/:id — partial update */
  router.patch("/:id", zValidator("json", PatchScopeBody), async (c) => {
    const tenantId = c.get("tenantId");
    const id = c.req.param("id");
    const body = c.req.valid("json");

    if (Object.keys(body).length === 0) {
      return c.json({ error: "No fields to update", code: "EMPTY_PATCH" }, 400);
    }

    const rows = await db
      .update(scopesTable)
      .set({ ...body, updated_at: new Date() })
      .where(and(eq(scopesTable.id, id), eq(scopesTable.tenant_id, tenantId)))
      .returning();

    if (!rows[0]) return c.json({ error: "Scope not found", code: "NOT_FOUND" }, 404);

    const apiScope = toApiScope(rows[0]);

    void analytics
      .appendAudit({
        event_type: "scope.patched",
        tenant_id: tenantId,
        entity_id: id,
        actor: "api",
        payload: body,
      })
      .catch((e) => console.error("[sgrs][audit] appendAudit failed:", e));

    // PATCH publishes as scope.updated (partial change counts as an update)
    publish(eventsApi, () =>
      eventsApi!.publishScopeEvent(tenantId, id, ev.scopeUpdated(tenantId, apiScope, body))
    );

    return c.json(apiScope);
  });

  /** DELETE /api/scopes/:id */
  router.delete("/:id", async (c) => {
    const tenantId = c.get("tenantId");
    const id = c.req.param("id");

    const rows = await db
      .delete(scopesTable)
      .where(and(eq(scopesTable.id, id), eq(scopesTable.tenant_id, tenantId)))
      .returning({ id: scopesTable.id });

    if (!rows[0]) return c.json({ error: "Scope not found", code: "NOT_FOUND" }, 404);

    void analytics
      .appendAudit({
        event_type: "scope.deleted",
        tenant_id: tenantId,
        entity_id: id,
        actor: "api",
        payload: null,
      })
      .catch((e) => console.error("[sgrs][audit] appendAudit failed:", e));

    publish(eventsApi, () =>
      eventsApi!.publishScopeEvent(tenantId, id, ev.scopeDeleted(tenantId, id))
    );

    return c.json({ id }, 200);
  });

  return router;
}

// ─── Shape mapper ─────────────────────────────────────────────────────────────

/** Map a DB row to the public API shape (Scope schema). */
function toApiScope(row: {
  id: string;
  name: string;
  tag: string;
  state: string;
  score: number;
  cycles: number;
  created_at: Date | string;
  updated_at: Date | string;
}): z.infer<typeof Scope> {
  return {
    id: row.id,
    name: row.name,
    tag: row.tag,
    state: row.state as z.infer<typeof ScopeState>,
    score: row.score,
    cycles: row.cycles,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at,
  };
}
