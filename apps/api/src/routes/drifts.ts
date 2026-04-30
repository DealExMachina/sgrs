/**
 * Drifts routes — confidence changes detected between rounds.
 *
 * Routes:
 *   GET  /api/drifts/:scopeId   — list (highest severity first, limit 50)
 *   POST /api/drifts            — create (comparator agent)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { drifts as driftsTable } from "@sgrs/db";
import { DriftSeverity } from "@sgrs/api-schema";
import type { Db } from "@sgrs/db";
import type { EventsApi } from "@sgrs/client-ts";
import * as ev from "../events.js";

const CreateDriftBody = z.object({
  scope_id: z.string(),
  claim_id: z.string().uuid().optional(),
  subject: z.string().min(1).max(200),
  previous_confidence: z.number().min(0).max(1),
  current_confidence: z.number().min(0).max(1),
  delta: z.number(),
  severity: DriftSeverity,
  round: z.number().int().nonneg().default(0),
});

function publish(eventsApi: EventsApi | undefined, fn: () => void): void {
  if (!eventsApi?.connected) return;
  try { fn(); } catch (e) { console.error("[sgrs][events] publish failed:", e); }
}

function toApi(row: typeof driftsTable.$inferSelect) {
  return {
    id: row.id,
    scope_id: row.scope_id,
    claim_id: row.claim_id ?? undefined,
    subject: row.subject,
    previous_confidence: row.previous_confidence,
    current_confidence: row.current_confidence,
    delta: row.delta,
    severity: row.severity,
    round: row.round,
    created_at: row.created_at.toISOString(),
  };
}

export function createDriftsRouter(db: Db, eventsApi?: EventsApi) {
  const router = new Hono();

  /** GET /api/drifts/:scopeId */
  router.get("/:scopeId", async (c) => {
    const tenantId = c.get("tenantId");
    const scopeId = c.req.param("scopeId");

    const rows = await db
      .select()
      .from(driftsTable)
      .where(and(eq(driftsTable.scope_id, scopeId), eq(driftsTable.tenant_id, tenantId)))
      .orderBy(
        sql`CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`,
        desc(driftsTable.created_at),
      )
      .limit(50);

    return c.json(rows.map(toApi));
  });

  /** POST /api/drifts */
  router.post("/", zValidator("json", CreateDriftBody), async (c) => {
    const tenantId = c.get("tenantId");
    const body = c.req.valid("json");

    const [row] = await db
      .insert(driftsTable)
      .values({ ...body, tenant_id: tenantId })
      .returning();

    const drift = toApi(row!);
    publish(eventsApi, () =>
      eventsApi!.publishScopeEvent(tenantId, drift.scope_id, ev.driftDetected(tenantId, drift)),
    );
    return c.json(drift, 201);
  });

  return router;
}
