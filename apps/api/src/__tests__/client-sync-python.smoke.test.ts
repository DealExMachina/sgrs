import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  hasOpenSwarmSyncFixtures,
  OPEN_SWARM_PY_CLIENT,
  OPEN_SWARM_TS_CLIENT,
  SGRS_ADMIN_ROUTER,
} from "./open-swarm-paths.js";

const hasAllFiles = hasOpenSwarmSyncFixtures;

/**
 * Each row declares the canonical control-plane route and the snippets that must
 * exist in:
 *  - open-swarm Python client
 *  - open-swarm TypeScript client
 *  - sgrs admin proxy router
 *
 * This is a smoke-level sync check: if one side renames a route and another does
 * not, this test fails quickly in CI.
 */
const ROUTE_SYNC_MATRIX = [
  {
    route: "/v1/health",
    py: /\/v1\/health/,
    ts: /\/v1\/health/,
    admin: /\/v1\/health/,
  },
  {
    route: "/v1/tenants",
    py: /\/v1\/tenants/,
    ts: /\/v1\/tenants/,
    admin: /\/v1\/tenants/,
  },
  {
    route: "/v1/scopes (GET)",
    py: /\/v1\/scopes/,
    ts: /\/v1\/scopes/,
    admin: /\/v1\/scopes/,
  },
  {
    route: "/v1/scopes (POST)",
    py: /\/v1\/scopes/,
    ts: /\/v1\/scopes/,
    admin: /\/v1\/scopes/,
  },
  {
    route: "/v1/scopes/:scopeId/documents",
    py: /\/v1\/scopes\/\{scope_id\}\/documents/,
    ts: /\/documents/,
    admin: /\/documents/,
  },
  {
    route: "/v1/scopes/:scopeId/ingest",
    py: /\/v1\/scopes\/\{scope_id\}\/ingest/,
    ts: /\/ingest/,
    admin: /\/ingest/,
  },
  {
    route: "/v1/scopes/:scopeId/summary",
    py: /\/v1\/scopes\/\{scope_id\}\/summary/,
    ts: /\/summary/,
    admin: /\/summary/,
  },
  {
    route: "/v1/scopes/:scopeId/metrics",
    py: /\/v1\/scopes\/\{scope_id\}\/metrics/,
    ts: /\/metrics/,
    admin: /\/metrics/,
  },
  {
    route: "/v1/scopes/:scopeId/events",
    py: /\/v1\/scopes\/.*\/events/,
    ts: /\/v1\/scopes\/.*\/events/,
    admin: /\/scopes\/:scopeId\/events/,
  },
  {
    route: "/v1/scopes/:scopeId/reset",
    py: /\/v1\/scopes\/\{scope_id\}\/reset/,
    ts: /\/reset/,
    admin: /\/reset/,
  },
  {
    route: "/v1/runtime/start",
    py: /\/v1\/runtime\/start/,
    ts: /\/v1\/runtime\/start/,
    admin: /\/v1\/runtime\/start/,
  },
  {
    route: "/v1/runtime/pause",
    py: /\/v1\/runtime\/pause/,
    ts: /\/v1\/runtime\/pause/,
    admin: /\/v1\/runtime\/pause/,
  },
  {
    route: "/v1/runtime/resume",
    py: /\/v1\/runtime\/resume/,
    ts: /\/v1\/runtime\/resume/,
    admin: /\/v1\/runtime\/resume/,
  },
  {
    route: "/v1/runtime/stop",
    py: /\/v1\/runtime\/stop/,
    ts: /\/v1\/runtime\/stop/,
    admin: /\/v1\/runtime\/stop/,
  },
  {
    route: "/v1/runtime/restart",
    py: /\/v1\/runtime\/restart/,
    ts: /\/v1\/runtime\/restart/,
    admin: /\/v1\/runtime\/restart/,
  },
] as const;

describe.skipIf(!hasAllFiles)(
  "Smoke sync: open-swarm Python client vs sgrs admin proxy",
  () => {
    it("keeps control-plane route mapping aligned across Python/TS/proxy", async () => {
      const [pyText, tsText, adminText] = await Promise.all([
        readFile(OPEN_SWARM_PY_CLIENT, "utf8"),
        readFile(OPEN_SWARM_TS_CLIENT, "utf8"),
        readFile(SGRS_ADMIN_ROUTER, "utf8"),
      ]);

      for (const row of ROUTE_SYNC_MATRIX) {
        expect(
          pyText,
          `python client missing mapping for ${row.route}`,
        ).toMatch(row.py);
        expect(
          tsText,
          `ts client missing mapping for ${row.route}`,
        ).toMatch(row.ts);
        expect(
          adminText,
          `sgrs admin proxy missing mapping for ${row.route}`,
        ).toMatch(row.admin);
      }
    });
  },
);

