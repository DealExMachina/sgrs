/**
 * Agent routes — read-only registry of swarm agents.
 *
 * Agents are registered by the kernel, not by the API directly.
 * The API provides read access for dashboards and diagnostics.
 *
 * Routes:
 *   GET  /api/agents          — list all agents for tenant
 *   GET  /api/agents/:id      — get single agent
 */

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { agents as agentsTable } from "@sgrs/db";
import type { Db } from "@sgrs/db";
import type { Agent } from "@sgrs/api-schema";
import type { z } from "zod";

export function createAgentsRouter(db: Db) {
  const router = new Hono();

  /** GET /api/agents */
  router.get("/", async (c) => {
    const tenantId = c.get("tenantId");
    const rows = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.tenant_id, tenantId));

    return c.json(rows.map(toApiAgent));
  });

  /** GET /api/agents/:id */
  router.get("/:id", async (c) => {
    const tenantId = c.get("tenantId");
    const id = c.req.param("id");

    const rows = await db
      .select()
      .from(agentsTable)
      .where(
        and(eq(agentsTable.id, id), eq(agentsTable.tenant_id, tenantId))
      );

    if (!rows[0])
      return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
    return c.json(toApiAgent(rows[0]));
  });

  return router;
}

// ─── Shape mapper ─────────────────────────────────────────────────────────────

function toApiAgent(row: {
  id: string;
  name: string;
  role: string;
  kind: string;
  scopes: unknown;
  pubkey_ed25519?: string | null;
}): z.infer<typeof Agent> {
  return {
    id: row.id,
    name: row.name,
    role: row.role as z.infer<typeof Agent>["role"],
    kind: row.kind as z.infer<typeof Agent>["kind"],
    scopes: (Array.isArray(row.scopes) ? row.scopes : []) as string[],
    pubkey_ed25519: row.pubkey_ed25519 ?? undefined,
  };
}
