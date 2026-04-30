/**
 * Epoch summaries routes — auto-generated at end of each convergence round.
 *
 * Routes:
 *   GET  /api/epochs/:scopeId              — list summaries (newest-first)
 *   GET  /api/epochs/:scopeId/latest       — latest epoch summary
 *   POST /api/epochs                       — create epoch summary (kernel)
 *   POST /api/epochs/:id/comments          — HITL: add a comment to a summary
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { epochSummaries as epochsTable } from "@sgrs/db";
import { ScopeState, AddEpochCommentBody } from "@sgrs/api-schema";
import type { Db } from "@sgrs/db";
import type { EventsApi } from "@sgrs/client-ts";
import * as ev from "../events.js";

const CreateEpochBody = z.object({
  scope_id: z.string(),
  round: z.number().int().nonnegative(),
  summary_text: z.string().min(1),
  claim_count: z.number().int().nonnegative().default(0),
  drift_count: z.number().int().nonnegative().default(0),
  contradiction_count: z.number().int().nonnegative().default(0),
  risk_count: z.number().int().nonnegative().default(0),
  score: z.number().min(0).max(1),
  state: ScopeState,
});

function publish(eventsApi: EventsApi | undefined, fn: () => void): void {
  if (!eventsApi?.connected) return;
  try { fn(); } catch (e) { console.error("[sgrs][events] publish failed:", e); }
}

type CommentJson = { id: string; author: string; text: string; created_at: string };

function toApi(row: typeof epochsTable.$inferSelect) {
  return {
    id: row.id,
    scope_id: row.scope_id,
    round: row.round,
    summary_text: row.summary_text,
    claim_count: row.claim_count,
    drift_count: row.drift_count,
    contradiction_count: row.contradiction_count,
    risk_count: row.risk_count,
    score: row.score,
    state: row.state,
    comments: (row.comments as CommentJson[]) ?? [],
    created_at: row.created_at.toISOString(),
  };
}

export function createEpochsRouter(db: Db, eventsApi?: EventsApi) {
  const router = new Hono();

  /** GET /api/epochs/:scopeId */
  router.get("/:scopeId", async (c) => {
    const tenantId = c.get("tenantId");
    const scopeId = c.req.param("scopeId");

    const rows = await db
      .select()
      .from(epochsTable)
      .where(and(eq(epochsTable.scope_id, scopeId), eq(epochsTable.tenant_id, tenantId)))
      .orderBy(desc(epochsTable.round));

    return c.json(rows.map(toApi));
  });

  /** GET /api/epochs/:scopeId/latest */
  router.get("/:scopeId/latest", async (c) => {
    const tenantId = c.get("tenantId");
    const scopeId = c.req.param("scopeId");

    const [row] = await db
      .select()
      .from(epochsTable)
      .where(and(eq(epochsTable.scope_id, scopeId), eq(epochsTable.tenant_id, tenantId)))
      .orderBy(desc(epochsTable.round))
      .limit(1);

    if (!row) return c.json({ error: "No epoch summary yet", code: "NOT_FOUND" }, 404);
    return c.json(toApi(row));
  });

  /** POST /api/epochs — kernel creates epoch summary at round completion */
  router.post("/", zValidator("json", CreateEpochBody), async (c) => {
    const tenantId = c.get("tenantId");
    const body = c.req.valid("json");

    const [row] = await db
      .insert(epochsTable)
      .values({ ...body, tenant_id: tenantId, comments: [] })
      .returning();

    const summary = toApi(row!);
    publish(eventsApi, () =>
      eventsApi!.publishScopeEvent(tenantId, summary.scope_id, ev.epochCompleted(tenantId, summary)),
    );
    return c.json(summary, 201);
  });

  /** POST /api/epochs/:id/comments — HITL: add comment */
  router.post("/:id/comments", zValidator("json", AddEpochCommentBody), async (c) => {
    const tenantId = c.get("tenantId");
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const [existing] = await db
      .select()
      .from(epochsTable)
      .where(and(eq(epochsTable.id, id), eq(epochsTable.tenant_id, tenantId)));

    if (!existing) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const newComment: CommentJson = {
      id: crypto.randomUUID(),
      author: body.author,
      text: body.text,
      created_at: new Date().toISOString(),
    };

    const updatedComments = [...((existing.comments as CommentJson[]) ?? []), newComment];

    const [updated] = await db
      .update(epochsTable)
      .set({ comments: updatedComments })
      .where(eq(epochsTable.id, id))
      .returning();

    return c.json(toApi(updated!));
  });

  return router;
}
