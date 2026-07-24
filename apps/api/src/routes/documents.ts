/**
 * Documents routes — source material ingested into a scope.
 *
 * Routes:
 *   GET   /api/documents/:scopeId   — list all documents for a scope
 *   POST  /api/documents            — register a document (kernel after indexing)
 *   PATCH /api/documents/:id        — update status / claim_count
 *
 * NOTE: Document removal with swarm recalibration (claim invalidation) is
 * reserved for a future release. The DELETE endpoint is intentionally omitted.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { documents as documentsTable } from "@sgrs/db";
import { DocumentStatus } from "@sgrs/api-schema";
import type { Db } from "@sgrs/db";
import type { EventsApi } from "@sgrs/client-ts";
import * as ev from "../events.js";

const CreateDocumentBody = z.object({
  scope_id: z.string(),
  name: z.string().min(1).max(500),
  type: z.string().min(1).max(50),
  status: DocumentStatus.optional().default("pending"),
  /** Stable provenance reference (content hash, source URI, external id). */
  provenance: z.string().min(1).max(500).optional(),
});

const PatchDocumentBody = z.object({
  status: DocumentStatus.optional(),
  claim_count: z.number().int().nonnegative().optional(),
  provenance: z.string().min(1).max(500).optional(),
});

function publish(eventsApi: EventsApi | undefined, fn: () => void): void {
  if (!eventsApi?.connected) return;
  try { fn(); } catch (e) { console.error("[sgrs][events] publish failed:", e); }
}

function toApi(row: typeof documentsTable.$inferSelect) {
  return {
    id: row.id,
    scope_id: row.scope_id,
    name: row.name,
    type: row.type,
    status: row.status,
    claim_count: row.claim_count,
    ...(row.provenance != null && { provenance: row.provenance }),
    ingested_at: row.ingested_at.toISOString(),
  };
}

export function createDocumentsRouter(db: Db, eventsApi?: EventsApi) {
  const router = new Hono();

  /** GET /api/documents/:scopeId */
  router.get("/:scopeId", async (c) => {
    const tenantId = c.get("tenantId");
    const scopeId = c.req.param("scopeId");

    const rows = await db
      .select()
      .from(documentsTable)
      .where(and(eq(documentsTable.scope_id, scopeId), eq(documentsTable.tenant_id, tenantId)))
      .orderBy(desc(documentsTable.ingested_at));

    return c.json(rows.map(toApi));
  });

  /** POST /api/documents */
  router.post("/", zValidator("json", CreateDocumentBody), async (c) => {
    const tenantId = c.get("tenantId");
    const body = c.req.valid("json");

    const [row] = await db
      .insert(documentsTable)
      .values({ ...body, tenant_id: tenantId })
      .returning();

    const doc = toApi(row!);
    // Publish when a document reaches "indexed" status
    if (doc.status === "indexed") {
      publish(eventsApi, () =>
        eventsApi!.publishScopeEvent(tenantId, doc.scope_id, ev.documentIndexed(tenantId, doc)),
      );
    }
    return c.json(doc, 201);
  });

  /** PATCH /api/documents/:id — update status and/or claim_count */
  router.patch("/:id", zValidator("json", PatchDocumentBody), async (c) => {
    const tenantId = c.get("tenantId");
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const [existing] = await db
      .select()
      .from(documentsTable)
      .where(and(eq(documentsTable.id, id), eq(documentsTable.tenant_id, tenantId)));

    if (!existing) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const [updated] = await db
      .update(documentsTable)
      .set({
        ...(body.status !== undefined && { status: body.status }),
        ...(body.claim_count !== undefined && { claim_count: body.claim_count }),
        ...(body.provenance !== undefined && { provenance: body.provenance }),
      })
      .where(eq(documentsTable.id, id))
      .returning();

    const doc = toApi(updated!);
    // Fire event when transitioning to indexed
    if (body.status === "indexed" && existing.status !== "indexed") {
      publish(eventsApi, () =>
        eventsApi!.publishScopeEvent(tenantId, doc.scope_id, ev.documentIndexed(tenantId, doc)),
      );
    }
    return c.json(doc);
  });

  return router;
}
