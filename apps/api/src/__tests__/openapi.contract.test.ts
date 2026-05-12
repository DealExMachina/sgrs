import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const OPENAPI_PATH = join(
  process.cwd(),
  "..",
  "..",
  "packages",
  "api-schema",
  "openapi.json",
);

type OpenApiDoc = {
  paths?: Record<string, Record<string, { operationId?: string; tags?: string[] }>>;
};

describe("OpenAPI canonical contract", () => {
  it("contains tier entrypoints and unique operationIds", async () => {
    const raw = await readFile(OPENAPI_PATH, "utf8");
    const doc = JSON.parse(raw) as OpenApiDoc;
    const paths = doc.paths ?? {};

    const requiredPaths = [
      "/api/health",
      "/api/ingest",
      "/admin/health",
      "/admin/control-plane/health",
      "/admin/tenants",
      "/admin/scopes",
      "/admin/scopes/{scopeId}/documents",
      "/admin/scopes/{scopeId}/ingest",
      "/admin/scopes/{scopeId}/summary",
      "/admin/scopes/{scopeId}/metrics",
      "/admin/scopes/{scopeId}/events",
      "/admin/scopes/{scopeId}/reset",
      "/admin/runtime/start",
      "/admin/runtime/pause",
      "/admin/runtime/resume",
      "/admin/runtime/stop",
      "/admin/runtime/restart",
      "/internals/health",
      "/internals/hatchery/snapshot",
      "/internals/events",
      "/internals/convergence",
      "/internals/control-plane/health",
      "/internals/kernel/health",
      "/internals/kernel/hatchery/snapshot",
      "/internals/kernel/events",
      "/internals/kernel/convergence",
      "/internals/kernel/control-plane/health",
      "/internals/kernel/runtime/start",
      "/internals/kernel/runtime/pause",
      "/internals/kernel/runtime/resume",
      "/internals/kernel/runtime/stop",
      "/internals/kernel/runtime/restart",
    ];
    for (const p of requiredPaths) {
      expect(paths[p], `missing OpenAPI path: ${p}`).toBeDefined();
    }

    const opIds: string[] = [];
    for (const pathItem of Object.values(paths)) {
      for (const op of Object.values(pathItem ?? {})) {
        if (op?.operationId) opIds.push(op.operationId);
      }
    }
    expect(opIds.length).toBeGreaterThan(0);
    expect(new Set(opIds).size).toBe(opIds.length);
  });
});
