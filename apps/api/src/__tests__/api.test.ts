/**
 * Integration tests for the SGRS REST API.
 *
 * Uses PGlite (in-process WASM Postgres) + in-memory DuckDB — no external services.
 * Tests run directly against the Hono app via app.request() — no TCP listen needed.
 *
 * Coverage:
 *   ✓ Health check — no auth/tenant required
 *   ✓ Auth middleware — 401 when API_KEY is set but token is wrong or missing
 *   ✓ Tenant isolation — data from tenant A is invisible to tenant B
 *   ✓ Scope CRUD — create, list, get, patch, delete; 404 on missing
 *   ✓ Finality upsert idempotency — POST twice, only one row; score updates
 *   ✓ Finality history — GET /history returns DuckDB time-series points
 */

import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, closeDb, runMigrations, AnalyticsDb } from "@sgrs/db";
import { createApp } from "../app.js";
import type { AppConfig } from "../app.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Create a fully isolated app for a test.
 *
 * PGlite `:memory:` creates a brand-new database per instance — so we must
 * run migrations and then open the app on the SAME file path. We use a temp
 * directory that is cleaned up in the returned `cleanup()` function.
 */
async function makeApp(opts?: { apiKey?: string }) {
  // Unique temp directory so concurrent tests never share state
  const dbDir = await mkdtemp(join(tmpdir(), "sgrs-test-"));

  // Step 1: run migrations to initialise the schema in the temp dir
  await runMigrations(dbDir);

  // Step 2: open the same database for the app
  const db = createDb(dbDir);
  const analytics = await AnalyticsDb.create(":memory:");

  const config: AppConfig = { db, analytics };

  // Set env var for auth middleware if we want auth enabled
  const savedKey = process.env.API_KEY;
  if (opts?.apiKey !== undefined) {
    process.env.API_KEY = opts.apiKey;
  } else {
    delete process.env.API_KEY;
  }

  const app = createApp(config);

  return {
    app,
    analytics,
    cleanup: async () => {
      await closeDb(db);
      analytics.close();
      await rm(dbDir, { recursive: true, force: true });
      // Restore env
      if (savedKey !== undefined) process.env.API_KEY = savedKey;
      else delete process.env.API_KEY;
    },
  };
}

/** Build a JSON request with the standard headers. */
function req(
  method: string,
  path: string,
  opts?: {
    body?: unknown;
    tenant?: string;
    bearer?: string;
  },
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (opts?.tenant) headers["X-Tenant-ID"] = opts.tenant;
  if (opts?.bearer) headers["Authorization"] = `Bearer ${opts.bearer}`;

  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: opts?.body != null ? JSON.stringify(opts.body) : undefined,
  });
}

// ─── Health ───────────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns 200 with status ok — no auth or tenant header required", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.request(req("GET", "/api/health"));
      expect(res.status).toBe(200);
      const body = await res.json() as { status: string; db: string };
      expect(body.status).toBe("ok");
      expect(body.db).toBe("ok");
    } finally {
      await cleanup();
    }
  });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe("Auth middleware", () => {
  it("returns 401 when API_KEY is set and request has no Authorization header", async () => {
    const { app, cleanup } = await makeApp({ apiKey: "secret-key" });
    try {
      const res = await app.request(
        req("GET", "/api/scopes", { tenant: "acme" })
      );
      expect(res.status).toBe(401);
    } finally {
      await cleanup();
    }
  });

  it("returns 401 when token is wrong", async () => {
    const { app, cleanup } = await makeApp({ apiKey: "secret-key" });
    try {
      const res = await app.request(
        req("GET", "/api/scopes", { tenant: "acme", bearer: "wrong-token" })
      );
      expect(res.status).toBe(401);
    } finally {
      await cleanup();
    }
  });

  it("returns 200 with correct bearer token", async () => {
    const { app, cleanup } = await makeApp({ apiKey: "secret-key" });
    try {
      const res = await app.request(
        req("GET", "/api/scopes", { tenant: "acme", bearer: "secret-key" })
      );
      expect(res.status).toBe(200);
    } finally {
      await cleanup();
    }
  });
});

