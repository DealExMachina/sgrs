/**
 * SGRS Hono application factory.
 *
 * Creates and configures the Hono app with:
 *   1. Global middleware (CORS, logger, error handler)
 *   2. Auth middleware (Bearer token)
 *   3. Tenant middleware (X-Tenant-ID, applied per-route group)
 *   4. Route registration
 *
 * Middleware order (outer → inner):
 *   errorHandler → auth → tenant → route handler
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { errorHandler } from "./middleware/error.js";
import { authMiddleware } from "./middleware/auth.js";
import { tenantMiddleware } from "./middleware/tenant.js";
import { createHealthRouter } from "./routes/health.js";
import { createScopesRouter } from "./routes/scopes.js";
import { createModelsRouter } from "./routes/models.js";
import { createFinalityRouter } from "./routes/finality.js";
import { createAgentsRouter } from "./routes/agents.js";
import { createClaimsRouter } from "./routes/claims.js";
import { createDriftsRouter } from "./routes/drifts.js";
import { createContradictionsRouter } from "./routes/contradictions.js";
import { createRisksRouter } from "./routes/risks.js";
import { createDocumentsRouter } from "./routes/documents.js";
import { createEpochsRouter } from "./routes/epochs.js";
import { createIngestRouter } from "./routes/ingest.js";
import type { Db, AnalyticsDb } from "@sgrs/db";
import type { EventsApi } from "@sgrs/client-ts";

export interface AppConfig {
  db: Db;
  analytics: AnalyticsDb;
  /**
   * Optional NATS events transport.
   * When provided and connected, mutations publish typed governance events.
   */
  events?: EventsApi;
  /** Allowed CORS origins. Defaults to CORS_ORIGINS env var or "*" in dev. */
  corsOrigins?: string | string[];
}

export function createApp({ db, analytics, events, corsOrigins }: AppConfig) {
  const app = new Hono();

  // ── Global middleware ──────────────────────────────────────────────────────

  app.use("*", logger());

  app.use(
    "*",
    cors({
      origin:
        corsOrigins ??
        (process.env.CORS_ORIGINS
          ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
          : process.env.NODE_ENV === "production"
            ? []
            : "*"),
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Tenant-ID"],
      exposeHeaders: ["X-Request-ID"],
      maxAge: 86400,
    })
  );

  // ── Error handler ──────────────────────────────────────────────────────────
  // Registered as onError — catches errors from all downstream handlers.
  app.onError(errorHandler);

  // ── Health (no auth, no tenant) ────────────────────────────────────────────
  app.route("/api/health", createHealthRouter(db));

  // ── Authenticated + tenant-scoped routes ──────────────────────────────────
  const api = new Hono();
  api.use("*", authMiddleware);
  api.use("*", tenantMiddleware);

  api.route("/scopes", createScopesRouter(db, analytics, events));
  api.route("/models", createModelsRouter(db, analytics, events));
  api.route("/finality", createFinalityRouter(db, analytics, events));
  api.route("/agents", createAgentsRouter(db));
  // Governance domain
  api.route("/claims", createClaimsRouter(db, events));
  api.route("/drifts", createDriftsRouter(db, events));
  api.route("/contradictions", createContradictionsRouter(db, events));
  api.route("/risks", createRisksRouter(db, events));
  api.route("/documents", createDocumentsRouter(db, events));
  api.route("/epochs", createEpochsRouter(db, events));
  // Document ingestion pipeline: register → facts-worker → claims/contradictions/risks
  api.route("/ingest", createIngestRouter(db, events));

  app.route("/api", api);

  // ── 404 catch-all ─────────────────────────────────────────────────────────
  app.notFound((c) =>
    c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
  );

  return app;
}
