/**
 * Contradictions routes — conflicting claim pairs detected by the comparator agent.
 *
 * Routes:
 *   GET   /api/contradictions/:scopeId          — list (open first, then others)
 *   POST  /api/contradictions                   — create (comparator agent)
 *   PATCH /api/contradictions/:id               — HITL resolve or defer
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { contradictions as contradictionsTable } from "@sgrs/db";
import {
  ContradictionSeverity,
  ResolveContradictionBody,
} from "@sgrs/api-schema";
import { z } from "zod";
import type { Db } from "@sgrs/db";
import type { EventsApi } from "@sgrs/client-ts";
import * as ev from "../events.js";

const CreateContradictionBody = z.object({
  scope_id: z.string(),
  claim_a: z.string().min(1).max(2000),
  claim_b: z.string().min(1).max(2000),
  source_a: z.string().max(200),
  source_b: z.string().max(200),
  severity: ContradictionSeverity,
  round: z.number().int().nonnegative().default(0),
});

function publish(eventsApi: EventsApi | undefined, fn: () => void): void {
  if (!eventsApi?.connected) return;
  try { fn(); } catch (e) { console.error("[sgrs][events] publish failed:", e); }
}

function toApi(row: typeof contradictionsTable.$inferSelect) {
  return {
    id: row.id,
    scope_id: row.scope_id,
    claim_a: row.claim_a,
    claim_b: row.claim_b,
    source_a: row.source_a,
    source_b: row.source_b,
    severity: row.severity,
    status: row.status,
    resolution: row.resolution ?? undefined,
    resolved_by: row.resolved_by ?? undefined,
    resolved_at: row.resolved_at?.toISOString() ?? undefined,
    round: row.round,
    created_at: row.created_at.toISOString(),
  };
}

export function createContradictionsRouter(db: Db, eventsApi?: EventsApi) {
  const router = new Hono();

  /** GET /api/contradictions/:scopeId — open first, then deferred/resolved */
  router.get("/:scopeId", async (c) => {
    const tenantId = c.get("tenantId");
    const scopeId = c.req.param("scopeId");

    const rows = await db
      .select()
      .from(contradictionsTable)
      .where(and(
        eq(contradictionsTable.scope_id, scopeId),
        eq(contradictionsTable.tenant_id, tenantId),
      ))
      // open → critical severity first, then by creation time
      .orderBy(
        sql`CASE status WHEN 'open' THEN 0 WHEN 'deferred' THEN 1 ELSE 2 END`,
        sql`CASE severity WHEN 'critical' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`,
        desc(contradictionsTable.created_at),
      );

    return c.json(rows.map(toApi));
  });

  /** POST /api/contradictions — comparator agent reports a contradiction */
  router.post("/", zValidator("json", CreateContradictionBody), async (c) => {
    const tenantId = c.get("tenantId");
    const body = c.req.valid("json");

    const [row] = await db
      .insert(contradictionsTable)
      .values({ ...body, tenant_id: tenantId, status: "open" })
      .returning();

    const contradiction = toApi(row!);
    publish(eventsApi, () =>
      eventsApi!.publishScopeEvent(
        tenantId, contradiction.scope_id,
        ev.contradictionDetected(tenantId, contradiction),
      ),
    );
    return c.json(contradiction, 201);
  });

  /** PATCH /api/contradictions/:id — HITL: resolve or defer */
  router.patch("/:id", zValidator("json", ResolveContradictionBody), async (c) => {
    const tenantId = c.get("tenantId");
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const [existing] = await db
      .select()
      .from(contradictionsTable)
      .where(and(eq(contradictionsTable.id, id), eq(contradictionsTable.tenant_id, tenantId)));

    if (!existing) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    if (existing.status !== "open") {
      return c.json({ error: "Contradiction already actioned", code: "ALREADY_RESOLVED" }, 409);
    }

    const [updated] = await db
      .update(contradictionsTable)
      .set({
        status: body.status,
        resolution: body.resolution ?? null,
        resolved_by: body.resolved_by,
        resolved_at: new Date(),
      })
      .where(eq(contradictionsTable.id, id))
      .returning();

    const contradiction = toApi(updated!);
    publish(eventsApi, () =>
      eventsApi!.publishScopeEvent(
        tenantId, contradiction.scope_id,
        ev.contradictionResolved(tenantId, contradiction),
      ),
    );
    return c.json(contradiction);
  });

  return router;
}
