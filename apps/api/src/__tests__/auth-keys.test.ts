/**
 * Product API keys auth — org-scoped keys bind tenant without X-Tenant-ID.
 */

import { describe, it, expect } from "vitest";
import {
  generateTenantApiKey,
  hashApiKey,
  organizations,
  projects,
  apiKeys,
} from "@sgrs/db";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, closeDb, runMigrations, AnalyticsDb } from "@sgrs/db";
import { createApp } from "../app.js";

const DEMO_ORG = "demo-org";
const DEMO_PROJECT = "demo-org-default";

async function makeAuthedApp() {
  const dbDir = await mkdtemp(join(tmpdir(), "sgrs-keys-"));
  await runMigrations(dbDir);
  const db = createDb(dbDir);
  const analytics = await AnalyticsDb.create(":memory:");

  await db.insert(organizations).values({ id: DEMO_ORG, name: "Demo Org" });
  await db.insert(projects).values({
    id: DEMO_PROJECT,
    org_id: DEMO_ORG,
    name: "Default",
    slug: "default",
  });

  const { key, prefix, hash } = generateTenantApiKey("live");
  await db.insert(apiKeys).values({
    org_id: DEMO_ORG,
    name: "test",
    key_prefix: prefix,
    key_hash: hash,
  });

  const app = createApp({ db, analytics });

  return {
    app,
    key,
    cleanup: async () => {
      await closeDb(db);
      analytics.close();
      await rm(dbDir, { recursive: true, force: true });
    },
  };
}

function req(method: string, path: string, bearer?: string) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Project-ID": DEMO_PROJECT,
  };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return new Request(`http://localhost${path}`, { method, headers });
}

describe("sk_ product API keys", () => {
  it("authenticates tenant tier and binds org from the key hash", async () => {
    const { app, key, cleanup } = await makeAuthedApp();
    try {
      const res = await app.request(req("GET", "/api/scopes", key));
      expect(res.status).toBe(200);
      const body = (await res.json()) as unknown[];
      expect(Array.isArray(body)).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("rejects invalid sk_ keys when product auth is enabled", async () => {
    const { app, cleanup } = await makeAuthedApp();
    try {
      const res = await app.request(
        req("GET", "/api/scopes", "sk_live_not-a-real-key"),
      );
      expect(res.status).toBe(401);
    } finally {
      await cleanup();
    }
  });

  it("stores only hashed material", async () => {
    const { key } = generateTenantApiKey("test");
    const hash = hashApiKey(key);
    expect(hash).not.toContain(key);
    expect(hash.length).toBe(64);
  });
});

describe("organization slug helpers", () => {
  it("clerk org id maps to a valid slug", async () => {
    const { clerkOrgIdToOrgSlug } = await import("../services/organizations.js");
    expect(clerkOrgIdToOrgSlug("org_2abcXYZ")).toMatch(/^[a-z0-9-]+$/);
  });
});
