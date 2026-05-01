import { describe, expect, it, vi, afterEach } from "vitest";
import { Hono } from "hono";
import type { Db } from "@sgrs/db";
import { createIngestRouter } from "../routes/ingest.js";

function makeApp() {
  const app = new Hono();
  app.route("/api/ingest", createIngestRouter({} as Db));
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.SWARM_API_TOKEN;
  delete process.env.FEED_SERVER_URL;
});

describe("POST /api/ingest", () => {
  it("forwards document metadata and swarm bearer auth to the headless feed", async () => {
    process.env.SWARM_API_TOKEN = "swarm-secret";
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: true, seq: 42 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await makeApp().request("http://localhost/api/ingest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-ID": "acme",
      },
      body: JSON.stringify({
        scope_id: "deal-horizon",
        name: "Horizon ARR memo",
        type: "txt",
        text: "ARR grew, but renewals are disputed.",
        document_id: "doc_123",
        source: "upload",
        idempotency_key: "idem_123",
      }),
    });

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toMatchObject({
      scope_id: "deal-horizon",
      name: "Horizon ARR memo",
      type: "txt",
      document_id: "doc_123",
      idempotency_key: "idem_123",
      queued: true,
      seq: 42,
      integration_version: "v1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3002/context/docs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer swarm-secret",
          "Content-Type": "application/json",
          "Idempotency-Key": "idem_123",
          "X-SGRS-Integration-Version": "v1",
        }),
        body: JSON.stringify({
          scope_id: "deal-horizon",
          title: "Horizon ARR memo",
          type: "txt",
          text: "ARR grew, but renewals are disputed.",
          document_id: "doc_123",
          source: "upload",
          idempotency_key: "idem_123",
        }),
      }),
    );
  });

  it("surfaces feed failures as route errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));

    const res = await makeApp().request("http://localhost/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope_id: "deal-horizon",
        name: "Horizon ARR memo",
        text: "ARR grew.",
      }),
    });

    expect(res.status).toBe(500);
  });
});
