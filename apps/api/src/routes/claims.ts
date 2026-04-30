/**
 * Claims routes — extracted factual assertions per scope.
 *
 * Routes:
 *   GET  /api/claims/:scopeId          — list all claims (newest-first, limit 100)
 *   POST /api/claims                   — create claim (kernel → API)
 *   GET  /api/claims/:scopeId/by-doc   — group claims by source document
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { claims as claimsTable } from "@sgrs/db";
import { Claim, FinalityDimension } from "@sgrs/api-schema";
import type { Db } from "@sgrs/db";
import type { EventsApi } from "@sgrs/client-ts";
import * as ev from "../events.js";

const CreateClaimBody = z.object({
  scope_id: z.string(),
  text: z.string().min(1).max(2000),
  source: z.string().max(200),
  dimension: FinalityDimension.optional(),
  confidence: z.number().min(0).max(1),
  round: z.number().int().nonnegative().default(0),
});

function publish(eventsApi: EventsApi | undefined, fn: () => void): void {
  if (!eventsApi?.connected) return;
  try { fn(); } catch (e) { console.error("[sgrs][events] publish failed:", e); }
}

function toApiClaim(row: typeof claimsTable.$inferSelect) {
  return {
    id: row.id,
    scope_id: row.scope_id,
    text: row.text,
    source: row.source,
    dimension: (row.dimension ?? undefined) as FinalityDimension | undefined,
    confidence: row.confidence,
    round: row.round,
    created_at: row.created_at.toISOString(),
  };
}

export function createClaimsRouter(db: Db, eventsApi?: EventsApi) {
  const router = new Hono();

  /** GET /api/claims/:scopeId */
  router.get("/:scopeId", async (c) => {
    const tenantId = c.get("tenantId");
    const scopeId = c.req.param("scopeId");
    const rows = await db
      .select()
      .from(claimsTable)
      .where(and(eq(claimsTable.scope_id, scopeId), eq(claimsTable.tenant_id, tenantId)))
      .orderBy(desc(claimsTable.created_at))
      .limit(100);
    return c.json(rows.map(toApiClaim));
  });

  /** GET /api/claims/:scopeId/by-doc — group by source for the documents panel */
  router.get("/:scopeId/by-doc", async (c) => {
    const tenantId = c.get("tenantId");
    const scopeId = c.req.param("scopeId");
    const rows = await db
      .select()
      .from(claimsTable)
      .where(and(eq(claimsTable.scope_id, scopeId), eq(claimsTable.tenant_id, tenantId)))
      .orderBy(desc(claimsTable.created_at))
      .limit(500);

    const grouped: Record<string, ReturnType<typeof toApiClaim>[]> = {};
    for (const row of rows) {
      const k = row.source;
      if (!grouped[k]) grouped[k] = [];
      grouped[k]!.push(toApiClaim(row));
    }
    return c.json(grouped);
  });

  /** POST /api/claims — kernel creates a claim after extracting from a document */
  router.post("/", zValidator("json", CreateClaimBody), async (c) => {
    const tenantId = c.get("tenantId");
    const body = c.req.valid("json");

    const [row] = await db
      .insert(claimsTable)
      .values({ ...body, tenant_id: tenantId })
      .returning();

    const claim = toApiClaim(row!);
    publish(eventsApi, () => eventsApi!.publishScopeEvent(tenantId, claim.scope_id, ev.claimAdded(tenantId, claim)));
    return c.json(claim, 201);
  });

  return router;
}
