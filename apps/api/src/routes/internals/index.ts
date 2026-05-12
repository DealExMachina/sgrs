/**
 * Godlike (internals) tier router (mounted under /internals).
 *
 * Tier guard is applied by app.ts via requireTier("godlike"). Additional
 * IP-allowlist enforcement happens in the tier middleware.
 *
 * Intended for engineers operating the deep internals during development:
 * hatchery snapshots, raw cluster-wide event streams, kernel debug helpers,
 * policy version introspection. Declared in OpenAPI with `x-internal: true`.
 */

import { Hono } from "hono";
import type { Db, AnalyticsDb } from "@sgrs/db";
import type { EventsApi } from "@sgrs/client-ts";
import {
  proxyControlPlaneAsAdmin,
  proxyControlPlaneAsTenant,
  proxyFeed,
} from "../controlPlaneProxy.js";

export function createInternalsRouter(
  _db: Db,
  _analytics: AnalyticsDb,
  _events?: EventsApi,
) {
  const r = new Hono();

  r.get("/health", (c) =>
    c.json({
      status: "ok",
      tier: "godlike",
      authTier: c.var.authTier ?? null,
    }),
  );

  // Deep internals: kernel feed/control routes (godlike only).
  // Keep old aliases for compatibility while introducing explicit /kernel/* names.
  r.get("/hatchery/snapshot", async (c) => proxyFeed(c, "/hatchery/snapshot"));
  r.get("/events", async (c) => proxyFeed(c, "/events"));
  r.get("/convergence", async (c) => {
    const u = new URL(c.req.url);
    return proxyFeed(c, `/convergence${u.search}`);
  });
  r.get("/kernel/health", async (c) => proxyFeed(c, "/health"));
  r.get("/kernel/hatchery/snapshot", async (c) =>
    proxyFeed(c, "/hatchery/snapshot"),
  );
  r.get("/kernel/events", async (c) => proxyFeed(c, "/events"));
  r.get("/kernel/convergence", async (c) => {
    const u = new URL(c.req.url);
    return proxyFeed(c, `/convergence${u.search}`);
  });

  // Internal control-plane health
  r.get("/control-plane/health", async (c) =>
    proxyControlPlaneAsAdmin(c, "/v1/health"),
  );
  r.get("/kernel/control-plane/health", async (c) =>
    proxyControlPlaneAsAdmin(c, "/v1/health"),
  );

  // Godlike runtime controls still require an explicit tenant API key for
  // tenant-scoped runtime ownership checks in the kernel.
  r.post("/kernel/runtime/start", async (c) =>
    proxyControlPlaneAsTenant(c, "/v1/runtime/start"),
  );
  r.post("/kernel/runtime/pause", async (c) =>
    proxyControlPlaneAsTenant(c, "/v1/runtime/pause"),
  );
  r.post("/kernel/runtime/resume", async (c) =>
    proxyControlPlaneAsTenant(c, "/v1/runtime/resume"),
  );
  r.post("/kernel/runtime/stop", async (c) =>
    proxyControlPlaneAsTenant(c, "/v1/runtime/stop"),
  );
  r.post("/kernel/runtime/restart", async (c) =>
    proxyControlPlaneAsTenant(c, "/v1/runtime/restart"),
  );

  return r;
}
