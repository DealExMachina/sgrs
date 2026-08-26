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
import { createDb, closeDb, runMigrations, AnalyticsDb, organizations, projects } from "@sgrs/db";
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
  await db.insert(organizations).values({ id: "acme", name: "Acme Test" }).onConflictDoNothing();
  await db.insert(projects).values({
    id: "acme-default",
    org_id: "acme",
    name: "Default",
    slug: "default",
  }).onConflictDoNothing();
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
    project?: string;
    bearer?: string;
  },
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-Project-ID": opts?.project ?? "acme-default",
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

  it("applies default values when optional fields are omitted", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const createRes = await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "defaults-scope", name: "Defaults", tag: "DEF" },
        }),
      );
      expect(createRes.status).toBe(201);
      const created = await createRes.json() as {
        state: string;
        score: number;
        cycles: number;
        created_at: string;
        updated_at: string;
      };
      // Optional fields fall back to schema defaults
      expect(created.state).toBe("active");
      expect(created.score).toBe(0);
      expect(created.cycles).toBe(0);
      // Timestamps are serialised as ISO-8601 strings
      expect(() => new Date(created.created_at).toISOString()).not.toThrow();
      expect(created.created_at).toBe(created.updated_at);
    } finally {
      await cleanup();
    }
  });

  it("rejects a create with an invalid body (400)", async () => {
    const { app, cleanup } = await makeApp();
    try {
      // score above the allowed range [0, 1]
      const badScore = await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "bad-score", name: "Bad", tag: "B", score: 5 },
        }),
      );
      expect(badScore.status).toBe(400);

      // id violating the lowercase-slug rule
      const badId = await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "Not A Slug", name: "Bad", tag: "B" },
        }),
      );
      expect(badId.status).toBe(400);

      // missing required name
      const missingName = await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "no-name", tag: "B" },
        }),
      );
      expect(missingName.status).toBe(400);
    } finally {
      await cleanup();
    }
  });

  it("fully replaces a scope via PUT", async () => {
    const { app, cleanup } = await makeApp();
    try {
      await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "put-me", name: "Original", tag: "ORIG", score: 0.1, cycles: 1 },
        }),
      );

      const putRes = await app.request(
        req("PUT", "/api/scopes/put-me", {
          tenant: "acme",
          body: { name: "Replaced", tag: "NEW", state: "resolved", score: 0.9, cycles: 7 },
        }),
      );
      expect(putRes.status).toBe(200);
      const replaced = await putRes.json() as {
        id: string;
        name: string;
        tag: string;
        state: string;
        score: number;
        cycles: number;
      };
      expect(replaced.id).toBe("put-me");
      expect(replaced.name).toBe("Replaced");
      expect(replaced.tag).toBe("NEW");
      expect(replaced.state).toBe("resolved");
      expect(replaced.score).toBeCloseTo(0.9);
      expect(replaced.cycles).toBe(7);
    } finally {
      await cleanup();
    }
  });

  it("returns 404 when PUT targets a missing scope", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.request(
        req("PUT", "/api/scopes/ghost", {
          tenant: "acme",
          body: { name: "Ghost", tag: "G", state: "active", score: 0, cycles: 0 },
        }),
      );
      expect(res.status).toBe(404);
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

// ─── Provenance & traceability ────────────────────────────────────────────────

describe("Provenance & traceability", () => {
  it("stores document provenance and links claims/risks by document_id", async () => {
    const { app, cleanup } = await makeApp();
    try {
      await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "prov-scope", name: "Prov", tag: "P" },
        }),
      );

      // Put a document with a stable provenance reference.
      const provenance = "sha256:deadbeef";
      const docRes = await app.request(
        req("POST", "/api/documents", {
          tenant: "acme",
          body: { scope_id: "prov-scope", name: "Deal.pdf", type: "pdf", status: "processing", provenance },
        }),
      );
      expect(docRes.status).toBe(201);
      const doc = await docRes.json() as { id: string; provenance?: string };
      expect(doc.provenance).toBe(provenance);

      // A claim carries the document_id back to its source.
      const claimRes = await app.request(
        req("POST", "/api/claims", {
          tenant: "acme",
          body: { scope_id: "prov-scope", text: "Price is $10M.", source: "Deal.pdf", document_id: doc.id, confidence: 0.9 },
        }),
      );
      expect(claimRes.status).toBe(201);

      // A risk also links to the document.
      const riskRes = await app.request(
        req("POST", "/api/risks", {
          tenant: "acme",
          body: { scope_id: "prov-scope", description: "Concentration risk.", level: "high", source: "Deal.pdf", document_id: doc.id },
        }),
      );
      expect(riskRes.status).toBe(201);

      // Read back and assert the provenance link round-trips.
      const claims = await (await app.request(
        req("GET", "/api/claims/prov-scope", { tenant: "acme" })
      )).json() as Array<{ document_id?: string }>;
      expect(claims).toHaveLength(1);
      expect(claims[0]!.document_id).toBe(doc.id);

      const risks = await (await app.request(
        req("GET", "/api/risks/prov-scope", { tenant: "acme" })
      )).json() as Array<{ document_id?: string }>;
      expect(risks[0]!.document_id).toBe(doc.id);

      const docs = await (await app.request(
        req("GET", "/api/documents/prov-scope", { tenant: "acme" })
      )).json() as Array<{ provenance?: string }>;
      expect(docs[0]!.provenance).toBe(provenance);
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

  it("rounds per_dimension floats to six decimal places", async () => {
    const { app, cleanup } = await makeApp();
    try {
      await app.request(
        req("POST", "/api/scopes", {
          tenant: "acme",
          body: { id: "float-scope", name: "Float", tag: "F" },
        }),
      );

      const noisy = {
        ...FINALITY_BODY,
        per_dimension: {
          claim_confidence: 0.49999999999999994,
          contradiction_resolution: 0.5600000000000001,
        },
      };

      const upsertRes = await app.request(
        req("POST", "/api/finality/float-scope", {
          tenant: "acme",
          body: noisy,
        }),
      );
      expect(upsertRes.status).toBe(200);
      const posted = await upsertRes.json() as {
        per_dimension: Record<string, number>;
      };
      expect(posted.per_dimension.claim_confidence).toBe(0.5);
      expect(posted.per_dimension.contradiction_resolution).toBe(0.56);

      const getRes = await app.request(
        req("GET", "/api/finality/float-scope", { tenant: "acme" }),
      );
      const fetched = await getRes.json() as {
        per_dimension: Record<string, number>;
      };
      expect(fetched.per_dimension.claim_confidence).toBe(0.5);
      expect(fetched.per_dimension.contradiction_resolution).toBe(0.56);
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
