/**
 * Document ingest route — entry point for the governance pipeline.
 *
 * POST /api/ingest
 *   Body: { scope_id, name, type?, text }
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
import { z } from "zod";
import type { EventsApi } from "@sgrs/client-ts";
import type { Db } from "@sgrs/db";

const FEED_SERVER_URL = (process.env.FEED_SERVER_URL ?? "http://localhost:3002").replace(/\/$/, "");

const IngestBody = z.object({
  scope_id: z.string().min(1).max(120),
  name:     z.string().min(1).max(500),
  type:     z.string().max(50).default("txt"),
  text:     z.string().min(1).max(100_000),
});

// Db is accepted but not used — kept for consistent factory signature
export function createIngestRouter(_db: Db, _eventsApi?: EventsApi) {
  const router = new Hono();

  router.post("/", zValidator("json", IngestBody), async (c) => {
    const { scope_id, name, text } = c.req.valid("json");

    // Forward to swarm feed server — this triggers the full governance pipeline.
    const feedRes = await fetch(`${FEED_SERVER_URL}/context/docs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope_id, title: name, text }),
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
      queued: true,
      seq:    seq ?? null,
      message:
        "Document queued for the governance pipeline. " +
        "Claims, contradictions, and risks will appear once the swarm processes it " +
        "(typically within 30–90 seconds depending on LLM latency).",
    }, 202);
  });

  return router;
}
