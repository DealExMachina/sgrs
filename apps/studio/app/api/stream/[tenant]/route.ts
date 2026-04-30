/**
 * SSE route — real-time governance event stream for a tenant.
 *
 * GET /api/stream/:tenant
 *
 * Subscribes to NATS and forwards typed SGRS events as Server-Sent Events.
 * Returns HTTP 503 (JSON) when NATS_URL is not configured so the client
 * can detect "disabled" and avoid infinite reconnect loops.
 *
 * Events forwarded (all scope events — no filtering):
 *   scope.created / updated / deleted              — drive useScopes state
 *   scope.finality.changed / near-final            — drive useFinality state
 *   scope.veto.activated / scope.veto.lifted       — drive VetoBanner in Shell
 *   scope.claim.added                              — drive ClaimsPanel
 *   scope.drift.detected                           — drive IssuesPanel
 *   scope.contradiction.detected / .resolved       — drive IssuesPanel HITL
 *   scope.risk.identified                          — drive OverviewPanel
 *   scope.document.indexed                         — drive LeftDocsPanel
 *   scope.epoch.completed                          — drive SummaryPanel
 *   (any future scope.* events are automatically forwarded)
 *
 * Each SSE message: `data: <json>\n\n`
 * Keep-alive comment: `: ping\n\n` every 25 seconds (beats most proxy timeouts).
 *
 * Environment variables consumed (server-side only — no NEXT_PUBLIC_ prefix):
 *   NATS_URL    — NATS server URL (required for streaming to work)
 *   NATS_TOKEN  — optional bearer token
 */

import { EventsApi } from "@sgrs/client-ts";
import type { SgrsEvent } from "@sgrs/client-ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NATS_URL = process.env.NATS_URL;
const NATS_TOKEN = process.env.NATS_TOKEN;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const { tenant } = await params;

  // ── NATS not configured ────────────────────────────────────────────────────
  if (!NATS_URL) {
    return Response.json(
      { error: "Real-time stream disabled (NATS_URL not set)", code: "NATS_DISABLED" },
      { status: 503 },
    );
  }

  // ── Connect to NATS before opening the stream ──────────────────────────────
  // We connect eagerly so the route can return 503 if NATS is unreachable,
  // rather than surfacing the error mid-stream.
  const eventsApi = new EventsApi({
    servers: NATS_URL,
    ...(NATS_TOKEN && { token: NATS_TOKEN }),
    name: `sgrs-studio-sse-${tenant}`,
    // Surface NATS errors to console; don't crash the stream
    onHandlerError: (err: unknown) =>
      console.error("[sgrs][studio][sse] handler error:", err),
  });

  try {
    await eventsApi.connect();
  } catch (err) {
    console.error("[sgrs][studio][sse] NATS connect failed:", err);
    return Response.json(
      { error: "NATS connection failed", code: "NATS_CONNECT_ERROR" },
      { status: 503 },
    );
  }

  // ── Build the SSE stream ───────────────────────────────────────────────────
  const encoder = new TextEncoder();
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Encode a SGRS event as an SSE `data:` line.
   * Returns undefined (and swallows the error) if the controller is already
   * closed — which happens when the browser disconnects mid-flight.
   */
  function send(controller: ReadableStreamDefaultController, event: SgrsEvent) {
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      // Controller already closed (client disconnected); cancel() will handle cleanup
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: SgrsEvent) => send(controller, event);

      // ── Keep-alive ──────────────────────────────────────────────────────────
      // SSE comment lines (`: ...`) are ignored by parsers but prevent proxies
      // and load-balancers from closing idle connections.
      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          if (keepAliveTimer) clearInterval(keepAliveTimer);
          keepAliveTimer = null;
        }
      }, 25_000);

      // ── All scope events → forwarded without filtering ──────────────────────
      // onAllScopeEvents uses a single NATS wildcard subscription (sgrs.scope.{tenant}.>)
      // so every current and future scope event type is automatically relayed.
      // The Studio's useEventStream hook handles routing per event type on the client.
      eventsApi.onAllScopeEvents(tenant, emit);
    },

    cancel() {
      // Browser disconnected or component unmounted — drain NATS subscriptions
      if (keepAliveTimer !== null) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      void eventsApi.close();
    },
  });

  // Abort when the request is cancelled (e.g. Next.js server shutting down)
  req.signal.addEventListener("abort", () => {
    if (keepAliveTimer !== null) clearInterval(keepAliveTimer);
    void eventsApi.close();
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      // Tell nginx/ALB not to buffer the response body
      "X-Accel-Buffering": "no",
    },
  });
}