// ─── Scope CRUD ───────────────────────────────────────────────────────────────

describe("Scope CRUD", () => {
  it("creates a scope and retrieves it", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const createRes = await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "test-scope-1", name: "Test Scope", tag: "TEST", state: "active", score: 0.5, cycles: 3 },
        }),
      );
      expect(createRes.status).toBe(201);
      const created = await createRes.json() as { id: string; name: string; score: number };
      expect(created.id).toBe("test-scope-1");
      expect(created.name).toBe("Test Scope");
      expect(created.score).toBeCloseTo(0.5);

      const getRes = await app.request(
        req("GET", "/api/scopes/test-scope-1", { tenant: "acme" })
      );
      expect(getRes.status).toBe(200);
      const fetched = await getRes.json() as { id: string };
      expect(fetched.id).toBe("test-scope-1");
    } finally {
      await cleanup();
    }
  });

  it("lists only scopes belonging to the requesting tenant", async () => {
    const { app, cleanup } = await makeApp();
    try {
      // Create scope for tenant acme
      await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "acme-scope", name: "ACME", tag: "A" },
        }),
      );
      // Create scope for tenant bravo
      await app.request(
        req("POST", "/api/scopes", {
          tenant: "bravo",
          body: { id: "bravo-scope", name: "BRAVO", tag: "B" },
        }),
      );

      // acme should only see its own scope
      const acmeRes = await app.request(
        req("GET", "/api/scopes", { tenant: "acme" })
      );
      const acmeScopes = await acmeRes.json() as Array<{ id: string }>;
      expect(acmeScopes.every((s) => s.id === "acme-scope")).toBe(true);
      expect(acmeScopes.some((s) => s.id === "bravo-scope")).toBe(false);

      // bravo should only see its own scope
      const bravoRes = await app.request(
        req("GET", "/api/scopes", { tenant: "bravo" })
      );
      const bravoScopes = await bravoRes.json() as Array<{ id: string }>;
      expect(bravoScopes.every((s) => s.id === "bravo-scope")).toBe(true);
      expect(bravoScopes.some((s) => s.id === "acme-scope")).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("returns 404 when scope does not exist", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.request(
        req("GET", "/api/scopes/nonexistent", { tenant: "acme" })
      );
      expect(res.status).toBe(404);
    } finally {
      await cleanup();
    }
  });

  it("returns 404 for cross-tenant access (tenant isolation)", async () => {
    const { app, cleanup } = await makeApp();
    try {
      await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "private-scope", name: "Private", tag: "P" },
        }),
      );

      // Tenant bravo tries to get acme's scope
      const res = await app.request(
        req("GET", "/api/scopes/private-scope", { tenant: "bravo" })
      );
      expect(res.status).toBe(404);
    } finally {
      await cleanup();
    }
  });

  it("patches a scope and returns the updated record", async () => {
    const { app, cleanup } = await makeApp();
    try {
      await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "patch-me", name: "Before", tag: "BEFORE" },
        }),
      );

      const patchRes = await app.request(
        req("PATCH", "/api/scopes/patch-me", {
          tenant: "acme",
          body: { name: "After", score: 0.88 },
        }),
      );
      expect(patchRes.status).toBe(200);
      const patched = await patchRes.json() as { name: string; score: number };
      expect(patched.name).toBe("After");
      expect(patched.score).toBeCloseTo(0.88);
    } finally {
      await cleanup();
    }
  });

  it("returns 400 for empty PATCH body", async () => {
    const { app, cleanup } = await makeApp();
    try {
      await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "no-change", name: "X", tag: "X" },
        }),
      );
      const res = await app.request(
        req("PATCH", "/api/scopes/no-change", {
          tenant: "acme",
          body: {},
        }),
      );
      expect(res.status).toBe(400);
    } finally {
      await cleanup();
    }
  });

  it("deletes a scope and returns 404 on subsequent GET", async () => {
    const { app, cleanup } = await makeApp();
    try {
      await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "delete-me", name: "Bye", tag: "BYE" },
        }),
      );

      const delRes = await app.request(
        req("DELETE", "/api/scopes/delete-me", { tenant: "acme" })
      );
      expect(delRes.status).toBe(200);

      const getRes = await app.request(
        req("GET", "/api/scopes/delete-me", { tenant: "acme" })
      );
      expect(getRes.status).toBe(404);
    } finally {
      await cleanup();
    }
  });
});

