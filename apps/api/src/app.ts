/**
 * SGRS Hono application factory.
 *
 * Single public HTTP surface with three privilege tiers, each gated by a
 * distinct bearer key (see middleware/tier.ts):
 *
 *   /api/*        — tenant tier   (TENANT_API_KEY or legacy API_KEY) + X-Tenant-ID
 *   /admin/*      — admin tier    (ADMIN_API_KEY) — setup and manage the swarm
 *   /internals/*  — godlike tier  (GODLIKE_API_KEY + IP allowlist) — deep internals
 *
 * Higher-tier keys also unlock lower-tier routes (hierarchical), but the
 * actual presented tier is recorded in the audit log.
 *
 * Middleware order (outer → inner):
 *   logger → cors → onError → requireTier(min) → tenantMiddleware (only on /api) → handler
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { errorHandler } from "./middleware/error.js";
import { makeRequireTier } from "./middleware/tier.js";
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
import { createAdminRouter } from "./routes/admin/index.js";
import { createInternalsRouter } from "./routes/internals/index.js";
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
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "X-Tenant-ID",
        "X-Tenant-API-Key",
        "X-Forwarded-For",
        "X-Real-IP",
      ],
      exposeHeaders: ["X-Request-ID"],
      maxAge: 86400,
    }),
  );

  // ── Error handler ──────────────────────────────────────────────────────────
  app.onError(errorHandler);

  const requireTier = makeRequireTier({ analytics });

  // ── Health (no auth, no tenant) ────────────────────────────────────────────
  app.route("/api/health", createHealthRouter(db));

  // ── Tenant tier ────────────────────────────────────────────────────────────
  const api = new Hono();
  api.use("*", requireTier("tenant"));
  api.use("*", tenantMiddleware);

  api.route("/scopes", createScopesRouter(db, analytics, events));
  api.route("/models", createModelsRouter(db, analytics, events));
  api.route("/finality", createFinalityRouter(db, analytics, events));
  api.route("/agents", createAgentsRouter(db));
  api.route("/claims", createClaimsRouter(db, events));
  api.route("/drifts", createDriftsRouter(db, events));
  api.route("/contradictions", createContradictionsRouter(db, events));
  api.route("/risks", createRisksRouter(db, events));
  api.route("/documents", createDocumentsRouter(db, events));
  api.route("/epochs", createEpochsRouter(db, events));
  api.route("/ingest", createIngestRouter(db, events));

  app.route("/api", api);

  // ── Admin tier (setup and manage) ──────────────────────────────────────────
  const admin = new Hono();
  admin.use("*", requireTier("admin"));
  admin.route("/", createAdminRouter(db, analytics, events));
  app.route("/admin", admin);

  // ── Godlike tier (deep internals, dev-only) ────────────────────────────────
  const internals = new Hono();
  internals.use("*", requireTier("godlike"));
  internals.route("/", createInternalsRouter(db, analytics, events));
  app.route("/internals", internals);

  // ── 404 catch-all ─────────────────────────────────────────────────────────
  app.notFound((c) =>
    c.json({ error: "Not found", code: "NOT_FOUND" }, 404),
  );

  return app;
}
