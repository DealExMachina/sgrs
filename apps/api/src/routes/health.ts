/**
 * GET /api/health
 *
 * Returns 200 when the server is live. No auth or tenant header required.
 * Used by load-balancers, uptime monitors, and CI smoke tests.
 */

import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { Db } from "@sgrs/db";

export function createHealthRouter(db: Db) {
  const router = new Hono();

  router.get("/", async (c) => {
    // Lightweight DB ping — verifies the DB driver is responding.
    try {
      await db.execute(sql`SELECT 1`);
      return c.json({
        status: "ok",
        db: "ok",
        timestamp: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.error("[sgrs][health] DB ping failed:", dbErr);
      return c.json(
        {
          status: "degraded",
          db: "unreachable",
          timestamp: new Date().toISOString(),
        },
        503
      );
    }
  });

  return router;
}
