/**
 * Admin tier router (mounted under /admin).
 *
 * Tier guard is applied by app.ts via requireTier("admin").
 *
 * Phase 1 ships only a status endpoint. Phase 2 will add tenant CRUD,
 * scope provisioning, runtime control (start/pause/resume/stop), and
 * destructive operations such as scope reset — all moved over from the
 * kernel's controlPlaneServer.ts and namespaced under /admin.
 */

import { Hono } from "hono";
import type { Db, AnalyticsDb } from "@sgrs/db";
import type { EventsApi } from "@sgrs/client-ts";
import { proxyControlPlaneAsAdmin, proxyControlPlaneAsTenant } from "../controlPlaneProxy.js";

export function createAdminRouter(
  _db: Db,
  _analytics: AnalyticsDb,
  _events?: EventsApi,
) {
  const r = new Hono();

  r.get("/health", (c) =>
    c.json({
      status: "ok",
      tier: "admin",
      authTier: c.var.authTier ?? null,
    }),
  );

  // Control-plane readiness (admin token path)
  r.get("/control-plane/health", async (c) =>
    proxyControlPlaneAsAdmin(c, "/v1/health"),
  );

  // Tenant lifecycle
  r.post("/tenants", async (c) =>
    proxyControlPlaneAsAdmin(c, "/v1/tenants"),
  );

  // Scope management (tenant-scoped in kernel control plane; admin must provide
  // X-Tenant-API-Key for the target tenant).
  r.get("/scopes", async (c) => {
    const u = new URL(c.req.url);
    return proxyControlPlaneAsTenant(c, `/v1/scopes${u.search}`);
  });
  r.post("/scopes", async (c) =>
    proxyControlPlaneAsTenant(c, "/v1/scopes"),
  );

  // Scope documents + ingest + summary + metrics + reset
  r.post("/scopes/:scopeId/documents", async (c) =>
    proxyControlPlaneAsTenant(c, `/v1/scopes/${c.req.param("scopeId")}/documents`),
  );
  r.post("/scopes/:scopeId/ingest", async (c) =>
    proxyControlPlaneAsTenant(c, `/v1/scopes/${c.req.param("scopeId")}/ingest`),
  );
  r.get("/scopes/:scopeId/summary", async (c) =>
    proxyControlPlaneAsTenant(c, `/v1/scopes/${c.req.param("scopeId")}/summary`),
  );
  r.get("/scopes/:scopeId/metrics", async (c) => {
    const u = new URL(c.req.url);
    return proxyControlPlaneAsTenant(c, `/v1/scopes/${c.req.param("scopeId")}/metrics${u.search}`);
  });
  r.get("/scopes/:scopeId/events", async (c) =>
    proxyControlPlaneAsTenant(c, `/v1/scopes/${c.req.param("scopeId")}/events`),
  );
  r.post("/scopes/:scopeId/reset", async (c) =>
    proxyControlPlaneAsTenant(c, `/v1/scopes/${c.req.param("scopeId")}/reset`),
  );

  // Runtime control
  r.post("/runtime/start", async (c) =>
    proxyControlPlaneAsTenant(c, "/v1/runtime/start"),
  );
  r.post("/runtime/pause", async (c) =>
    proxyControlPlaneAsTenant(c, "/v1/runtime/pause"),
  );
  r.post("/runtime/resume", async (c) =>
    proxyControlPlaneAsTenant(c, "/v1/runtime/resume"),
  );
  r.post("/runtime/stop", async (c) =>
    proxyControlPlaneAsTenant(c, "/v1/runtime/stop"),
  );
  r.post("/runtime/restart", async (c) =>
    proxyControlPlaneAsTenant(c, "/v1/runtime/restart"),
  );

  return r;
}
