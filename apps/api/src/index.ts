/**
 * SGRS API Server — entry point.
 *
 * Startup sequence:
 *   1. Validate ENCRYPTION_KEY (fail fast — no traffic before keys are set)
 *   2. Run Drizzle-kit database migrations
 *   3. Open Postgres (PGlite or postgres-js) + DuckDB connections
 *   3b. Connect NATS real-time event transport (optional — skipped if NATS_URL unset)
 *   4. Start Hono HTTP server
 *
 * Environment variables:
 *   DATABASE_URL      — Drizzle target (PGlite file or postgresql:// URL)
 *   DUCKDB_PATH       — DuckDB analytics file path (default: :memory:)
 *   ENCRYPTION_KEY    — Base64-encoded 32-byte AES-256-GCM key (REQUIRED)
 *   PORT              — HTTP port (default: 3001)
 *   API_KEY           — Bearer token (optional; disables auth if unset)
 *   CORS_ORIGINS      — Comma-separated allowed origins
 *   NODE_ENV          — "production" | "development" (default: development)
 *   NATS_URL          — NATS server URL (optional; enables real-time events)
 *   NATS_TOKEN        — NATS bearer token (optional)
 */

import { serve } from "@hono/node-server";
import {
  createDb,
  runMigrations,
  AnalyticsDb,
  validateEncryptionKey,
} from "@sgrs/db";
import { EventsApi } from "@sgrs/client-ts";
import { createApp } from "./app.js";
import { validateApiKeyConfig } from "./middleware/auth.js";

async function main() {
  console.log("[sgrs][api] Starting…");

  // ── Step 1: Validate secrets (fail fast) ───────────────────────────────────
  validateEncryptionKey();
  console.log("[sgrs][api] Encryption key OK.");

  // In production, an API key is required — fail before accepting traffic.
  if (process.env.NODE_ENV === "production") {
    validateApiKeyConfig();
    console.log("[sgrs][api] API key OK.");
  } else {
    if (!process.env.API_KEY) {
      console.warn(
        "[sgrs][api] WARNING: API_KEY is not set — all requests will be accepted without authentication."
      );
    }
  }

  // ── Step 2: Run database migrations ────────────────────────────────────────
  await runMigrations();
  console.log("[sgrs][api] Migrations done.");

  // ── Step 3: Open DB connections ────────────────────────────────────────────
  const db = createDb();
  const analytics = await AnalyticsDb.create();
  console.log("[sgrs][api] DB connections open.");

  // ── Step 3b: Connect NATS (optional) ──────────────────────────────────────
  let eventsApi: EventsApi | undefined;
  if (process.env.NATS_URL) {
    eventsApi = new EventsApi({
      servers: process.env.NATS_URL,
      ...(process.env.NATS_TOKEN && { token: process.env.NATS_TOKEN }),
      name: "sgrs-api",
      onHandlerError: (err) => {
        console.error("[sgrs][api][NATS] handler error:", err);
      },
    });
    await eventsApi.connect();
    console.log(`[sgrs][api] NATS connected → ${process.env.NATS_URL}`);
  } else {
    console.log("[sgrs][api] NATS_URL not set — real-time events disabled.");
  }

  // ── Step 4: Start HTTP server ──────────────────────────────────────────────
  const app = createApp({ db, analytics, events: eventsApi });
  const port = Number(process.env.PORT ?? 3001);

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[sgrs][api] Listening on http://localhost:${info.port}`);
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`[sgrs][api] ${signal} received — shutting down…`);
    if (eventsApi?.connected) {
      await eventsApi.close();
      console.log("[sgrs][api] NATS drained.");
    }
    await analytics.close();
    console.log("[sgrs][api] DuckDB closed. Bye.");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[sgrs][api] Fatal startup error:", err);
  process.exit(1);
});