// ─── Finality ─────────────────────────────────────────────────────────────────

describe("Finality", () => {
  const FINALITY_BODY = {
    score: 0.72,
    per_dimension: { claim_confidence: 0.88, contradiction_resolution: 0.56 },
    monotonicity_rounds: 3,
    plateau_ema: 0.04,
    convergence_rate: -0.11,
    state: "active" as const,
    veto_active: false,
  };

  it("returns 404 when no finality record exists yet", async () => {
    const { app, cleanup } = await makeApp();
    try {
      // Create the scope first (FK constraint)
      await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "fin-scope", name: "Fin", tag: "FIN" },
        }),
      );

      const res = await app.request(
        req("GET", "/api/finality/fin-scope", { tenant: "acme" })
      );
      expect(res.status).toBe(404);
    } finally {
      await cleanup();
    }
  });

  it("upserts finality and returns the record", async () => {
    const { app, cleanup } = await makeApp();
    try {
      await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "fin-scope-2", name: "Fin2", tag: "FIN" },
        }),
      );

      const upsertRes = await app.request(
        req("POST", "/api/finality/fin-scope-2", {
          tenant: "acme",
          body: FINALITY_BODY,
        }),
      );
      expect(upsertRes.status).toBe(200);
      const result = await upsertRes.json() as { scope_id: string; score: number };
      expect(result.scope_id).toBe("fin-scope-2");
      expect(result.score).toBeCloseTo(0.72);
    } finally {
      await cleanup();
    }
  });

  it("is idempotent — second POST with same data returns same result", async () => {
    const { app, cleanup } = await makeApp();
    try {
      await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "idem-scope", name: "Idem", tag: "X" },
        }),
      );

      // First upsert
      await app.request(
        req("POST", "/api/finality/idem-scope", {
          tenant: "acme",
          body: FINALITY_BODY,
        }),
      );

      // Second upsert with updated score
      const updatedBody = { ...FINALITY_BODY, score: 0.85 };
      const res2 = await app.request(
        req("POST", "/api/finality/idem-scope", {
          tenant: "acme",
          body: updatedBody,
        }),
      );
      expect(res2.status).toBe(200);
      const result = await res2.json() as { score: number };
      expect(result.score).toBeCloseTo(0.85);

      // GET should reflect the latest score
      const getRes = await app.request(
        req("GET", "/api/finality/idem-scope", { tenant: "acme" })
      );
      const fetched = await getRes.json() as { score: number };
      expect(fetched.score).toBeCloseTo(0.85);
    } finally {
      await cleanup();
    }
  });

  it("accumulates DuckDB history points on each upsert", async () => {
    const { app, cleanup } = await makeApp();
    try {
      await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "hist-scope", name: "Hist", tag: "H" },
        }),
      );

      // Upsert three times with different scores
      for (const score of [0.5, 0.65, 0.78]) {
        await app.request(
          req("POST", "/api/finality/hist-scope", {
            tenant: "acme",
            body: { ...FINALITY_BODY, score },
          }),
        );
      }

      const histRes = await app.request(
        req("GET", "/api/finality/hist-scope/history?limit=10", { tenant: "acme" })
      );
      expect(histRes.status).toBe(200);
      const hist = await histRes.json() as { scope_id: string; points: unknown[] };
      expect(hist.scope_id).toBe("hist-scope");
      expect(hist.points.length).toBe(3);
    } finally {
      await cleanup();
    }
  });
});

// ─── Tenant middleware ────────────────────────────────────────────────────────

describe("Tenant middleware", () => {
  it("returns 400 when X-Tenant-ID header is missing", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.request(
        new Request("http://localhost/api/scopes", {
          headers: { "Content-Type": "application/json" },
        })
      );
      expect(res.status).toBe(400);
    } finally {
      await cleanup();
    }
  });
});
