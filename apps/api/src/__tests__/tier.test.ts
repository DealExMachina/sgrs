/**
 * Tier middleware tests.
 *
 * Covers the three privilege tiers, hierarchical key acceptance, IP allowlist
 * enforcement on the godlike tier, and audit-log emission.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, closeDb, runMigrations, AnalyticsDb, organizations, projects } from "@sgrs/db";
import { createApp } from "../app.js";

const ENV_KEYS = [
  "API_KEY",
  "TENANT_API_KEY",
  "ADMIN_API_KEY",
  "GODLIKE_API_KEY",
  "GODLIKE_IP_ALLOWLIST",
  "KERNEL_CONTROL_PLANE_ADMIN_TOKEN",
  "FEED_SERVER_URL",
  "SWARM_API_TOKEN",
] as const;

let envBackup: Record<(typeof ENV_KEYS)[number], string | undefined>;

beforeEach(() => {
  envBackup = {} as typeof envBackup;
  for (const k of ENV_KEYS) {
    envBackup[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envBackup[k] !== undefined) process.env[k] = envBackup[k];
    else delete process.env[k];
  }
});

async function makeApp(env: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) {
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) process.env[k as (typeof ENV_KEYS)[number]] = v;
  }
  const dbDir = await mkdtemp(join(tmpdir(), "sgrs-tier-"));
  await runMigrations(dbDir);
  const db = createDb(dbDir);
  await db.insert(organizations).values({ id: "acme", name: "Acme" }).onConflictDoNothing();
  await db.insert(projects).values({
    id: "acme-default",
    org_id: "acme",
    name: "Default",
    slug: "default",
  }).onConflictDoNothing();
  const analytics = await AnalyticsDb.create(":memory:");
  const app = createApp({ db, analytics });
  return {
    app,
    analytics,
    cleanup: async () => {
      await closeDb(db);
      analytics.close();
      await rm(dbDir, { recursive: true, force: true });
    },
  };
}

function withBearer(
  token?: string,
  opts?: { tenant?: string; ip?: string },
): RequestInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Project-ID": "acme-default",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (opts?.tenant) headers["X-Tenant-ID"] = opts.tenant;
  if (opts?.ip) headers["X-Forwarded-For"] = opts.ip;
  return { headers };
}

// ─── Tenant tier (back-compat with legacy API_KEY) ───────────────────────────

describe("Tier middleware — tenant", () => {
  it("dev mode: /api/* open when no tenant key configured", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.request(
        "http://localhost/api/scopes",
        withBearer(undefined, { tenant: "acme" }),
      );
      expect(res.status).toBe(200);
    } finally {
      await cleanup();
    }
  });

  it("accepts legacy API_KEY env var as tenant key", async () => {
    const { app, cleanup } = await makeApp({ API_KEY: "legacy-secret" });
    try {
      const res = await app.request(
        "http://localhost/api/scopes",
        withBearer("legacy-secret", { tenant: "acme" }),
      );
      expect(res.status).toBe(200);
    } finally {
      await cleanup();
    }
  });

  it("accepts TENANT_API_KEY (preferred) over legacy alias", async () => {
    const { app, cleanup } = await makeApp({
      TENANT_API_KEY: "tenant-secret",
    });
    try {
      const res = await app.request(
        "http://localhost/api/scopes",
        withBearer("tenant-secret", { tenant: "acme" }),
      );
      expect(res.status).toBe(200);
    } finally {
      await cleanup();
    }
  });
});

// ─── Admin tier ──────────────────────────────────────────────────────────────

describe("Tier middleware — admin", () => {
  it("returns 503 when neither admin nor godlike key configured", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.request("http://localhost/admin/health");
      expect(res.status).toBe(503);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("ADMIN_DISABLED");
    } finally {
      await cleanup();
    }
  });

  it("returns 401 when no Authorization header", async () => {
    const { app, cleanup } = await makeApp({ ADMIN_API_KEY: "admin-secret" });
    try {
      const res = await app.request("http://localhost/admin/health");
      expect(res.status).toBe(401);
    } finally {
      await cleanup();
    }
  });

  it("returns 200 with admin key", async () => {
    const { app, cleanup } = await makeApp({ ADMIN_API_KEY: "admin-secret" });
    try {
      const res = await app.request(
        "http://localhost/admin/health",
        withBearer("admin-secret"),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { tier: string; authTier: string };
      expect(body.tier).toBe("admin");
      expect(body.authTier).toBe("admin");
    } finally {
      await cleanup();
    }
  });

  it("returns 403 when tenant key is presented at admin tier", async () => {
    const { app, cleanup } = await makeApp({
      TENANT_API_KEY: "tenant-secret",
      ADMIN_API_KEY: "admin-secret",
    });
    try {
      const res = await app.request(
        "http://localhost/admin/health",
        withBearer("tenant-secret"),
      );
      expect(res.status).toBe(403);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("AUTH_TIER_INSUFFICIENT");
    } finally {
      await cleanup();
    }
  });

  it("godlike key works on admin route (hierarchical)", async () => {
    const { app, cleanup } = await makeApp({
      ADMIN_API_KEY: "admin-secret",
      GODLIKE_API_KEY: "godlike-secret",
    });
    try {
      const res = await app.request(
        "http://localhost/admin/health",
        withBearer("godlike-secret"),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { authTier: string };
      // The presented tier is recorded, even though the route's minimum was admin.
      expect(body.authTier).toBe("godlike");
    } finally {
      await cleanup();
    }
  });
});

// ─── Audit log emission ──────────────────────────────────────────────────────

describe("Tier middleware — audit log", () => {
  it("appends auth.admin.allow with keyid on successful admin call", async () => {
    const { app, analytics, cleanup } = await makeApp({
      ADMIN_API_KEY: "admin-secret",
    });
    try {
      const res = await app.request(
        "http://localhost/admin/health",
        withBearer("admin-secret"),
      );
      expect(res.status).toBe(200);

      // Auth audits land under tenant_id="system" (admin/godlike are not
      // tenant-scoped). recentAudit filters by tenantId.
      const events = await analytics.recentAudit("system", 10);
      const auth = events.filter((e) =>
        e.event_type.startsWith("auth.admin"),
      );
      expect(auth.length).toBeGreaterThanOrEqual(1);
      expect(auth[0]?.event_type).toBe("auth.admin.allow");
      expect(auth[0]?.actor.startsWith("keyid:")).toBe(true);
      expect(auth[0]?.entity_id).toBe("/admin/health");
    } finally {
      await cleanup();
    }
  });

  it("appends auth.admin.deny with reason on invalid key", async () => {
    const { app, analytics, cleanup } = await makeApp({
      ADMIN_API_KEY: "admin-secret",
    });
    try {
      const res = await app.request(
        "http://localhost/admin/health",
        withBearer("wrong-key"),
      );
      expect(res.status).toBe(401);

      const events = await analytics.recentAudit("system", 10);
      const deny = events.find((e) => e.event_type === "auth.admin.deny");
      expect(deny).toBeDefined();
      expect(deny?.actor).toBe("anonymous");
    } finally {
      await cleanup();
    }
  });

  it("does not audit successful tenant calls (kept quiet)", async () => {
    const { app, analytics, cleanup } = await makeApp({
      TENANT_API_KEY: "tenant-secret",
    });
    try {
      await app.request(
        "http://localhost/api/scopes",
        withBearer("tenant-secret", { tenant: "acme" }),
      );
      const events = await analytics.recentAudit("system", 10);
      const tenantAuth = events.filter((e) =>
        e.event_type.startsWith("auth.tenant"),
      );
      expect(tenantAuth).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });
});

describe("Admin proxy guards", () => {
  it("returns 503 when control-plane admin token is missing", async () => {
    const originalFetch = globalThis.fetch;
    const { app, cleanup } = await makeApp({
      ADMIN_API_KEY: "admin-secret",
    });
    try {
      // No remote call should be attempted when token is absent.
      globalThis.fetch = (async () => {
        throw new Error("unexpected fetch call");
      }) as typeof fetch;

      const res = await app.request(
        "http://localhost/admin/control-plane/health",
        withBearer("admin-secret"),
      );
      expect(res.status).toBe(503);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("CONTROL_PLANE_ADMIN_TOKEN_MISSING");
    } finally {
      globalThis.fetch = originalFetch;
      await cleanup();
    }
  });

  it("requires X-Tenant-API-Key for tenant-scoped admin proxy routes", async () => {
    const { app, cleanup } = await makeApp({
      ADMIN_API_KEY: "admin-secret",
      KERNEL_CONTROL_PLANE_ADMIN_TOKEN: "cp-admin",
    });
    try {
      const res = await app.request(
        "http://localhost/admin/scopes",
        withBearer("admin-secret"),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("TENANT_API_KEY_MISSING");
    } finally {
      await cleanup();
    }
  });

  it("returns 502 with proxy code when kernel upstream is unreachable", async () => {
    const originalFetch = globalThis.fetch;
    const { app, cleanup } = await makeApp({
      ADMIN_API_KEY: "admin-secret",
      KERNEL_CONTROL_PLANE_ADMIN_TOKEN: "cp-admin",
      FEED_SERVER_URL: "http://kernel-feed:3002",
    });
    try {
      globalThis.fetch = (async () => {
        throw new Error("connect ECONNREFUSED");
      }) as typeof fetch;
      const res = await app.request(
        "http://localhost/admin/control-plane/health",
        withBearer("admin-secret"),
      );
      expect(res.status).toBe(502);
      const body = (await res.json()) as { code: string; target: string };
      expect(body.code).toBe("PROXY_UPSTREAM_UNAVAILABLE");
      expect(body.target).toBe("http://kernel-feed:3002/v1/health");
    } finally {
      globalThis.fetch = originalFetch;
      await cleanup();
    }
  });
});
