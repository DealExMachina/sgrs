import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { AnalyticsDb, closeDb, createDb, runMigrations } from "@sgrs/db";
import { createApp } from "../app.js";

const OPEN_SWARM_REPO =
  process.env.OPEN_SWARM_REPO ??
  "/Users/jeanbapt/GitHub/open-governed-swarm-of-agents";
const OPEN_SWARM_CLIENT_FILE = join(
  OPEN_SWARM_REPO,
  "packages/sgrs-client/src/index.ts",
);

type Recorded = { method: string; url: string };

async function makeAdminApp() {
  const dbDir = await mkdtemp(join(tmpdir(), "sgrs-sync-"));
  await runMigrations(dbDir);
  const db = createDb(dbDir);
  const analytics = await AnalyticsDb.create(":memory:");
  const app = createApp({ db, analytics });
  return {
    app,
    cleanup: async () => {
      await closeDb(db);
      analytics.close();
      await rm(dbDir, { recursive: true, force: true });
    },
  };
}

const hasOpenSwarmClient = existsSync(OPEN_SWARM_CLIENT_FILE);

describe.skipIf(!hasOpenSwarmClient)(
  "Smoke sync: open-swarm client vs sgrs admin proxy",
  () => {
    it("maps core control-plane operations to identical kernel paths", async () => {
      const originalEnv = {
        ADMIN_API_KEY: process.env.ADMIN_API_KEY,
        KERNEL_CONTROL_PLANE_ADMIN_TOKEN:
          process.env.KERNEL_CONTROL_PLANE_ADMIN_TOKEN,
        FEED_SERVER_URL: process.env.FEED_SERVER_URL,
      };
      const originalFetch = globalThis.fetch;

      process.env.ADMIN_API_KEY = "admin-key";
      process.env.KERNEL_CONTROL_PLANE_ADMIN_TOKEN = "cp-admin-key";
      process.env.FEED_SERVER_URL = "http://kernel-feed:3002";

      const { app, cleanup } = await makeAdminApp();

      const adminProxyCalls: Record<string, Recorded> = {};
      const openClientCalls: Record<string, Recorded> = {};

      try {
        // Mock fetch used by admin proxy forwards.
        globalThis.fetch = (async (input, init) => {
          const url = String(input);
          const m = (init?.method ?? "GET").toUpperCase();
          if (url.includes("/v1/tenants")) {
            adminProxyCalls.createTenant = { method: m, url };
          } else if (url.includes("/v1/scopes?")) {
            adminProxyCalls.listScopes = { method: m, url };
          } else if (url.endsWith("/v1/scopes")) {
            adminProxyCalls.createScope = { method: m, url };
          } else if (url.includes("/v1/runtime/start")) {
            adminProxyCalls.runtimeStart = { method: m, url };
          } else if (url.includes("/v1/scopes/") && url.endsWith("/summary")) {
            adminProxyCalls.summary = { method: m, url };
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }) as typeof fetch;

        // Exercise sgrs admin proxy routes (single public endpoint).
        const commonHeaders = {
          Authorization: "Bearer admin-key",
          "X-Tenant-API-Key": "tenant-api-key",
          "Content-Type": "application/json",
        };
        await app.request("http://localhost/admin/tenants", {
          method: "POST",
          headers: commonHeaders,
          body: JSON.stringify({ name: "Acme" }),
        });
        await app.request("http://localhost/admin/scopes", {
          method: "GET",
          headers: commonHeaders,
        });
        await app.request("http://localhost/admin/scopes", {
          method: "POST",
          headers: commonHeaders,
          body: JSON.stringify({ slug: "scope-a" }),
        });
        await app.request("http://localhost/admin/runtime/start", {
          method: "POST",
          headers: commonHeaders,
          body: JSON.stringify({ scope_id: "scope-a" }),
        });
        await app.request("http://localhost/admin/scopes/scope-a/summary", {
          method: "GET",
          headers: commonHeaders,
        });

        // Exercise open-swarm direct control-plane client.
        const mod = await import(pathToFileURL(OPEN_SWARM_CLIENT_FILE).href);
        const createSgrsClient = mod.createSgrsClient as (
          opts: {
            baseUrl: string;
            apiKey: string;
            fetchImpl: typeof fetch;
          },
        ) => {
          createTenant?: (name: string) => Promise<unknown>;
          listScopes: () => Promise<unknown>;
          createScope: (slug: string, displayName?: string) => Promise<unknown>;
          runtimeStart: (scopeId: string) => Promise<unknown>;
          summary: (scopeId: string) => Promise<unknown>;
        };
        const createAdminClient = mod.createAdminClient as (
          baseUrl: string,
          token: string,
          fetchImpl: typeof fetch,
        ) => { createTenant: (name: string) => Promise<unknown> };

        const clientFetch = (async (input, init) => {
          const url = String(input);
          const m = (init?.method ?? "GET").toUpperCase();
          if (url.includes("/v1/tenants")) {
            openClientCalls.createTenant = { method: m, url };
            return new Response(
              JSON.stringify({
                tenant_id: "t-1",
                api_key: "k",
                key_prefix: "p",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          if (url.includes("/v1/scopes?")) {
            openClientCalls.listScopes = { method: m, url };
          } else if (url.endsWith("/v1/scopes")) {
            openClientCalls.createScope = { method: m, url };
          } else if (url.includes("/v1/runtime/start")) {
            openClientCalls.runtimeStart = { method: m, url };
          } else if (url.includes("/v1/scopes/") && url.endsWith("/summary")) {
            openClientCalls.summary = { method: m, url };
          }
          return new Response(JSON.stringify({ ok: true, scopes: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }) as typeof fetch;

        const cpClient = createSgrsClient({
          baseUrl: "http://kernel-feed:3002",
          apiKey: "tenant-api-key",
          fetchImpl: clientFetch,
        });
        const adminClient = createAdminClient(
          "http://kernel-feed:3002",
          "cp-admin-key",
          clientFetch,
        );
        await adminClient.createTenant("Acme");
        await cpClient.listScopes();
        await cpClient.createScope("scope-a");
        await cpClient.runtimeStart("scope-a");
        await cpClient.summary("scope-a");

        expect(adminProxyCalls.createTenant).toEqual(openClientCalls.createTenant);
        expect(adminProxyCalls.listScopes).toEqual(openClientCalls.listScopes);
        expect(adminProxyCalls.createScope).toEqual(openClientCalls.createScope);
        expect(adminProxyCalls.runtimeStart).toEqual(openClientCalls.runtimeStart);
        expect(adminProxyCalls.summary).toEqual(openClientCalls.summary);
      } finally {
        globalThis.fetch = originalFetch;
        if (originalEnv.ADMIN_API_KEY === undefined)
          delete process.env.ADMIN_API_KEY;
        else process.env.ADMIN_API_KEY = originalEnv.ADMIN_API_KEY;
        if (originalEnv.KERNEL_CONTROL_PLANE_ADMIN_TOKEN === undefined)
          delete process.env.KERNEL_CONTROL_PLANE_ADMIN_TOKEN;
        else
          process.env.KERNEL_CONTROL_PLANE_ADMIN_TOKEN =
            originalEnv.KERNEL_CONTROL_PLANE_ADMIN_TOKEN;
        if (originalEnv.FEED_SERVER_URL === undefined)
          delete process.env.FEED_SERVER_URL;
        else
          process.env.FEED_SERVER_URL =
            originalEnv.FEED_SERVER_URL;
        await cleanup();
      }
    });
  },
);

