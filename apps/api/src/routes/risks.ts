/**
 * Risks routes — identified risk items per scope.
 *
 * Routes:
 *   GET  /api/risks/:scopeId   — list (critical first)
 *   POST /api/risks            — create (risk-assessment agent)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { risks as risksTable } from "@sgrs/db";
import { RiskLevel } from "@sgrs/api-schema";
import type { Db } from "@sgrs/db";
import type { EventsApi } from "@sgrs/client-ts";
import * as ev from "../events.js";

const CreateRiskBody = z.object({
  scope_id: z.string(),
  description: z.string().min(1).max(2000),
  level: RiskLevel,
  category: z.string().max(100).optional(),
  source: z.string().max(200),
  round: z.number().int().nonneg().default(0),
});

function publish(eventsApi: EventsApi | undefined, fn: () => void): void {
  if (!eventsApi?.connected) return;
  try { fn(); } catch (e) { console.error("[sgrs][events] publish failed:", e); }
}

function toApi(row: typeof risksTable.$inferSelect) {
  return {
    id: row.id,
    scope_id: row.scope_id,
    description: row.description,
    level: row.level,
    category: row.category ?? undefined,
    source: row.source,
    round: row.round,
    created_at: row.created_at.toISOString(),
  };
}

export function createRisksRouter(db: Db, eventsApi?: EventsApi) {
  const router = new Hono();

  /** GET /api/risks/:scopeId — critical first, then high, medium, low */
  router.get("/:scopeId", async (c) => {
    const tenantId = c.get("tenantId");
    const scopeId = c.req.param("scopeId");

    const rows = await db
      .select()
      .from(risksTable)
      .where(and(eq(risksTable.scope_id, scopeId), eq(risksTable.tenant_id, tenantId)))
      .orderBy(
        sql`CASE level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
        desc(risksTable.created_at),
      );

    return c.json(rows.map(toApi));
  });

  /** POST /api/risks */
  router.post("/", zValidator("json", CreateRiskBody), async (c) => {
    const tenantId = c.get("tenantId");
    const body = c.req.valid("json");

    const [row] = await db
      .insert(risksTable)
      .values({ ...body, tenant_id: tenantId })
      .returning();

    const risk = toApi(row!);
    publish(eventsApi, () =>
      eventsApi!.publishScopeEvent(tenantId, risk.scope_id, ev.riskIdentified(tenantId, risk)),
    );
    return c.json(risk, 201);
  });

  return router;
}
