/**
 * Document ingest route — entry point for the governance pipeline.
 *
 * POST /api/ingest
 *   Body: { scope_id, name, type?, text, document_id?, source?, idempotency_key? }
 *
 * This route proxies the document to the swarm feed server (port 3002).
 * The feed server appends it to the contextWal + publishes a NATS event.
 * The swarm agent loop then picks it up and runs the full governance pipeline:
 *
 *   factsAgent → facts-worker (LLM extraction) → syncFactsToSemanticGraph
 *     → syncFactsToSgrs (claims / contradictions / risks written here)
 *   governanceAgent → evaluateKernel (Rust) → canGovernanceTransition
 *     → runFinalityCheck → syncFinalityToSgrs (V(t) written here)
 *
 * The Studio reads the results asynchronously via SSE + polling.
 * Response: 202 Accepted (the pipeline is async).
 *
 * Feed server URL is read from FEED_SERVER_URL (default: http://localhost:3002).
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { API_VERSION, IngestDocumentRequest } from "@sgrs/api-schema";
import type { EventsApi } from "@sgrs/client-ts";
import type { Db } from "@sgrs/db";

const FEED_SERVER_URL = (process.env.FEED_SERVER_URL ?? "http://localhost:3002").replace(/\/$/, "");
const INTEGRATION_VERSION = API_VERSION;

function feedHeaders(tenantId: string | undefined, idempotencyKey: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-SGRS-Integration-Version": INTEGRATION_VERSION,
  };
  if (tenantId) headers["X-Tenant-ID"] = tenantId;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  if (process.env.SWARM_API_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.SWARM_API_TOKEN}`;
  }
  return headers;
}

// Db is accepted but not used — kept for consistent factory signature
export function createIngestRouter(_db: Db, _eventsApi?: EventsApi) {
  const router = new Hono();

  router.post("/", zValidator("json", IngestDocumentRequest), async (c) => {
    const { scope_id, name, type, text, document_id, source, idempotency_key } = c.req.valid("json");
    const tenantId = c.get("tenantId");

    // Forward to swarm feed server — this triggers the full governance pipeline.
    const feedRes = await fetch(`${FEED_SERVER_URL}/context/docs`, {
      method: "POST",
      headers: feedHeaders(tenantId, idempotency_key),
      body: JSON.stringify({
        scope_id,
        title: name,
        type,
        text,
        ...(document_id !== undefined && { document_id }),
        ...(source !== undefined && { source }),
        ...(tenantId !== undefined && { tenant_id: tenantId }),
        ...(idempotency_key !== undefined && { idempotency_key }),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!feedRes.ok) {
      const errBody = await feedRes.text().catch(() => "");
      throw new Error(`feed server error ${feedRes.status}: ${errBody}`);
    }

    const { seq } = await feedRes.json() as { seq?: number; ok?: boolean };

    return c.json({
      scope_id,
      name,
      type,
      document_id:     document_id ?? null,
      idempotency_key: idempotency_key ?? null,
      queued: true,
      seq:    seq ?? null,
      integration_version: INTEGRATION_VERSION,
      message:
        "Document queued for the governance pipeline. " +
        "Claims, contradictions, and risks will appear once the swarm processes it " +
        "(typically within 30–90 seconds depending on LLM latency).",
    }, 202);
  });

  return router;
}
