/**
 * Finality routes — query and update convergence status.
 *
 * Routes:
 *   GET  /api/finality/:scopeId           — get current finality status
 *   POST /api/finality/:scopeId           — upsert finality status (from kernel)
 *   GET  /api/finality/:scopeId/history   — DuckDB time-series (last N points)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { finalityStatus as finalityTable } from "@sgrs/db";
import { FinalityStatus } from "@sgrs/api-schema";
import type { Db, AnalyticsDb } from "@sgrs/db";
import type { EventsApi } from "@sgrs/client-ts";
import * as ev from "../events.js";

/** Fire-and-forget NATS publish — never throws into route handler. */
function publish(eventsApi: EventsApi | undefined, fn: () => void): void {
  if (!eventsApi?.connected) return;
  try { fn(); } catch (e) {
    console.error("[sgrs][events] publish failed:", e);
  }
}

/** Score threshold for near-final state transition events. */
const NEAR_FINAL_THRESHOLD = 0.90;

// ─── Input schemas ────────────────────────────────────────────────────────────

const UpsertFinalityBody = FinalityStatus.omit({ scope_id: true });

const HistoryQuery = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = parseInt(v ?? "500", 10);
      if (isNaN(n) || n < 1) return 1;
      if (n > 5000) return 5000;
      return n;
    }),
});

// ─── Router factory ───────────────────────────────────────────────────────────

export function createFinalityRouter(db: Db, analytics: AnalyticsDb, eventsApi?: EventsApi) {
  const router = new Hono();

  /** GET /api/finality/:scopeId — current finality status */
  router.get("/:scopeId", async (c) => {
    const tenantId = c.get("tenantId");
    const scopeId = c.req.param("scopeId");

    const rows = await db
      .select()
      .from(finalityTable)
      .where(
        and(
          eq(finalityTable.scope_id, scopeId),
          eq(finalityTable.tenant_id, tenantId)
        )
      );

    if (!rows[0])
      return c.json(
        { error: "Finality status not found", code: "NOT_FOUND" },
        404
      );

    return c.json(toApiFinality(rows[0], scopeId));
  });

  /** POST /api/finality/:scopeId — upsert finality status */
  router.post("/:scopeId", zValidator("json", UpsertFinalityBody), async (c) => {
    const tenantId = c.get("tenantId");
    const scopeId = c.req.param("scopeId");
    const body = c.req.valid("json");

    // Read previous score BEFORE the upsert so we can compute a meaningful delta.
    // This is done in the same request; no lock is needed because upsert is idempotent
    // and delta accuracy is best-effort (NATS events are informational, not transactional).
    const existing = await db
      .select({ score: finalityTable.score })
      .from(finalityTable)
      .where(
        and(
          eq(finalityTable.scope_id, scopeId),
          eq(finalityTable.tenant_id, tenantId),
        ),
      );
    const previousScore = existing[0]?.score ?? 0;

    await db
      .insert(finalityTable)
      .values({
        scope_id: scopeId,
        tenant_id: tenantId,
        score: body.score,
        per_dimension: body.per_dimension,
        monotonicity_rounds: body.monotonicity_rounds,
        plateau_ema: body.plateau_ema,
        convergence_rate: body.convergence_rate,
        state: body.state,
        veto_active: body.veto_active,
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: [finalityTable.scope_id],
        set: {
          score: body.score,
          per_dimension: body.per_dimension,
          monotonicity_rounds: body.monotonicity_rounds,
          plateau_ema: body.plateau_ema,
          convergence_rate: body.convergence_rate,
          state: body.state,
          veto_active: body.veto_active,
          updated_at: new Date(),
        },
      });

    const result = {
      scope_id: scopeId,
      ...body,
    } satisfies z.infer<typeof FinalityStatus>;

    await analytics
      .appendFinalitySnapshot({
        scope_id: scopeId,
        tenant_id: tenantId,
        score: body.score,
        state: body.state,
        veto_active: body.veto_active,
        monotonicity_rounds: body.monotonicity_rounds,
      })
      .catch((e) =>
        console.error("[sgrs][analytics] appendFinalitySnapshot failed:", e)
      );

    // Publish finality.changed event (always) and near-final if threshold crossed
    publish(eventsApi, () => {
      eventsApi!.publishScopeEvent(
        tenantId,
        scopeId,
        ev.finalityChanged(tenantId, scopeId, result, previousScore),
      );

      // Publish near-final if score just crossed the 0.90 threshold
      if (body.score >= NEAR_FINAL_THRESHOLD && previousScore < NEAR_FINAL_THRESHOLD) {
        eventsApi!.publishScopeEvent(
          tenantId,
          scopeId,
          ev.finalityNearFinal(tenantId, scopeId, result),
        );
      }
    });

    return c.json(result, 200);
  });

  /** GET /api/finality/:scopeId/history — DuckDB time-series */
  router.get("/:scopeId/history", zValidator("query", HistoryQuery), async (c) => {
    const tenantId = c.get("tenantId");
    const scopeId = c.req.param("scopeId");
    const { limit } = c.req.valid("query");

    const series = await analytics.finalityTimeSeries(
      scopeId,
      tenantId,
      limit
    );

    return c.json({ scope_id: scopeId, points: series });
  });

  return router;
}

// ─── Shape mapper ─────────────────────────────────────────────────────────────

function toApiFinality(
  row: {
    scope_id: string;
    score: number;
    per_dimension: Record<string, number> | null;
    monotonicity_rounds: number;
    plateau_ema: number;
    convergence_rate: number;
    state: string;
    veto_active: boolean;
  },
  scopeId: string
): z.infer<typeof FinalityStatus> {
  return {
    scope_id: scopeId,
    score: row.score,
    per_dimension: (row.per_dimension ?? {}) as z.infer<
      typeof FinalityStatus
    >["per_dimension"],
    monotonicity_rounds: row.monotonicity_rounds,
    plateau_ema: row.plateau_ema,
    convergence_rate: row.convergence_rate,
    state: row.state as z.infer<typeof FinalityStatus>["state"],
    veto_active: row.veto_active,
  };
}
